import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVerapepServer } from '../server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFiles = ['catalogue.json','commerce-policy.json','inventory.json','store-config.json','orders.json','returns.json','withdrawals.json','product-content.json','reviews.json','guide-config.json','support-kb.json','customers.json'];

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(value || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, now = Date.now()) {
  const key = decodeBase32(secret);
  const counter = Math.floor(now / 30000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', key).update(buffer).digest();
  const position = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[position] & 0x7f) << 24) | (digest[position + 1] << 16) | (digest[position + 2] << 8) | digest[position + 3];
  return String(binary % 1_000_000).padStart(6, '0');
}

async function jsonRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { Accept:'application/json', ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

test('VERAPEP V14.1 operational hardening', async t => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'verapep-v141-'));
  for (const name of dataFiles) await fsp.copyFile(path.join(root, 'data', name), path.join(tempDir, name));
  const server = createVerapepServer({ rootDir: root, dataDir: tempDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fsp.rm(tempDir, { recursive:true, force:true }); });

  const login = await jsonRequest(baseUrl, '/api/admin/login', { method:'POST', body:JSON.stringify({ email:'admin@verapep.local', password:'ChangeMe-123!' }) });
  assert.equal(login.response.status, 200);
  let cookie = login.response.headers.get('set-cookie').split(';')[0];
  let authHeaders = { Cookie:cookie, 'X-CSRF-Token':login.payload.csrf };

  await t.test('dashboard exposes operational queues and privacy permission', async () => {
    const dashboard = await jsonRequest(baseUrl, '/api/admin/dashboard', { headers:{ Cookie:cookie } });
    assert.equal(dashboard.response.status, 200);
    assert.ok(dashboard.payload.orderQueues);
    for (const key of ['awaitingPayment','toPack','readyToShip','inTransit','completed','attention']) assert.equal(typeof dashboard.payload.orderQueues[key], 'number');
    assert.ok(dashboard.payload.permissions.includes('privacy'));
    assert.equal(dashboard.payload.currentUser.mfaEnabled, false);
  });

  let secret;
  let recoveryCodes;
  await t.test('admin can enroll per-user TOTP and receives one-time recovery codes', async () => {
    const setup = await jsonRequest(baseUrl, '/api/admin/me/mfa/setup', { method:'POST', headers:authHeaders, body:'{}' });
    assert.equal(setup.response.status, 200);
    assert.match(setup.payload.secret, /^[A-Z2-7]+$/);
    assert.match(setup.payload.otpauthUri, /^otpauth:\/\/totp\//);
    secret = setup.payload.secret;
    const confirm = await jsonRequest(baseUrl, '/api/admin/me/mfa/confirm', { method:'POST', headers:authHeaders, body:JSON.stringify({ code:totp(secret) }) });
    assert.equal(confirm.response.status, 200);
    assert.equal(confirm.payload.enabled, true);
    assert.equal(confirm.payload.recoveryCodes.length, 8);
    recoveryCodes = confirm.payload.recoveryCodes;
    assert.ok(recoveryCodes.every(code => /^VP-[A-F0-9]{5}-[A-F0-9]{5}$/.test(code)));
    const dashboard = await jsonRequest(baseUrl, '/api/admin/dashboard', { headers:{ Cookie:cookie } });
    assert.equal(dashboard.payload.currentUser.mfaEnabled, true);
    assert.equal(dashboard.payload.users[0].mfaEnabled, true);
  });

  await t.test('subsequent login requires TOTP or a recovery code', async () => {
    await jsonRequest(baseUrl, '/api/admin/logout', { method:'POST', headers:{ Cookie:cookie } });
    const without = await jsonRequest(baseUrl, '/api/admin/login', { method:'POST', body:JSON.stringify({ email:'admin@verapep.local', password:'ChangeMe-123!' }) });
    assert.equal(without.response.status, 401);
    assert.equal(without.payload.error, 'invalid_mfa');

    const firstCode = totp(secret);
    const withTotp = await jsonRequest(baseUrl, '/api/admin/login', { method:'POST', body:JSON.stringify({ email:'admin@verapep.local', password:'ChangeMe-123!', mfaCode:firstCode }) });
    assert.equal(withTotp.response.status, 200);
    cookie = withTotp.response.headers.get('set-cookie').split(';')[0];
    authHeaders = { Cookie:cookie, 'X-CSRF-Token':withTotp.payload.csrf };

    await jsonRequest(baseUrl, '/api/admin/logout', { method:'POST', headers:{ Cookie:cookie } });
    const withRecovery = await jsonRequest(baseUrl, '/api/admin/login', { method:'POST', body:JSON.stringify({ email:'admin@verapep.local', password:'ChangeMe-123!', mfaCode:recoveryCodes[0] }) });
    assert.equal(withRecovery.response.status, 200);
    assert.equal(withRecovery.payload.mfaMethod, 'recovery_code');
    cookie = withRecovery.response.headers.get('set-cookie').split(';')[0];
    authHeaders = { Cookie:cookie, 'X-CSRF-Token':withRecovery.payload.csrf };

    await jsonRequest(baseUrl, '/api/admin/logout', { method:'POST', headers:{ Cookie:cookie } });
    const reusedRecovery = await jsonRequest(baseUrl, '/api/admin/login', { method:'POST', body:JSON.stringify({ email:'admin@verapep.local', password:'ChangeMe-123!', mfaCode:recoveryCodes[0] }) });
    assert.equal(reusedRecovery.response.status, 401);

    // v20: an authenticator code is accepted only once. Re-using the code from the login above is
    // refused, so the re-login uses the next 30-second code (accepted by the ±1 step tolerance).
    const replayed = await jsonRequest(baseUrl, '/api/admin/login', { method:'POST', body:JSON.stringify({ email:'admin@verapep.local', password:'ChangeMe-123!', mfaCode:firstCode }) });
    assert.equal(replayed.response.status, 401, 'a used authenticator code cannot be replayed');
    const relogin = await jsonRequest(baseUrl, '/api/admin/login', { method:'POST', body:JSON.stringify({ email:'admin@verapep.local', password:'ChangeMe-123!', mfaCode:totp(secret, Date.now() + 30000) }) });
    cookie = relogin.response.headers.get('set-cookie').split(';')[0];
    authHeaders = { Cookie:cookie, 'X-CSRF-Token':relogin.payload.csrf };
  });

  await t.test('privacy customer export is permission-gated and read-only', async () => {
    const invalid = await jsonRequest(baseUrl, '/api/admin/privacy/customer-export?email=bad', { headers:{ Cookie:cookie } });
    assert.equal(invalid.response.status, 400);
    const exported = await jsonRequest(baseUrl, '/api/admin/privacy/customer-export?email=nobody%40example.com', { headers:{ Cookie:cookie } });
    assert.equal(exported.response.status, 200);
    assert.equal(exported.payload.subject, 'nobody@example.com');
    assert.deepEqual(exported.payload.orders, []);
    assert.deepEqual(exported.payload.returns, []);
    assert.deepEqual(exported.payload.withdrawals, []);
  });
});
