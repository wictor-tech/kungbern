import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve(process.cwd());
const dataDir = path.resolve(process.env.DATA_DIR || path.join(rootDir, 'data'));
const outboxDir = path.join(dataDir, 'outbox');
const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
const includeStored = String(process.env.EMAIL_RETRY_INCLUDE_STORED || '').toLowerCase() === 'true';
const ack = String(process.env.EMAIL_RETRY_ACK || '');
const requiredAck = 'I_UNDERSTAND_THIS_RETRIES_TRANSACTIONAL_EMAIL';

if (String(process.env.EMAIL_DELIVERY_MODE || '').toLowerCase() !== 'webhook') {
  throw new Error('EMAIL_DELIVERY_MODE must be webhook before retrying transactional email.');
}
if (!webhookUrl) throw new Error('EMAIL_WEBHOOK_URL is required.');
if (ack !== requiredAck) throw new Error(`Set EMAIL_RETRY_ACK=${requiredAck} to confirm the retry operation.`);
if (!fs.existsSync(outboxDir)) {
  console.log('No outbox directory exists. Nothing to retry.');
  process.exit(0);
}

const files = (await fsp.readdir(outboxDir)).filter(name => name.endsWith('.json')).sort();
let attempted = 0;
let accepted = 0;
let skipped = 0;
let failed = 0;

for (const file of files) {
  const filePath = path.join(outboxDir, file);
  let message;
  try { message = JSON.parse(await fsp.readFile(filePath, 'utf8')); }
  catch { skipped += 1; continue; }
  const retryable = message.deliveryStatus === 'failed' || (includeStored && message.deliveryStatus === 'stored');
  if (!retryable) { skipped += 1; continue; }

  attempted += 1;
  const payload = { ...message, delivery: 'webhook', retryAttemptedAt: new Date().toISOString() };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.EMAIL_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN}` } : {}),
        'Idempotency-Key': `verapep-email-${message.id}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`Email webhook returned HTTP ${response.status}`);
    message.delivery = 'webhook';
    message.deliveryStatus = 'accepted';
    message.deliveredAt = new Date().toISOString();
    message.retryCount = Number(message.retryCount || 0) + 1;
    delete message.deliveryError;
    accepted += 1;
  } catch (error) {
    message.delivery = 'webhook';
    message.deliveryStatus = 'failed';
    message.retryCount = Number(message.retryCount || 0) + 1;
    message.lastRetryAt = new Date().toISOString();
    message.deliveryError = String(error?.message || error).slice(0, 300);
    failed += 1;
  }
  await fsp.writeFile(filePath, `${JSON.stringify(message, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ outboxDir, attempted, accepted, failed, skipped }, null, 2));
if (failed) process.exitCode = 2;
