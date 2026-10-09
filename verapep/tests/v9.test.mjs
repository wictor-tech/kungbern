import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVerapepServer } from '../server.mjs';
import { approveForSale } from './support/compliance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFiles = ['catalogue.json','commerce-policy.json','inventory.json','store-config.json','orders.json','returns.json','product-content.json','reviews.json','guide-config.json','support-kb.json','customers.json'];
async function jsonRequest(baseUrl, pathname, options={}) {
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers: { Accept:'application/json', ...(options.body?{'Content-Type':'application/json'}:{}), ...(options.headers||{}) } });
  const payload = await response.json().catch(()=>({}));
  return { response, payload };
}
async function start(dataDir) {
  const server = createVerapepServer({ rootDir: root, dataDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl:`http://127.0.0.1:${server.address().port}` };
}
async function stop(server) { await new Promise(resolve => server.close(resolve)); }

test('VERAPEP V9 database, dynamic products, permissions and resilient checkout', async t => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'verapep-v9-'));
  for (const name of dataFiles) await fsp.copyFile(path.join(root,'data',name), path.join(tempDir,name));
  t.after(async()=>fsp.rm(tempDir,{recursive:true,force:true}));

  let running = await start(tempDir);
  let { server, baseUrl } = running;

  const health = await jsonRequest(baseUrl, '/api/health');
  assert.equal(health.payload.version, '19.0.0');
  assert.equal(health.payload.database, 'SQLite');
  await fsp.stat(path.join(tempDir,'verapep.sqlite'));

  const store = (await jsonRequest(baseUrl,'/api/storefront')).payload;
  const product = store.products[2];
  await t.test('single dynamic product template serves new and legacy routes', async()=>{
    for (const pathname of [`/product/${product.id}`, `/shop/${product.id}.html`]) {
      const response = await fetch(`${baseUrl}${pathname}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /product-commerce\.js/);
      assert.match(html, /Loading product/);
    }
  });

  const login = await jsonRequest(baseUrl,'/api/admin/login',{method:'POST',body:JSON.stringify({email:'admin@verapep.local',password:'ChangeMe-123!'})});
  assert.equal(login.response.status,200);
  assert.equal(login.payload.role,'owner');
  const cookie=login.response.headers.get('set-cookie').split(';')[0];
  const ownerHeaders={Cookie:cookie,'X-CSRF-Token':login.payload.csrf};

  await t.test('owner can create restricted admin accounts and changes are audited', async()=>{
    const create=await jsonRequest(baseUrl,'/api/admin/users',{method:'POST',headers:ownerHeaders,body:JSON.stringify({email:'editor@verapep.local',displayName:'Content Editor',role:'editor',password:'EditorPass-123!',enabled:true})});
    assert.equal(create.response.status,201);
    const editorLogin=await jsonRequest(baseUrl,'/api/admin/login',{method:'POST',body:JSON.stringify({email:'editor@verapep.local',password:'EditorPass-123!'})});
    assert.equal(editorLogin.response.status,200);
    assert.equal(editorLogin.payload.role,'editor');
    const editorCookie=editorLogin.response.headers.get('set-cookie').split(';')[0];
    const editorHeaders={Cookie:editorCookie,'X-CSRF-Token':editorLogin.payload.csrf};
    const denied=await jsonRequest(baseUrl,'/api/admin/settings',{method:'PATCH',headers:editorHeaders,body:JSON.stringify({storeName:'Not allowed'})});
    assert.equal(denied.response.status,403);
    const allowed=await jsonRequest(baseUrl,`/api/admin/product-content/${encodeURIComponent(product.id)}`,{method:'PATCH',headers:editorHeaders,body:JSON.stringify({searchAliases:['test alias'],imageSrcset:'image-400.webp 400w'})});
    assert.equal(allowed.response.status,200);
    const audit=await jsonRequest(baseUrl,'/api/admin/audit',{headers:{Cookie:cookie}});
    assert.equal(audit.response.status,200);
    assert.ok(audit.payload.audit.some(entry=>entry.action==='admin_user.created'));
    assert.ok(audit.payload.audit.some(entry=>entry.action==='product.updated'));
  });

  await t.test('order creation is idempotent and inventory is reserved before payment', async()=>{
    await approveForSale(baseUrl,ownerHeaders,product.id);
    const enabled=await jsonRequest(baseUrl,`/api/admin/products/${encodeURIComponent(product.id)}/webshop`,{method:'POST',headers:ownerHeaders,body:JSON.stringify({enabled:true})});
    assert.equal(enabled.response.status,200);
    const refreshed=(await jsonRequest(baseUrl,'/api/storefront')).payload;
    const publicProduct=refreshed.products.find(item=>item.id===product.id);
    const variant=publicProduct.variants.find(item=>item.checkoutEnabled);
    assert.ok(variant);
    const beforeDash=(await jsonRequest(baseUrl,'/api/admin/dashboard',{headers:{Cookie:cookie}})).payload;
    const beforeStock=beforeDash.inventory.find(item=>item.variantId===variant.variantId);
    const body={items:[{variantId:variant.variantId,quantity:2}],customer:{name:'V9 Customer',email:'v9@example.com',phone:''},shippingAddress:{line1:'Testgatan 9',line2:'',city:'Stockholm',postalCode:'11122',country:'SE'},acceptTerms:true,acceptSandboxNotice:true,idempotencyKey:'v9-order-key'};
    const first=await jsonRequest(baseUrl,'/api/orders',{method:'POST',headers:{'Idempotency-Key':'v9-order-key'},body:JSON.stringify(body)});
    const second=await jsonRequest(baseUrl,'/api/orders',{method:'POST',headers:{'Idempotency-Key':'v9-order-key'},body:JSON.stringify(body)});
    assert.equal(first.response.status,201);
    assert.equal(second.response.status,200);
    assert.equal(first.payload.order.id,second.payload.order.id);
    const reservedDash=(await jsonRequest(baseUrl,'/api/admin/dashboard',{headers:{Cookie:cookie}})).payload;
    const reservedStock=reservedDash.inventory.find(item=>item.variantId===variant.variantId);
    assert.equal(reservedStock.onHand,beforeStock.onHand);
    assert.equal(reservedStock.reserved,beforeStock.reserved+2);
    const paid=await jsonRequest(baseUrl,`/api/orders/${encodeURIComponent(first.payload.order.id)}/payments/mock`,{method:'POST',body:JSON.stringify({token:first.payload.accessToken})});
    assert.equal(paid.response.status,200);
    const paidDash=(await jsonRequest(baseUrl,'/api/admin/dashboard',{headers:{Cookie:cookie}})).payload;
    const paidStock=paidDash.inventory.find(item=>item.variantId===variant.variantId);
    assert.equal(paidStock.onHand,beforeStock.onHand-2);
    assert.equal(paidStock.reserved,beforeStock.reserved);
  });

  await t.test('SQLite remains the source of truth after restart', async()=>{
    const updated=await jsonRequest(baseUrl,'/api/admin/settings',{method:'PATCH',headers:ownerHeaders,body:JSON.stringify({storeName:'VERAPEP Persistent'})});
    assert.equal(updated.response.status,200);
    await stop(server);
    running=await start(tempDir); server=running.server; baseUrl=running.baseUrl;
    const after=(await jsonRequest(baseUrl,'/api/storefront')).payload;
    assert.equal(after.config.storeName,'VERAPEP Persistent');
  });

  await stop(server);
});
