'use strict';
const $ = sel => document.querySelector(sel);
const formatBRL = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
let settings={whatsapp:'5594991195754',enabled_orders:'1'}, products=[], activeProduct=null, modalOpener=null;
const whatsappUrl=message=>`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(message)}`;
function safeImage(url){return typeof url==='string' && (/^\/(?:uploads|assets)\/[a-zA-Z0-9._-]+$/.test(url)||/^https:\/\/images\.pexels\.com\//.test(url))?url:'/assets/logo-original.png';}
function el(tag,className,content){const node=document.createElement(tag);if(className)node.className=className;if(content!==undefined)node.textContent=content;return node;}
function catalogRender(){
  const container=$('#productGrid');container.replaceChildren();
  const visible=products;
  $('#catalogEmpty').hidden=visible.length>0;
  $('#catalogStatus').textContent=visible.length?`${visible.length} bolos no catálogo • Selecione uma opção para solicitar pelo WhatsApp`:'';
  $('#emptyWhatsApp').href=whatsappUrl('Olá! Gostaria de saber quais bolos estão disponíveis.');
  for(const product of visible){
    const card=el('article','product-card reveal');card.dataset.category=product.category;
    const media=el('div','product-image'),img=el('img');img.src=safeImage(product.image_url);img.alt=`${product.name} — ${product.label?.toLowerCase().includes('ilustrativa')?'imagem ilustrativa':'foto do produto'}`;img.loading='lazy';media.append(img);
    if(product.label)media.append(el('span','product-tag',product.label));
    const body=el('div','product-info'),info=el('div');
    info.append(el('span','card-category',product.category==='classicos'?'CLÁSSICOS':'ESPECIAIS'),el('h3','',product.name));
    if(product.description)info.append(el('p','product-description',product.description));
    info.append(el('strong','product-price',product.price_cents===null?'Preço sob consulta':formatBRL(product.price_cents)));
    const button=el('button','order-icon catalog-card-button',product.available&&settings.enabled_orders==='1'?'Fazer pedido ↗':'Indisponível');button.type='button';
    button.disabled=!product.available||settings.enabled_orders!=='1';
    button.setAttribute('aria-label',button.disabled?`${product.name} indisponível para pedidos`:`Solicitar ${product.name}`);
    button.title=button.disabled?'Indisponível no momento':'Fazer pedido deste bolo';
    if(!button.disabled)button.addEventListener('click',()=>openOrder(product,button));
    body.append(info,button);
    card.append(media,body);container.append(card);
  }
  applyFilter(document.querySelector('.filter.active')?.dataset.filter||'todos');observeReveals();
}
function applyFilter(category){
  document.querySelectorAll('[data-filter]').forEach(button=>{const current=button.dataset.filter===category;button.classList.toggle('active',current);button.setAttribute('aria-pressed',String(current));});
  document.querySelectorAll('[data-category]').forEach(card=>card.classList.toggle('is-hidden',category!=='todos'&&card.dataset.category!==category));
}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>applyFilter(button.dataset.filter)));
function updateContact(){
  document.querySelectorAll('[data-whatsapp]').forEach(link=>link.href=whatsappUrl(link.dataset.whatsapp));
  document.querySelectorAll('a[href*="instagram.com/"]').forEach(link=>link.href=settings.instagram);
  const tel=$('#shopPhone');if(tel){tel.textContent=settings.whatsapp.replace(/^55/,'+55 ');tel.href='tel:+'+settings.whatsapp;}
  document.querySelectorAll('a[href^="https://wa.me/"]:not([data-whatsapp])').forEach(link=>{link.href='https://wa.me/'+settings.whatsapp;link.textContent='WhatsApp '+settings.whatsapp.replace(/^55/,'+55 ');});
  if($('#shopAddress'))$('#shopAddress').textContent=settings.address;
  if($('#shopHours'))$('#shopHours').textContent=settings.hours;
  $('#shopDirections').href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(settings.address);
  $('#shopMap').src='https://www.google.com/maps?q='+encodeURIComponent(settings.address)+'&output=embed';
  if(settings.hero_image)$('#heroCake').src=safeImage(settings.hero_image);
  if(settings.video_url && /^\/(uploads|assets)\//.test(settings.video_url)){const video=$('#brandVideo');$('#brandVideoSource').src=settings.video_url;video.load();}
}
async function loadSite(){
  try{
    const response=await fetch('/api/site',{cache:'no-store'});if(!response.ok)throw Error('Serviço indisponível');
    const result=await response.json();settings=result.settings;products=result.products;updateContact();catalogRender();
  }catch(error){
    $('#catalogStatus').textContent='Não foi possível carregar o cardápio agora.';
    $('#catalogEmpty').hidden=false;
    $('#emptyWhatsApp').href=whatsappUrl('Olá! Gostaria de consultar os bolos disponíveis.');
  }
}
function updateEstimate(){
  const quantity=Number($('#orderQuantity').value);
  $('#orderEstimate').textContent=activeProduct?.price_cents===null?'Sob consulta':Number.isInteger(quantity)&&quantity>=1&&quantity<=50?formatBRL(activeProduct.price_cents*quantity):'Confira a quantidade';
}
function openOrder(product,opener){
  activeProduct=product;modalOpener=opener;
  const form=$('#orderForm');form.reset();$('#orderFeedback').textContent='';$('#orderSubmit').disabled=false;
  $('#orderProductName').textContent=product.name;
  $('#orderProductImage').src=safeImage(product.image_url);
  $('#orderProductImage').alt=`Foto de ${product.name}`;
  $('#orderProductPrice').textContent=product.price_cents===null?'Preço sob consulta':`${formatBRL(product.price_cents)} por unidade`;
  updateEstimate();$('#orderModal').hidden=false;document.body.style.overflow='hidden';form.elements.customer_name.focus();
}
function closeOrder(){
  $('#orderModal').hidden=true;document.body.style.overflow='';activeProduct=null;
  if(modalOpener?.isConnected)modalOpener.focus();
}
$('#closeOrderModal').addEventListener('click',closeOrder);
$('#orderModal').addEventListener('click',event=>{if(event.target===$('#orderModal'))closeOrder();});
document.addEventListener('keydown',event=>{
  const modal=$('#orderModal');if(modal.hidden)return;
  if(event.key==='Escape')closeOrder();
  if(event.key==='Tab'){
    const focusables=Array.from(modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled])')).filter(n=>n.offsetParent!==null);
    if(!focusables.length)return;
    const first=focusables[0],last=focusables.at(-1);
    if(event.shiftKey&&document.activeElement===first){last.focus();event.preventDefault();}
    else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}
  }
});
$('#orderQuantity').addEventListener('input',updateEstimate);
$('#orderForm').addEventListener('submit',async event=>{
  event.preventDefault();if(!activeProduct)return;
  const button=$('#orderSubmit'),feedback=$('#orderFeedback');button.disabled=true;feedback.textContent='Registrando sua solicitação...';
  const form=event.currentTarget;
  const data={
    product_id:activeProduct.id, quantity:Number(form.elements.quantity.value),
    customer_name:form.elements.customer_name.value,customer_phone:form.elements.customer_phone.value,
    customer_email:form.elements.customer_email.value,location:form.elements.location.value,
    notes:form.elements.notes.value,consent:form.elements.consent.checked
  };
  try{
    const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const output=await response.json();if(!response.ok)throw Error(output.error||'Falha ao registrar solicitação.');
    feedback.textContent=`Solicitação ${output.code} registrada. Envie a mensagem que será aberta no WhatsApp.`;
    // Não há envio automático: cliente confirma tocando em Enviar no WhatsApp.
    window.location.assign(output.whatsapp_url);
  }catch(error){feedback.textContent=error.message;button.disabled=false;}
});
const menuToggle=$('#menuToggle'),mainNav=$('#mainNav');
menuToggle?.addEventListener('click',()=>{const opened=mainNav.classList.toggle('open');menuToggle.setAttribute('aria-expanded',String(opened));});
mainNav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{mainNav.classList.remove('open');menuToggle.setAttribute('aria-expanded','false');}));
function observeReveals(){const reveal=document.querySelectorAll('.reveal:not(.visible)');if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}}),{threshold:.07});reveal.forEach(item=>observer.observe(item));}else reveal.forEach(item=>item.classList.add('visible'));}
observeReveals();$('#year').textContent=new Date().getFullYear();loadSite();
