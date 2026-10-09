/* VERAPEP load test (v20). Reproducible, isolated: starts its own server on a temporary copy of
   data/, never touches production. Measures latency percentiles, errors and server memory.

   node tests/load/load-test.mjs              full run (~1 min)
   LOAD_QUICK=1 node tests/load/load-test.mjs smaller run */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quick = process.env.LOAD_QUICK === '1';
const results = [];

async function startServer() {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'verapep-load-'));
  for (const name of fs.readdirSync(path.join(root, 'data')).filter(file => file.endsWith('.json'))) await fsp.copyFile(path.join(root, 'data', name), path.join(dataDir, name));
  const port = 46000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: root, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, APP_ENV: 'test', ADMIN_PASSWORD: 'ChangeMe-123!' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i += 1) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(resolve => setTimeout(resolve, 100)); }
  return { child, base, dataDir };
}

const rss = pid => { try { return Number(fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1]) / 1024; } catch { return null; } };
const pct = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p / 100 * sorted.length))] : 0; };

async function scenario(name, total, concurrency, makeRequest) {
  const times = []; const statuses = {}; let next = 0;
  const started = performance.now();
  async function worker() {
    while (next < total) {
      const index = next++;
      const t0 = performance.now();
      let status;
      try { const response = await makeRequest(index); status = response.status; await response.arrayBuffer(); } catch (error) { status = `ERR:${error.cause?.code || error.name}`; }
      times.push(performance.now() - t0);
      statuses[status] = (statuses[status] || 0) + 1;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const seconds = (performance.now() - started) / 1000;
  const row = { scenario: name, requests: total, concurrency, p50: +pct(times, 50).toFixed(1), p95: +pct(times, 95).toFixed(1), max: +Math.max(...times).toFixed(1), perSecond: +(total / seconds).toFixed(0), statuses };
  results.push(row);
  console.log(`${name.padEnd(42)} n=${String(total).padEnd(4)} c=${String(concurrency).padEnd(3)} p50=${row.p50}ms p95=${row.p95}ms max=${row.max}ms ${row.perSecond}/s ${JSON.stringify(statuses)}`);
  return row;
}

const { child, base, dataDir } = await startServer();
try {
  const memoryStart = rss(child.pid);
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@verapep.local', password: 'ChangeMe-123!' }) });
  const session = { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': (await login.json()).csrf, 'Content-Type': 'application/json' };
  const n = quick ? 0.25 : 1;

  await scenario('Public storefront (/api/storefront)', 400 * n, 40, () => fetch(`${base}/api/storefront`, { headers: { 'Accept-Encoding': 'br' } }));
  await scenario('Product page HTML', 400 * n, 40, () => fetch(`${base}/product/aicar-025`));
  const questions = ['How long does delivery take?', 'hur lång är leveranstiden', 'what is kpv', 'do you ship to sweden', 'how do I dose bpc', 'leverns tid', 'Tell me about AICAR', 'privacy'];
  await scenario('Ask Vera, parallel visitors (distinct IPs)', 400 * n, 50, index => fetch(`${base}/api/support/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: questions[index % questions.length] }) }));
  await scenario('Ask Vera, one visitor flooding (rate limit)', 60, 10, () => fetch(`${base}/api/support/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'delivery' }) }));
  await scenario('Admin overview (84 products)', 100 * n, 10, () => fetch(`${base}/api/admin/overview`, { headers: session }));
  await scenario('Admin product list (84 summaries)', 100 * n, 10, () => fetch(`${base}/api/admin/workspace/products`, { headers: session }));
  await scenario('Admin product workspace', 100 * n, 10, index => fetch(`${base}/api/admin/products/kpv-071/workspace`, { headers: session }));
  await scenario('Admin dashboard', 50 * n, 5, () => fetch(`${base}/api/admin/dashboard`, { headers: session }));
  await scenario('Concurrent logins (same address, rate-limited)', 30, 10, () => fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@verapep.local', password: 'ChangeMe-123!' }) }));

  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024, 32), Buffer.from('\n%%EOF\n')]);
  await scenario('Document upload 5 MB (parallel)', quick ? 4 : 12, 4, index => fetch(`${base}/api/admin/products/kpv-071/documents`, { method: 'POST', headers: { ...session, 'Content-Type': 'application/octet-stream', 'X-Document-Kind': 'lab_report', 'X-Document-Title': `Load test ${index}` }, body: pdf }));

  const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalogue.json'), 'utf8')).products.map(product => product.id);
  const rows = Array.from({ length: 200 }, (_, index) => ({ productId: catalogue[index % catalogue.length], storage: `Store at -20 °C (load row ${index})`, source: 'load test' }));
  const unique = [...new Map(rows.map(row => [row.productId, row])).values()];
  const importBody = JSON.stringify({ format: 'json', content: JSON.stringify(rows), filename: 'load.json' });
  await scenario('Import preview, 200 rows', 5, 1, () => fetch(`${base}/api/admin/import/preview`, { method: 'POST', headers: session, body: importBody }));
  await scenario('Import apply, 84 valid of 200 rows', 1, 1, () => fetch(`${base}/api/admin/import/apply`, { method: 'POST', headers: session, body: JSON.stringify({ format: 'json', content: JSON.stringify(unique), filename: 'load.json', confirmCount: unique.length }) }));
  await scenario('Admin product list after 84 drafts', 50 * n, 10, () => fetch(`${base}/api/admin/workspace/products`, { headers: session }));
  await scenario('Review queue with 84 drafts', 50 * n, 10, () => fetch(`${base}/api/admin/review-queue`, { headers: session }));

  // Network interruption: an upload aborted half-way must not leave a stored file or a record.
  const before = fs.existsSync(path.join(dataDir, 'documents')) ? fs.readdirSync(path.join(dataDir, 'documents')).length : 0;
  const controller = new AbortController();
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(pdf.subarray(0, 1024 * 1024))); setTimeout(() => controller.abort(), 150); } });
  await fetch(`${base}/api/admin/products/kpv-071/documents`, { method: 'POST', headers: { ...session, 'Content-Type': 'application/octet-stream', 'X-Document-Kind': 'lab_report', 'X-Document-Title': 'Aborted upload' }, body: stream, duplex: 'half', signal: controller.signal }).catch(() => null);
  await new Promise(resolve => setTimeout(resolve, 400));
  const after = fs.existsSync(path.join(dataDir, 'documents')) ? fs.readdirSync(path.join(dataDir, 'documents')).length : 0;
  const healthy = (await fetch(`${base}/api/health`)).ok;
  console.log(`Aborted upload: files before=${before} after=${after} (orphan=${after > before}); server healthy afterwards=${healthy}`);
  results.push({ scenario: 'Aborted upload', orphanFiles: after - before, healthyAfter: healthy });

  const memoryEnd = rss(child.pid);
  console.log(`Server memory (RSS): start ${memoryStart?.toFixed(0)} MB, end ${memoryEnd?.toFixed(0)} MB`);
  results.push({ scenario: 'Memory', startMb: memoryStart, endMb: memoryEnd });
  if (process.env.LOAD_OUT) fs.writeFileSync(process.env.LOAD_OUT, JSON.stringify(results, null, 2));
} finally {
  child.kill();
}
