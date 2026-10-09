(() => {
  'use strict';
  const form=document.getElementById('assistant-form');
  const log=document.getElementById('assistant-log');
  const question=document.getElementById('assistant-question');
  const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const productId=new URLSearchParams(location.search).get('product');
  if(productId){
    question.placeholder='Ask about this product’s published information';
    fetch('/api/storefront').then(r=>r.ok?r.json():null).then(payload=>{
      const product=(payload?.products||[]).find(item=>item.id===productId);
      const label=product ? (window.VerapepeVialRenderer?.displayName(product)||product.content?.displayName||product.name) : productId.replace(/-\d+$/,'').replaceAll('-',' ');
      log.insertAdjacentHTML('beforeend',`<div class="assistant-message">You opened Vera from product <strong>${escape(label)}</strong>. Ask about its published information or <a href="/product/${encodeURIComponent(productId)}">return to the product page</a>.</div>`);
    }).catch(()=>{});
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();const text=question.value.trim();if(!text)return;
    log.insertAdjacentHTML('beforeend',`<div class="assistant-message assistant-message--user">${escape(text)}</div>`);question.value='';
    try{const response=await fetch('/api/support/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:productId?`${text} ${productId}`:text})});const payload=await response.json();const link=payload.url?` <a href="${escape(payload.url)}">Open information →</a>`:payload.liveSupport?' <a href="mailto:hello@verapep.eu">Contact live support →</a>':'';log.insertAdjacentHTML('beforeend',`<div class="assistant-message">${escape(payload.answer)}${link}</div>`);}catch{log.insertAdjacentHTML('beforeend','<div class="assistant-message">I could not connect to the approved information service. <a href="mailto:hello@verapep.eu">Contact live support →</a></div>');}
    log.lastElementChild?.scrollIntoView({behavior:'smooth'});
  });
})();
