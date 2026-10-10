import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { approveForSale } from './support/compliance.mjs';
import { createVerapepServer } from '../server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFiles = ['catalogue.json','commerce-policy.json','inventory.json','store-config.json','orders.json','returns.json','withdrawals.json','product-content.json','reviews.json','guide-config.json','support-kb.json','customers.json'];
async function jsonRequest(baseUrl, pathname, options={}) {
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers: { Accept:'application/json', ...(options.body?{'Content-Type':'application/json'}:{}), ...(options.headers||{}) } });
  const payload = await response.json().catch(()=>({}));
  return { response, payload };
}

test('VERAPEP V14 production-readiness protections', async t => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(),'verapep-v14-'));
  for (const name of dataFiles) await fsp.copyFile(path.join(root,'data',name),path.join(tempDir,name));
  const server = createVerapepServer({ rootDir:root, dataDir:tempDir });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{ await new Promise(resolve=>server.close(resolve)); await fsp.rm(tempDir,{recursive:true,force:true}); });

  await t.test('preview is healthy but correctly fails production readiness', async () => {
    const health = await jsonRequest(baseUrl,'/api/health');
    assert.equal(health.response.status,200);
    assert.equal(health.payload.version,'21.0.0');
    assert.equal(health.payload.products,40); // v17 preview gate: 84 in catalogue, 44 high-risk hidden
    const ready = await jsonRequest(baseUrl,'/api/ready');
    assert.equal(ready.response.status,503);
    assert.equal(ready.payload.ready,false);
    assert.ok(ready.payload.blockers.length >= 5);
    assert.equal(ready.payload.liveApprovedProducts,0);
  });

  await t.test('legal API and admin auth configuration are explicit', async () => {
    const legal = await jsonRequest(baseUrl,'/api/legal');
    assert.equal(legal.response.status,200);
    assert.equal(legal.payload.termsVersion,'preview-v14.1');
    const auth = await jsonRequest(baseUrl,'/api/admin/auth-config');
    assert.equal(auth.response.status,200);
    assert.equal(auth.payload.mfaRequired,false);
  });

  const storefront = (await jsonRequest(baseUrl,'/api/storefront')).payload;
  const product = storefront.products[0];
  const variant = product.variants[0];
  const login = await jsonRequest(baseUrl,'/api/admin/login',{method:'POST',body:JSON.stringify({email:'admin@verapep.local',password:'ChangeMe-123!'})});
  assert.equal(login.response.status,200);
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  const authHeaders = { Cookie:cookie, 'X-CSRF-Token':login.payload.csrf };

  await t.test('order stores legal-version snapshot and withdrawal notice is duplicate-safe', async () => {
    await approveForSale(baseUrl,authHeaders,product.id);
    const enabled = await jsonRequest(baseUrl,`/api/admin/products/${encodeURIComponent(product.id)}/webshop`,{method:'POST',headers:authHeaders,body:JSON.stringify({enabled:true})});
    assert.equal(enabled.response.status,200);
    const chosenVariant = enabled.payload.product.variants.find(item=>item.checkoutEnabled) || variant;
    const created = await jsonRequest(baseUrl,'/api/orders',{method:'POST',body:JSON.stringify({
      items:[{variantId:chosenVariant.variantId,quantity:1}],
      shippingMethodId:'europe-standard',
      customer:{name:'V14 Customer',email:'v14@example.com',phone:''},
      shippingAddress:{line1:'Testgatan 14',line2:'',city:'Stockholm',postalCode:'11122',country:'SE'},
      acceptTerms:true,acceptSandboxNotice:true
    })});
    assert.equal(created.response.status,201);
    assert.equal(created.payload.order.termsVersion,'preview-v14.1');
    assert.equal(created.payload.order.privacyVersion,'preview-v14.1');
    assert.ok(created.payload.order.legalAcceptedAt);
    const orderId = created.payload.order.id;
    const token = created.payload.accessToken;
    const first = await jsonRequest(baseUrl,`/api/orders/${encodeURIComponent(orderId)}/withdrawal`,{method:'POST',body:JSON.stringify({token,confirm:true,note:'V14 withdrawal test'})});
    assert.equal(first.response.status,201);
    assert.equal(first.payload.duplicate,undefined);
    const second = await jsonRequest(baseUrl,`/api/orders/${encodeURIComponent(orderId)}/withdrawal`,{method:'POST',body:JSON.stringify({token,confirm:true})});
    assert.equal(second.response.status,200);
    assert.equal(second.payload.duplicate,true);
    assert.equal(second.payload.withdrawal.id,first.payload.withdrawal.id);
  });

  await t.test('mock payments remain preview-only and static text can be compressed', async () => {
    const response = await fetch(`${baseUrl}/assets/v14-production-readiness.css`, { headers:{'Accept-Encoding':'br, gzip'} });
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/text\/css/);
    assert.ok(['br','gzip',null].includes(response.headers.get('content-encoding')));
  });

  await t.test('new policy pages are served', async () => {
    for (const pathname of ['/privacy.html','/terms.html','/shipping-returns.html']) {
      const response = await fetch(`${baseUrl}${pathname}`);
      assert.equal(response.status,200,pathname);
      assert.match(response.headers.get('content-type'),/text\/html/);
    }
  });
});
