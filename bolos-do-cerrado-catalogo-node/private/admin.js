const $ = (sel) => document.querySelector(sel);
const money = cents => cents===null||cents===undefined?'Sob consulta':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
let csrf='',products=[],orders=[],settings={};
const statuses={aguardando_confirmacao:'Aguardando confirmação',em_preparo:'Em preparo',pronto:'Pronto',concluido:'Concluído',cancelado:'Cancelado'};
function el(tag,className,content){const element=document.createElement(tag);if(className)element.className=className;if(content!==undefined)element.textContent=content;return element;}
async function api(url,options={}){
  const method=options.method||'GET';
  const response=await fetch(url,{...options,headers:{...(method!=='GET'?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{}),...(options.headers||{})},cache:'no-store'});
  let data;try{data=await response.json();}catch{data={error:'Resposta inválida do servidor.'};}
  if(!response.ok){if(response.status===401 && url!=='/api/admin/login')logoutView();throw new Error(data.error||`Erro ${response.status}`);}
  return data;
}
let noticeTimer=null;
function notify(message,warning=false){const item=$('#notice');item.textContent=message;item.classList.toggle('error',warning);item.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>item.hidden=true,4500);}
function loginView(){ $('#loginPage').hidden=false;$('#shell').hidden=true; }
function loggedView(){ $('#loginPage').hidden=true;$('#shell').hidden=false; }
function logoutView(){ csrf='';loginView(); }
async function authenticate(){
  try{const response=await api('/api/admin/me');csrf=response.csrf;loggedView();await refresh();}
  catch{logoutView();}
}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').textContent='';const button=e.currentTarget.querySelector('button');button.disabled=true;
  try{const response=await api('/api/admin/login',{method:'POST',body:JSON.stringify({password:$('#loginPassword').value})});csrf=response.csrf;$('#loginPassword').value='';loggedView();await refresh();}
  catch(error){$('#loginError').textContent=error.message;}finally{button.disabled=false;}
});
$('#logout').addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST',body:'{}'});}catch{}logoutView();});
$('#reloadAll').addEventListener('click',()=>refresh().then(()=>notify('Dados atualizados.')).catch(err=>notify(err.message,true)));
function tab(name){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));document.querySelectorAll('[data-panel]').forEach(el=>el.hidden=el.dataset.panel!==name);$('#topTitle').textContent={overview:'Visão geral',products:'Cardápio e produtos',orders:'Solicitações',settings:'Configurações'}[name];}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>tab(button.dataset.tab)));
document.querySelectorAll('[data-jump]').forEach(button=>button.addEventListener('click',()=>tab(button.dataset.jump)));
async function refresh(){
  const [dash,p,o,s]=await Promise.all([api('/api/admin/dashboard'),api('/api/admin/products'),api('/api/admin/orders'),api('/api/admin/settings')]);
  products=p.products;orders=o.orders;settings=s.settings;
  $('#statProducts').textContent=dash.products;$('#statOrders').textContent=dash.orders;$('#statPending').textContent=dash.counts.aguardando_confirmacao||0;
  $('#statRevenue').textContent=money(dash.completed_cents);renderProducts();renderOrders();renderRecent();renderSettings();
}
function renderProducts(){const wrap=$('#productsBody');wrap.replaceChildren();$('#productsEmpty').hidden=products.length!==0;
  for(const product of products){
    const tr=el('tr');const c1=el('td'),heading=el('div','table-product'),img=el('img');img.src=product.image_url||'/assets/logo-original.png';img.alt='';
    const title=el('div');title.append(el('strong','',product.name),el('small','',product.category==='classicos'?'Clássico':'Especial'));heading.append(img,title);c1.append(heading);
    const c2=el('td','',money(product.price_cents));const c3=el('td'),c4=el('td');c3.append(el('span','chip '+(product.published?'yes':'no'),product.published?'Publicado':'Rascunho'));c4.append(el('span','chip '+(product.available?'yes':'no'),product.available?'Disponível':'Indisponível'));
    const c5=el('td'),buttons=el('div','table-action'),edit=el('button','', 'Editar'),remove=el('button','','Excluir');
    edit.type='button';remove.type='button';edit.addEventListener('click',()=>editProduct(product.id));
    remove.addEventListener('click',()=>deleteProduct(product.id,product.name));buttons.append(edit,remove);c5.append(buttons);tr.append(c1,c2,c3,c4,c5);wrap.append(tr);
  }
}
function orderItem(order){
  const card=el('article','order-card'),head=el('div','order-head'),title=el('div');
  title.append(el('strong','',order.code),el('div','order-meta',new Date(order.created_at+'Z').toLocaleString('pt-BR',{dateStyle:'medium',timeStyle:'short'})));
  head.append(title,el('span','chip '+(order.status==='concluido'?'yes':'no'),statuses[order.status]||order.status));
  const body=el('div','order-body');
  const customer=el('div','customer-data');customer.append(el('strong','customer-name',order.customer_name));
  const phone=el('a','customer-phone',order.customer_phone);phone.href='tel:'+order.customer_phone.replace(/[^+0-9]/g,'');customer.append(phone);
  customer.append(el('p','',`E-mail: ${order.customer_email||'Não informado (pedido antigo)'}`));
  customer.append(el('p','',`Localização: ${order.address||'Não informada'}`));
  body.append(customer);
  if(order.fulfillment&&order.fulfillment!=='a_combinar')body.append(el('p','',`Atendimento: ${order.fulfillment==='entrega'?'Entrega':'Retirada'}`));
  for(const item of order.items){
    body.append(el('p','product-order-line',`${item.quantity} × ${item.name} — ${item.unit_price_cents===null?'Preço sob consulta':money(item.quantity*item.unit_price_cents)}`));
  }
  if(order.notes)body.append(el('p','',`Observações: ${order.notes}`));
  const foot=el('div','order-foot');
  const subtotal=order.items.some(i=>i.unit_price_cents===null)?'Preço sob consulta':money(order.total_cents);
  foot.append(el('strong','',subtotal));
  const actions=el('div','order-actions');
  const cleanPhone=order.customer_phone.replace(/\D/g,'');
  if(cleanPhone.length>=10){
    const contact=el('a','button outline customer-contact','WhatsApp do cliente ↗');
    contact.href='https://wa.me/'+(cleanPhone.startsWith('55')?cleanPhone:'55'+cleanPhone);contact.target='_blank';contact.rel='noopener noreferrer';actions.append(contact);
  }
  const label=el('label','','Atualizar status'),select=el('select');
  for(const [value,name] of Object.entries(statuses)){const option=el('option','',name);option.value=value;select.append(option);}select.value=order.status;
  select.addEventListener('change',async()=>{select.disabled=true;try{await api('/api/admin/orders/'+order.id,{method:'PATCH',body:JSON.stringify({status:select.value})});notify('Status atualizado.');await refresh();}catch(e){notify(e.message,true);select.value=order.status;}finally{select.disabled=false;}});
  label.append(select);actions.append(label);foot.append(actions);card.append(head,body,foot);return card;
}
function renderOrders(){
  const wrap=$('#ordersList');wrap.replaceChildren();const filter=$('#orderFilter').value;
  const query=$('#orderSearch').value.trim().toLocaleLowerCase('pt-BR');
  const chosen=orders.filter(order=>{
    if(filter!=='all'&&order.status!==filter)return false;
    if(!query)return true;
    return [order.code,order.customer_name,order.customer_phone,order.customer_email,order.address,...order.items.map(item=>item.name)]
      .some(field=>String(field||'').toLocaleLowerCase('pt-BR').includes(query));
  });
  $('#ordersSummary').textContent=`${chosen.length} de ${orders.length} solicitações recentes exibidas`;
  if(!chosen.length)wrap.append(el('div','panel empty-state','Nenhuma solicitação encontrada.'));
  for(const order of chosen)wrap.append(orderItem(order));
}
function renderRecent(){
  const wrap=$('#overviewRecent');wrap.replaceChildren();
  if(!orders.length){wrap.append(el('div','empty-state','Nenhuma solicitação registrada até agora.'));return;}
  for(const order of orders.slice(0,6)){
    const line=el('div','recent-line'),info=el('div');
    info.append(el('strong','',order.customer_name),el('span','',order.customer_phone));
    const item=order.items[0];
    const details=el('div','recent-detail',item?`${item.quantity} × ${item.name}`:'Pedido sem produto');
    line.append(info,details);wrap.append(line);
  }
}
$('#orderFilter').addEventListener('change',renderOrders);
$('#orderSearch').addEventListener('input',renderOrders);
function productForm(){return $('#productForm');}
function showModal(){ $('#productModal').hidden=false;document.body.style.overflow='hidden';productForm().elements.name.focus(); }
function hideModal(){ $('#productModal').hidden=true;document.body.style.overflow=''; }
$('#modalClose').addEventListener('click',hideModal);$('#modalCancel').addEventListener('click',hideModal);
$('#productModal').addEventListener('click',e=>{if(e.target===$('#productModal'))hideModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#productModal').hidden)hideModal();});
$('#addProduct').addEventListener('click',()=>{productForm().reset();productForm().elements.id.value='';$('#modalTitle').textContent='Adicionar bolo';showModal();});
function editProduct(id){const product=products.find(p=>p.id===id);if(!product)return;const f=productForm();f.reset();
  for(const key of ['id','name','description','category','label','image_url'])f.elements[key].value=product[key]??'';
  f.elements.price.value=product.price_cents===null?'':(product.price_cents/100).toFixed(2).replace('.',',');
  f.elements.published.checked=!!product.published;f.elements.available.checked=!!product.available;
  $('#modalTitle').textContent='Editar bolo';showModal();
}
function parseBRL(value){const clean=value.trim();if(!clean)return null;let norm=clean.replace(/\s|R\$/gi,'');if(norm.includes(',')){norm=norm.replaceAll('.','').replace(',','.');}
  if(!/^\d+(?:\.\d{1,2})?$/.test(norm))throw Error('Preço inválido. Use um valor como 49,90.');return Math.round(Number(norm)*100);
}
productForm().addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
  try{const id=form.elements.id.value;const body={name:form.elements.name.value,description:form.elements.description.value,category:form.elements.category.value,label:form.elements.label.value,image_url:form.elements.image_url.value,price_cents:parseBRL(form.elements.price.value),published:form.elements.published.checked,available:form.elements.available.checked};
    // É permitido solicitar bolos sem preço definido; o WhatsApp exibirá 'Sob consulta'.
    await api(id?`/api/admin/products/${id}`:'/api/admin/products',{method:id?'PUT':'POST',body:JSON.stringify(body)});hideModal();notify('Produto salvo.');await refresh();}
  catch(err){notify(err.message,true);}finally{button.disabled=false;}
});
async function deleteProduct(id,name){if(!confirm(`Excluir "${name}"?\nPedidos antigos conservarão os dados desse item.`))return;
  try{await api('/api/admin/products/'+id,{method:'DELETE',body:'{}'});notify('Produto excluído.');await refresh();}catch(e){notify(e.message,true);}
}
function renderSettings(){const form=$('#settingsForm');for(const key of ['shop_name','whatsapp','instagram','address','hours','headline','hero_image','video_url'])form.elements[key].value=settings[key]||'';form.elements.enabled_orders.checked=settings.enabled_orders==='1';}
$('#settingsForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const button=f.querySelector('button[type="submit"]');button.disabled=true;
  try{const body=Object.fromEntries(new FormData(f).entries());body.enabled_orders=f.elements.enabled_orders.checked?'1':'0';
    await api('/api/admin/settings',{method:'PUT',body:JSON.stringify(body)});notify('Configurações atualizadas no site.');await refresh();}
  catch(error){notify(error.message,true);}finally{button.disabled=false;}
});
async function upload(file,kind){if(!file)throw Error('Selecione um arquivo.');const limit=kind==='video'?12:4;if(file.size>limit*1024*1024)throw Error(`O arquivo deve ter até ${limit} MB.`);
  const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Erro ao ler arquivo.'));reader.readAsDataURL(file);});
  const result=await api('/api/admin/upload',{method:'POST',body:JSON.stringify({type:kind,data:base64})});return result.url;
}
document.querySelectorAll('.upload-button').forEach(button=>button.addEventListener('click',async()=>{
  const field=document.getElementById(button.dataset.upload),original=button.textContent;button.disabled=true;button.textContent='Enviando...';
  try{const url=await upload(field.files[0],button.dataset.type);const form=button.closest('form');form.elements[button.dataset.target].value=url;notify('Arquivo enviado. Salve o formulário para aplicar.');}
  catch(error){notify(error.message,true);}finally{button.disabled=false;button.textContent=original;}
}));
authenticate();
