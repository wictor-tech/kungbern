(() => {
  'use strict';
  const escapeHtml = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const stars = value => { const n=Math.max(0,Math.min(5,Math.round(Number(value)||0))); return `${'★'.repeat(n)}${'☆'.repeat(5-n)}`; };
  let products=[];
  const saved = new Set(JSON.parse(localStorage.getItem('vp-saved-products') || '[]'));
  const compared = new Set(JSON.parse(localStorage.getItem('vp-compare-products') || '[]'));
  const persist = () => { localStorage.setItem('vp-saved-products',JSON.stringify([...saved])); localStorage.setItem('vp-compare-products',JSON.stringify([...compared])); document.querySelectorAll('[data-saved-count]').forEach(n=>n.textContent=String(saved.size)); };
  const hasReports = product => (product.content?.labReports || []).some(report => report.published && report.url);
  const name = product => window.VerapepeVialRenderer?.displayName(product) || product.content?.displayName || product.name;

  function rating(product){
    if(!product.reviews?.count) return '<div class="product-rating product-rating--empty"><span class="rating-stars" aria-hidden="true">☆☆☆☆☆</span><span>No ratings yet</span></div>';
    return `<div class="product-rating"><span class="rating-stars" aria-hidden="true">${stars(product.reviews.average)}</span><strong class="rating-score">${product.reviews.average.toFixed(1)}</strong><span class="rating-count">${product.reviews.count} review${product.reviews.count===1?'':'s'}</span></div>`;
  }
  function renderSaved(){
    const grid=document.getElementById('saved-products-grid');
    const list=products.filter(product=>saved.has(product.id));
    grid.innerHTML=list.length?list.map(product=>`<article class="saved-product-card" data-saved-id="${escapeHtml(product.id)}"><div class="saved-product-card__top"><div><span class="product-category">${escapeHtml(product.category.replaceAll('-',' '))}</span><h3><a href="/product/${encodeURIComponent(product.id)}">${escapeHtml(name(product))}</a></h3></div><button class="heart-button is-saved" type="button" data-remove-saved="${escapeHtml(product.id)}" aria-label="Remove ${escapeHtml(name(product))}"><span aria-hidden="true">♥</span></button></div>${rating(product)}<div class="product-card__badges"><span>${product.commerce?.checkoutEnabled?'Available to order':'Information only'}</span>${hasReports(product)?'<span>Lab report</span>':''}${product.content?.specialistOnly?'<span>Specialist</span>':''}</div><p>${escapeHtml(product.content?.shortDescription||'Open the product page for variants and approved product information.')}</p><div class="saved-product-card__actions"><a href="/product/${encodeURIComponent(product.id)}">View product</a><button type="button" data-compare="${escapeHtml(product.id)}">${compared.has(product.id)?'Selected':'Compare'}</button><a href="support.html?product=${encodeURIComponent(product.id)}">Ask Vera</a></div></article>`).join(''):'<div class="saved-empty-large"><h3>No saved products yet</h3><p>Use the heart on a catalogue card or product page. Saved products will appear here separately from the cart.</p><a class="button button--primary" href="index.html#catalogue">Browse catalogue</a></div>';
  }
  document.addEventListener('click',event=>{
    const remove=event.target.closest('[data-remove-saved]');
    if(remove){saved.delete(remove.dataset.removeSaved);persist();renderSaved();}
    const compare=event.target.closest('[data-compare]');
    if(compare){const id=compare.dataset.compare;if(compared.has(id))compared.delete(id);else if(compared.size<3)compared.add(id);else alert('You can compare up to three products.');persist();renderSaved();}
  });
  document.getElementById('clear-account-saved').addEventListener('click',()=>{saved.clear();persist();renderSaved();});

  const selection=JSON.parse(localStorage.getItem('vp-guide-selection')||'{}');
  const recommendation=document.getElementById('saved-recommendations');
  const focuses=selection.focuses||[selection.focus].filter(Boolean);const needs=selection.needs||[selection.need].filter(Boolean);const priorities=selection.priorities||[];
  if(focuses.length){const params=new URLSearchParams();params.set('focuses',focuses.join(','));if(needs.length)params.set('needs',needs.join(','));recommendation.innerHTML=`<strong>${focuses.length} saved goal${focuses.length===1?'':'s'}</strong><p>${escapeHtml([...focuses,...needs,...priorities].map(value=>value.replaceAll('-',' ')).join(' · '))}</p><a href="index.html?${params.toString()}#catalogue">Review matching products →</a>`;}

  const sessionKey='vp-local-account-profile';
  const sessionForm=document.getElementById('account-session-form');const sessionFormView=document.getElementById('account-session-form-view');const sessionView=document.getElementById('account-session-view');
  function renderSession(){let profile=null;try{profile=JSON.parse(localStorage.getItem(sessionKey)||'null');}catch{}const active=profile&&profile.name&&profile.email;sessionFormView.hidden=Boolean(active);sessionView.hidden=!active;if(!active)return;document.getElementById('account-avatar').textContent=profile.name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'VP';document.getElementById('account-session-title').textContent=profile.name;document.getElementById('account-session-copy').textContent=profile.email;document.getElementById('account-email').value=profile.email;}
  sessionForm?.addEventListener('submit',event=>{event.preventDefault();localStorage.setItem(sessionKey,JSON.stringify({name:document.getElementById('account-session-name').value.trim(),email:document.getElementById('account-session-email').value.trim()}));renderSession();});
  document.getElementById('account-session-clear')?.addEventListener('click',()=>{localStorage.removeItem(sessionKey);sessionForm?.reset();renderSession();});
  renderSession();

  document.getElementById('account-order-form').addEventListener('submit',async event=>{
    event.preventDefault();const target=document.getElementById('account-order-result');target.textContent='Looking up order…';
    try{const response=await fetch('/api/orders/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:document.getElementById('account-order-id').value,email:document.getElementById('account-email').value})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Order not found.');target.innerHTML=`<p><strong>${escapeHtml(payload.order.id)}</strong></p><p>Status: ${escapeHtml(payload.order.orderStatus.replaceAll('_',' '))}</p><p><a href="order.html?order=${encodeURIComponent(payload.order.id)}&email=${encodeURIComponent(payload.order.customer.email)}">Open full order →</a></p>`;}catch(error){target.textContent=error.message;}
  });
  fetch('/api/storefront').then(response=>response.json()).then(payload=>{products=payload.products||[];for(const id of [...saved])if(!products.some(product=>product.id===id))saved.delete(id);persist();renderSaved();}).catch(()=>{document.getElementById('saved-products-grid').innerHTML='<div class="saved-empty-large">Saved product information could not be loaded. Start the local server and refresh.</div>';});
})();
