import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVerapepServer } from '../server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFiles = ['catalogue.json','commerce-policy.json','inventory.json','store-config.json','orders.json','returns.json','product-content.json','reviews.json','guide-config.json','support-kb.json','customers.json'];

async function jsonRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

test('VERAPEP V11 complete storefront and admin regression', async t => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'verapep-v11-'));
  for (const name of dataFiles) await fsp.copyFile(path.join(root, 'data', name), path.join(tempDir, name));
  const server = createVerapepServer({ rootDir: root, dataDir: tempDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('V11 homepage activates its design and interactions', async () => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /theme-v11/);
    // v16 serves the layered stylesheets as one ordered bundle; v11 must be part of it.
    assert.match(html, /assets\/bundle-storefront\.css/);
    const bundle = await fsp.readFile(path.join(root, 'assets', 'bundle-storefront.css'), 'utf8');
    assert.match(bundle, /\/\* v11\.css \*\//);
    assert.match(html, /assets\/v11-ui\.js/);
    assert.match(html, /A catalogue built<br\/>on transparency\./);
    const appSource = await fsp.readFile(path.join(root, 'assets', 'app.js'), 'utf8');
    assert.match(appSource, /state\.focuses\].*every/s);
  });

  const storefront = (await jsonRequest(baseUrl, '/api/storefront')).payload;

  await t.test('all public products and every legacy product URL open', async () => {
    assert.equal(storefront.products.length, 84);
    assert.equal(storefront.products.flatMap(product => product.variants).length, 170);
    assert.equal(new Set(storefront.products.map(product => product.id)).size, storefront.products.length);
    assert.equal(new Set(storefront.products.flatMap(product => product.variants.map(variant => variant.variantId))).size, 170);

    for (const product of storefront.products) {
      assert.ok(product.name, `${product.id} is missing a name`);
      assert.ok(Array.isArray(product.variants) && product.variants.length > 0, `${product.id} has no variants`);
      for (const pathname of [`/product/${encodeURIComponent(product.id)}`, `/shop/${encodeURIComponent(product.id)}.html`]) {
        const response = await fetch(`${baseUrl}${pathname}`);
        assert.equal(response.status, 200, pathname);
        assert.match(response.headers.get('content-type') || '', /text\/html/, pathname);
        const html = await response.text();
        assert.match(html, /product-commerce\.js/, pathname);
        assert.match(html, /Loading product/, pathname);
      }
    }
  });

  await t.test('guide and Ask Vera services return usable responses', async () => {
    const guide = await jsonRequest(baseUrl, '/api/guide/recommendations', {
      method: 'POST',
      body: JSON.stringify({ focuses: ['skin-appearance'], needs: [], priorities: [] })
    });
    assert.equal(guide.response.status, 200);
    assert.ok(Array.isArray(guide.payload.products));
    assert.ok(guide.payload.products.length > 0);

    const support = await jsonRequest(baseUrl, '/api/support/ask', {
      method: 'POST',
      body: JSON.stringify({ question: 'How long is delivery?' })
    });
    assert.equal(support.response.status, 200);
    assert.match(support.payload.answer, /7.?10 days/i);
  });

  await t.test('customer-facing pages and referenced local assets are available', async () => {
    for (const pathname of ['/admin.html','/guide.html','/support.html','/my-pages.html','/checkout.html','/order.html','/product.html']) {
      const response = await fetch(`${baseUrl}${pathname}`);
      assert.equal(response.status, 200, pathname);
    }
    for (const asset of ['/assets/v11.css','/assets/v11-ui.js','/assets/app.js','/assets/cart.js','/assets/product-commerce.js','/assets/media/liquid-hero-poster.webp','/assets/media/vera-guide.svg']) {
      const response = await fetch(`${baseUrl}${asset}`);
      assert.equal(response.status, 200, asset);
    }
  });

  await t.test('admin login, dashboard, product editing and inventory data work', async () => {
    const adminPage = await fetch(`${baseUrl}/admin.html`);
    const adminHtml = await adminPage.text();
    for (const requiredId of ['admin-login-form','admin-dashboard','admin-products','product-editor','admin-inventory','settings-form','admin-audit']) {
      assert.match(adminHtml, new RegExp(`id=["']${requiredId}["']`));
    }

    const login = await jsonRequest(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@verapep.local', password: 'ChangeMe-123!' })
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.payload.role, 'owner');
    const cookie = login.response.headers.get('set-cookie').split(';')[0];
    const auth = { Cookie: cookie, 'X-CSRF-Token': login.payload.csrf };

    const dashboard = await jsonRequest(baseUrl, '/api/admin/dashboard', { headers: { Cookie: cookie } });
    assert.equal(dashboard.response.status, 200);
    assert.equal(dashboard.payload.products.length, 84);
    assert.equal(dashboard.payload.inventory.length, 170);

    const product = storefront.products[0];
    const originalDescription = product.content?.shortDescription || '';
    const updatedDescription = `V11 regression ${Date.now()}`;
    const update = await jsonRequest(baseUrl, `/api/admin/product-content/${encodeURIComponent(product.id)}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ shortDescription: updatedDescription })
    });
    assert.equal(update.response.status, 200);

    const refreshed = (await jsonRequest(baseUrl, '/api/storefront')).payload;
    assert.equal(refreshed.products.find(item => item.id === product.id).content.shortDescription, updatedDescription);

    const restore = await jsonRequest(baseUrl, `/api/admin/product-content/${encodeURIComponent(product.id)}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ shortDescription: originalDescription })
    });
    assert.equal(restore.response.status, 200);
  });
});
