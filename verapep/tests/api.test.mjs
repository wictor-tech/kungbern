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
async function jsonRequest(baseUrl, pathname, options={}) { const response=await fetch(`${baseUrl}${pathname}`,{...options,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}}); const payload=await response.json().catch(()=>({})); return {response,payload}; }

test('VERAPEP V8 webshop, liquid frontend and admin synchronisation', async t => {
  const tempDir=await fsp.mkdtemp(path.join(os.tmpdir(),'verapep-v5-'));
  for(const name of dataFiles) await fsp.copyFile(path.join(root,'data',name),path.join(tempDir,name));
  const server=createVerapepServer({rootDir:root,dataDir:tempDir}); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const baseUrl=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fsp.rm(tempDir,{recursive:true,force:true});});

  let store=(await jsonRequest(baseUrl,'/api/storefront')).payload;
  await t.test('storefront starts in admin-controlled test webshop mode', async()=>{
    const health=await jsonRequest(baseUrl,'/api/health'); assert.equal(health.response.status,200); assert.equal(health.payload.mode,'sandbox'); // v17: the preview publication gate hides 44 high-risk products until reviewed (84 in the catalogue).
    assert.equal(health.payload.products,40); assert.equal(health.payload.variants,store.products.flatMap(p=>p.variants).length);
    assert.equal(store.config.currency,'EUR'); assert.equal(store.config.checkoutMode,'sandbox'); assert.equal(store.products.length,40); assert.equal(store.productCount,40);
    assert.ok(store.products.every(p=>p.commerce.checkoutEnabled===false)); assert.ok(Number.isInteger(store.revision));
  });

  await t.test('multi-goal guide combines products with OR logic', async()=>{
    const result=await jsonRequest(baseUrl,'/api/guide/recommendations',{method:'POST',body:JSON.stringify({focuses:['weight-metabolism','strength-recovery'],needs:[],priorities:[]})});
    assert.equal(result.response.status,200); assert.ok(result.payload.products.length>0);
    assert.ok(result.payload.products.every(p=>['weight-metabolism','strength-recovery'].some(goal=>(p.content.discoveryGoals||[]).includes(goal))));
    assert.ok(result.payload.products.some(p=>(p.content.discoveryGoals||[]).includes('weight-metabolism')));
    assert.ok(result.payload.products.some(p=>(p.content.discoveryGoals||[]).includes('strength-recovery')));
  });

  const login=await jsonRequest(baseUrl,'/api/admin/login',{method:'POST',body:JSON.stringify({email:'admin@verapep.local',password:'ChangeMe-123!'})});
  assert.equal(login.response.status,200); const cookie=login.response.headers.get('set-cookie').split(';')[0]; const csrf=login.payload.csrf; const auth={Cookie:cookie,'X-CSRF-Token':csrf};
  const product=store.products[0]; const variant=product.variants[0];

  await t.test('one-click admin action enables and disables an eligible product', async()=>{
    const quickProduct=store.products[1];
    await approveForSale(baseUrl,auth,quickProduct.id);
    const enabled=await jsonRequest(baseUrl,`/api/admin/products/${encodeURIComponent(quickProduct.id)}/webshop`,{method:'POST',headers:auth,body:JSON.stringify({enabled:true})});
    assert.equal(enabled.response.status,200); assert.equal(enabled.payload.enabled,true); assert.ok(enabled.payload.enabledVariants.length>0);
    let current=(await jsonRequest(baseUrl,'/api/storefront')).payload; const publicProduct=current.products.find(p=>p.id===quickProduct.id);
    assert.equal(publicProduct.commerce.checkoutEnabled,true); assert.ok(publicProduct.variants.some(v=>v.checkoutEnabled)); assert.ok(publicProduct.content.allowedCountries.length>0);
    const disabled=await jsonRequest(baseUrl,`/api/admin/products/${encodeURIComponent(quickProduct.id)}/webshop`,{method:'POST',headers:auth,body:JSON.stringify({enabled:false})});
    assert.equal(disabled.response.status,200); assert.equal(disabled.payload.enabled,false);
    current=(await jsonRequest(baseUrl,'/api/storefront')).payload; assert.equal(current.products.find(p=>p.id===quickProduct.id).commerce.checkoutEnabled,false);
  });

  await t.test('admin enables a product and variant for checkout', async()=>{
    const before=store.revision;
    await approveForSale(baseUrl,auth,product.id,['SE']);
    const content=await jsonRequest(baseUrl,`/api/admin/product-content/${encodeURIComponent(product.id)}`,{method:'PATCH',headers:auth,body:JSON.stringify({published:true,archived:false,informationOnly:false,availableForSale:true,stockStatus:'available',allowedCountries:['SE'],displayName:'Admin synced product',shortDescription:'Changed in admin and shown on the homepage.'})});
    assert.equal(content.response.status,200); assert.equal(content.payload.content.availableForSale,true);
    const stock=await jsonRequest(baseUrl,'/api/admin/inventory',{method:'PATCH',headers:auth,body:JSON.stringify({variantId:variant.variantId,onHand:9,retailPrice:49.95,saleEnabled:true})});
    assert.equal(stock.response.status,200); assert.equal(stock.payload.inventory.retailPriceCents,4995); assert.equal(stock.payload.inventory.saleEnabled,true);
    store=(await jsonRequest(baseUrl,'/api/storefront')).payload; const updated=store.products.find(p=>p.id===product.id); const updatedVariant=updated.variants.find(v=>v.variantId===variant.variantId);
    assert.ok(store.revision>before); assert.equal(updated.content.displayName,'Admin synced product'); assert.equal(updated.commerce.checkoutEnabled,true); assert.equal(updatedVariant.checkoutEnabled,true); assert.equal(updatedVariant.retailPriceCents,4995);
  });

  await t.test('cart quote and local checkout use admin price and stock', async()=>{
    const quote=await jsonRequest(baseUrl,'/api/quote',{method:'POST',body:JSON.stringify({items:[{variantId:variant.variantId,quantity:2}]})});
    assert.equal(quote.response.status,200); assert.equal(quote.payload.lines[0].unitPriceCents,4995); assert.equal(quote.payload.subtotalCents,9990);
    const order=await jsonRequest(baseUrl,'/api/orders',{method:'POST',body:JSON.stringify({items:[{variantId:variant.variantId,quantity:1}],customer:{name:'Test Customer',email:'test@example.com',phone:''},shippingAddress:{line1:'Testgatan 1',line2:'',city:'Stockholm',postalCode:'11122',country:'SE'},acceptTerms:true,acceptSandboxNotice:true})});
    assert.equal(order.response.status,201); const paid=await jsonRequest(baseUrl,`/api/orders/${encodeURIComponent(order.payload.order.id)}/payments/mock`,{method:'POST',body:JSON.stringify({token:order.payload.accessToken})}); assert.equal(paid.response.status,200); assert.equal(paid.payload.order.paymentStatus,'paid');
  });

  await t.test('hidden and archived products disappear from the public storefront immediately', async()=>{
    const hide=await jsonRequest(baseUrl,`/api/admin/product-content/${encodeURIComponent(product.id)}`,{method:'PATCH',headers:auth,body:JSON.stringify({published:false,availableForSale:false,informationOnly:true})}); assert.equal(hide.response.status,200);
    let current=(await jsonRequest(baseUrl,'/api/storefront')).payload; assert.equal(current.products.some(p=>p.id===product.id),false);
    const archive=await jsonRequest(baseUrl,`/api/admin/products/${encodeURIComponent(product.id)}`,{method:'DELETE',headers:auth}); assert.equal(archive.response.status,200); assert.equal(archive.payload.archived,true);
    const dash=await jsonRequest(baseUrl,'/api/admin/dashboard',{headers:{Cookie:cookie}}); assert.equal(dash.response.status,200); assert.equal(dash.payload.products.find(p=>p.id===product.id).content.archived,true);
  });

  await t.test('store settings and reviews are reflected by the public API', async()=>{
    const settings=await jsonRequest(baseUrl,'/api/admin/settings',{method:'PATCH',headers:auth,body:JSON.stringify({storeName:'VERAPEP Test',currency:'EUR',checkoutMode:'sandbox',assistantName:'Vera',trustSignals:['Secure test checkout','Admin synced']})}); assert.equal(settings.response.status,200);
    const visible=store.products.find(p=>p.id!==product.id);
    const submit=await jsonRequest(baseUrl,'/api/reviews',{method:'POST',body:JSON.stringify({productId:visible.id,name:'Customer',rating:5,text:'Clear and reliable product information.'})}); assert.equal(submit.response.status,201);
    await jsonRequest(baseUrl,`/api/admin/reviews/${encodeURIComponent(submit.payload.review.id)}`,{method:'PATCH',headers:auth,body:JSON.stringify({status:'approved'})});
    const refreshed=(await jsonRequest(baseUrl,'/api/storefront')).payload; assert.equal(refreshed.config.storeName,'VERAPEP Test'); assert.equal(refreshed.config.assistantName,'Vera'); assert.equal(refreshed.config.trustSignals.length,2); assert.equal(refreshed.products.find(p=>p.id===visible.id).reviews.count,1);
  });

  await t.test('customer and admin pages are served and data files are protected', async()=>{ for(const pathname of ['/','/admin.html','/guide.html','/support.html','/my-pages.html','/checkout.html',`/shop/${store.products[1].id}.html`]){const response=await fetch(`${baseUrl}${pathname}`);assert.equal(response.status,200,pathname);assert.match(response.headers.get('content-type'),/text\/html/);} const blocked=await fetch(`${baseUrl}/data/product-content.json`);assert.equal(blocked.status,404); });
});
