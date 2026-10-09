import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createVerapepServer } from '../server.mjs';
import { BUNDLES, buildBundle } from '../scripts/build-css.mjs';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFiles = ['catalogue.json','commerce-policy.json','inventory.json','store-config.json','orders.json','returns.json','withdrawals.json','product-content.json','reviews.json','guide-config.json','support-kb.json','customers.json'];

test('VERAPEP V16 release checks', async t => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'verapep-v16-'));
  for (const name of dataFiles) await fsp.copyFile(path.join(root, 'data', name), path.join(tempDir, name));
  const server = createVerapepServer({ rootDir: root, dataDir: tempDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fsp.rm(tempDir, { recursive: true, force: true }); });

  await t.test('CSS bundles are built from the current sources', async () => {
    for (const name of Object.keys(BUNDLES)) {
      const current = await fsp.readFile(path.join(root, 'assets', name), 'utf8');
      assert.equal(current, buildBundle(name), `${name} is stale — run npm run build:css`);
    }
  });

  await t.test('every page links exactly one bundle and no individual layer', async () => {
    const pages = (await fsp.readdir(root)).filter(name => name.endsWith('.html'));
    assert.ok(pages.length >= 12);
    for (const page of pages) {
      const html = await fsp.readFile(path.join(root, page), 'utf8');
      const sheets = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]);
      assert.equal(sheets.length, 1, `${page} should load one stylesheet`);
      assert.match(sheets[0], /bundle-(storefront|pages|admin)\.css/, page);
    }
  });

  await t.test('pages get a branded 404 while assets and data stay plain', async () => {
    for (const pathname of ['/missing', '/a/b/missing.html', '/product/not-a-product']) {
      const response = await fetch(`${baseUrl}${pathname}`);
      assert.equal(response.status, 404, pathname);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(await response.text(), /This page could not be found/);
    }
    for (const pathname of ['/assets/missing.js', '/data/orders.json']) {
      const response = await fetch(`${baseUrl}${pathname}`);
      assert.equal(response.status, 404, pathname);
      assert.match(response.headers.get('content-type'), /text\/plain/);
    }
  });

  await t.test('large JSON responses are compressed without changing the payload', async () => {
    const plain = await fetch(`${baseUrl}/api/storefront`, { headers: { 'Accept-Encoding': 'identity' } });
    const plainJson = await plain.json();
    const raw = await new Promise((resolve, reject) => {
      import('node:http').then(({ default: http }) => {
        http.get(`${baseUrl}/api/storefront`, { headers: { 'Accept-Encoding': 'br' } }, res => {
          const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
        }).on('error', reject);
      });
    });
    assert.equal(raw.headers['content-encoding'], 'br');
    assert.ok(raw.body.length < 30000, `compressed storefront is ${raw.body.length} bytes`);
    assert.deepEqual(JSON.parse(zlib.brotliDecompressSync(raw.body).toString('utf8')).products.length, plainJson.products.length);
  });

  await t.test('legal information pages use configured data and mark pending review', async () => {
    for (const page of ['privacy.html', 'terms.html', 'shipping-returns.html']) {
      const response = await fetch(`${baseUrl}/${page}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /Pending legal review/);
      assert.match(html, /assets\/legal\.js/);
    }
    const legal = await (await fetch(`${baseUrl}/api/legal`)).json();
    assert.ok(legal.supportEmail);
  });

  await t.test('product page never fabricates information', async () => {
    const source = await fsp.readFile(path.join(root, 'assets', 'product-commerce.js'), 'utf8');
    assert.match(source, /has not been published/);
    assert.doesNotMatch(source, /\balert\(/);
    const content = JSON.parse(await fsp.readFile(path.join(root, 'data', 'product-content.json'), 'utf8'));
    const reviews = JSON.parse(await fsp.readFile(path.join(root, 'data', 'reviews.json'), 'utf8'));
    assert.equal(reviews.reviews.length, 0, 'no seeded reviews');
    for (const item of Object.values(content.products || content)) {
      for (const report of item.labReports || []) assert.ok(report.published === true && report.url, `${item.productId} report must be published with a URL`);
    }
  });

  await t.test('backup script writes a verified SQLite copy', async () => {
    const backupDir = path.join(tempDir, 'backups');
    const { stdout } = await run(process.execPath, ['--no-warnings', path.join(root, 'scripts', 'backup-sqlite.mjs')], { env: { ...process.env, DATA_DIR: tempDir, BACKUP_DIR: backupDir } });
    assert.match(stdout, /integrity_check: ok/);
    const files = await fsp.readdir(backupDir);
    assert.equal(files.length, 1);
  });

  await t.test('no live commerce was unlocked', async () => {
    const storefront = await (await fetch(`${baseUrl}/api/storefront`)).json();
    const orderable = storefront.products.filter(product => product.variants.some(variant => variant.checkoutEnabled));
    assert.equal(orderable.length, 0);
    const ready = await (await fetch(`${baseUrl}/api/ready`)).json();
    assert.equal(ready.ready, false);
  });
});
