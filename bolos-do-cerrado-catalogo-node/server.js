'use strict';
/** Bolos do Cerrado: servidor Node 22+ sem pacotes externos. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.mp4':'video/mp4','.woff2':'font/woff2'};

function loadLocalEnv() {
  const location = path.join(ROOT, '.env');
  if (!fs.existsSync(location)) return;
  for (const line of fs.readFileSync(location, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}
loadLocalEnv();
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const UPLOADS = path.join(DATA, 'uploads');
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 12 || password.startsWith('SUBSTITUA')) {
  console.error('CONFIGURACAO: defina ADMIN_PASSWORD com 12 caracteres ou mais no painel da hospedagem ou no arquivo .env local.');
  process.exit(1);
}
let secret = process.env.SESSION_SECRET;
fs.mkdirSync(DATA, { recursive:true, mode:0o700 });
fs.mkdirSync(UPLOADS, { recursive:true, mode:0o700 });
if (!secret) {
  const secretFile = path.join(DATA, '.session-secret');
  secret = fs.existsSync(secretFile) ? fs.readFileSync(secretFile,'utf8').trim() : crypto.randomBytes(48).toString('hex');
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, secret, {mode:0o600,flag:'wx'});
}
if (secret.length < 32) { console.error('SESSION_SECRET deve ter no minimo 32 caracteres'); process.exit(1); }
const db = new DatabaseSync(path.join(DATA, 'loja.sqlite'));
db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'classicos',
 price_cents INTEGER, image_url TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 0,
 available INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, customer_name TEXT NOT NULL,
 customer_phone TEXT NOT NULL, customer_email TEXT NOT NULL DEFAULT '', fulfillment TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'aguardando_confirmacao',
 items_json TEXT NOT NULL, total_cents INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);`);
// Atualizacao compatível com bancos gerados pela versão anterior (carrinho).
const columns = db.prepare('PRAGMA table_info(orders)').all().map(row=>row.name);
if (!columns.includes('customer_email')) db.exec("ALTER TABLE orders ADD COLUMN customer_email TEXT NOT NULL DEFAULT ''");

const INITIAL_SETTINGS = {
  shop_name:'Bolos do Cerrado Canaã',
  whatsapp:'5594991195754',
  instagram:'https://www.instagram.com/bolosdocerradocanaa/',
  address:'Rua Novo Horizonte, 95, Canaã dos Carajás - PA, Brasil',
  hours:'Consulte o horário com nossa equipe',
  hero_image:'https://images.pexels.com/photos/2323201/pexels-photo-2323201.jpeg?auto=compress&cs=tinysrgb&w=1400',
  video_url:'/assets/apresentacao.mp4',
  headline:'Seu dia merece um pedacinho de felicidade',
  enabled_orders:'1'
};
const putSetting = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
for (const [key,value] of Object.entries(INITIAL_SETTINGS)) putSetting.run(key,value);
function getSettings() { return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(row=>[row.key,row.value])); }
const demoNames = [
 ['Cenoura com chocolate','Bolo de cenoura com cobertura de chocolate.','classicos','https://images.pexels.com/photos/1755798/pexels-photo-1755798.jpeg?auto=compress&cs=tinysrgb&w=900'],
 ['Chocolate','Clássico bolo de chocolate.','classicos','https://images.pexels.com/photos/16678357/pexels-photo-16678357/free-photo-of-chocolate-on-cake.jpeg?auto=compress&cs=tinysrgb&w=900'],
 ['Caseirinho','Bolo caseiro para acompanhar um café.','classicos','https://images.pexels.com/photos/18831567/pexels-photo-18831567.jpeg?auto=compress&cs=tinysrgb&w=900'],
 ['Chocolate com morango','Uma combinação para momentos especiais.','especiais','https://images.pexels.com/photos/31775914/pexels-photo-31775914.jpeg?auto=compress&cs=tinysrgb&w=900'],
 ['Mesclado','Dois sabores em uma só fatia.','especiais','https://images.pexels.com/photos/17429756/pexels-photo-17429756.jpeg?auto=compress&cs=tinysrgb&w=900'],
 ['Bolo especial','Consulte sabores e tamanhos.','especiais','https://images.pexels.com/photos/2323201/pexels-photo-2323201.jpeg?auto=compress&cs=tinysrgb&w=900']
];
if (db.prepare('SELECT COUNT(*) AS count FROM products').get().count === 0) {
  const insert = db.prepare('INSERT INTO products (name,description,category,price_cents,image_url,published,available,label) VALUES (?,?,?,?,?,1,0,?)');
  for (const item of demoNames) insert.run(item[0],item[1],item[2],null,item[3],'EXEMPLO • foto ilustrativa');
}

function json(res,status,data,extraHeaders={}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...extraHeaders });
  res.end(body);
}
function sendError(res,status,message) { json(res,status,{error:message}); }
function headers() {return {
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.pexels.com https://*.pexels.com; media-src 'self'; frame-src https://www.google.com https://maps.google.com; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
};}
const isProduction = process.env.NODE_ENV === 'production';
function parseCookies(header='') {return Object.fromEntries(header.split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)]}));}
function sessionFor(req) {
  const value = parseCookies(req.headers.cookie).bdc_session;
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
  const hash = crypto.createHash('sha256').update(value).digest('hex');
  const session = db.prepare('SELECT token_hash,csrf,expires_at FROM sessions WHERE token_hash=?').get(hash);
  return session && session.expires_at > Date.now() ? session : null;
}
function setSession(res,token) {res.setHeader('Set-Cookie',`bdc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${isProduction?'; Secure':''}`);}
function expireSession(res) {res.setHeader('Set-Cookie',`bdc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${isProduction?'; Secure':''}`);}
function admin(req,res) {const session=sessionFor(req); if (!session){sendError(res,401,'Faça login no painel.');return null;} return session;}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try { const url = new URL(origin); return url.host === req.headers.host && (url.protocol === 'https:' || (!isProduction && url.protocol === 'http:')); }
  catch {return false;}
}
function requireWrite(req,res,session) {
  if (!sameOrigin(req)) {sendError(res,403,'Origem não permitida.');return false;}
  if (session && req.headers['x-csrf-token'] !== session.csrf) {sendError(res,403,'Sessão de segurança expirada. Recarregue o painel.');return false;}
  return true;
}
function bodyJson(req,limit=100_000) {
  return new Promise((resolve,reject)=>{
    let length=0;const data=[];
    req.on('data',chunk=>{length+=chunk.length;if(length>limit){reject(Object.assign(new Error('Arquivo ou solicitação muito grande.'),{status:413}));req.destroy();return;}data.push(chunk)});
    req.on('end',()=>{try{const x=JSON.parse(Buffer.concat(data).toString('utf8'));resolve(x)}catch{reject(Object.assign(new Error('Dados inválidos.'),{status:400}))}});
    req.on('error',reject);
  });
}
function safeText(value,max=200){return typeof value==='string'?value.trim().slice(0,max):'';}
function validNumber(str){return /^\d{12,15}$/.test(str);}
function productForAdmin(body) {
  const name=safeText(body.name,90), description=safeText(body.description,350);
  const category=['classicos','especiais'].includes(body.category)?body.category:'classicos';
  const label=safeText(body.label,60),image_url=safeText(body.image_url,900);
  const price=body.price_cents===null || body.price_cents==='' || body.price_cents===undefined ? null : Number(body.price_cents);
  if (!name || (price!==null && (!Number.isInteger(price) || price<0 || price>100000000))) throw Object.assign(new Error('Informe um nome e preço válido (em centavos).'),{status:400});
  if (image_url && !(image_url.startsWith('/uploads/') || image_url.startsWith('/assets/') || /^https:\/\/images\.pexels\.com\//.test(image_url))) throw Object.assign(new Error('Escolha uma imagem enviada ou uma imagem ilustrativa cadastrada.'),{status:400});
  return {name,description,category,label,image_url,price_cents:price,published:body.published?1:0,available:body.available?1:0};
}
function publicProducts(){return db.prepare('SELECT id,name,description,category,price_cents,image_url,label,available FROM products WHERE published=1 ORDER BY id DESC').all();}
function allProducts(){return db.prepare('SELECT * FROM products ORDER BY id DESC').all();}
function money(cents){return (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function whatsappLink(number, message) {return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;}
function buildOrder(body) {
  const settings=getSettings();
  if (settings.enabled_orders!=='1') throw Object.assign(new Error('Pedidos temporariamente indisponíveis.'),{status:409});
  if (!validNumber(settings.whatsapp)) throw Object.assign(new Error('WhatsApp comercial ainda não configurado.'),{status:409});
  const name=safeText(body.customer_name,90);
  const phone=safeText(body.customer_phone,24);
  const email=safeText(body.customer_email,150).toLowerCase();
  const address=safeText(body.location,250);  // Localização digitada pelo cliente (não geolocalização).
  const notes=safeText(body.notes,350);
  const id=Number(body.product_id), qty=Number(body.quantity);
  if (name.length<2 || !/^\+?[0-9 ()-]{10,24}$/.test(phone)) throw Object.assign(new Error('Informe nome e telefone válidos.'),{status:400});
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>150) throw Object.assign(new Error('Informe um e-mail válido.'),{status:400});
  if (address.length<4) throw Object.assign(new Error('Informe sua localização: bairro, rua ou ponto de referência.'),{status:400});
  if (!Number.isInteger(id) || !Number.isInteger(qty) || qty<1 || qty>50) throw Object.assign(new Error('Produto ou quantidade inválida.'),{status:400});
  if (body.consent !== true) throw Object.assign(new Error('Confirme que leu as informações de privacidade.'),{status:400});
  const product=db.prepare('SELECT id,name,price_cents,published,available FROM products WHERE id=?').get(id);
  if (!product || !product.published || !product.available) throw Object.assign(new Error('Este bolo não está disponível para solicitação. Atualize o catálogo.'),{status:409});
  const price=product.price_cents, total=price===null?0:price*qty;
  if (total>100000000) throw Object.assign(new Error('Valor acima do permitido.'),{status:400});
  const items=[{id,name:product.name,quantity:qty,unit_price_cents:price}];
  const code=`BDC-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  db.prepare('INSERT INTO orders(code,customer_name,customer_phone,customer_email,fulfillment,address,notes,items_json,total_cents) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(code,name,phone,email,'a_combinar',address,notes,JSON.stringify(items),total);
  const lines=[
    'Olá! Quero solicitar um bolo da *Bolos do Cerrado*.',
    `*Solicitação:* ${code}`,
    `*Bolo:* ${product.name}`,
    `*Quantidade:* ${qty}`,
    `*Valor:* ${price===null?'Sob consulta':money(total)+' (produtos)'}`,
    '',`*Nome:* ${name}`,`*Telefone:* ${phone}`,`*E-mail:* ${email}`,`*Localização:* ${address}`
  ];
  if (notes) lines.push(`*Observações:* ${notes}`);
  lines.push('','Gostaria de confirmar disponibilidade, prazo, entrega/retirada e valor final.');
  // Registrar uma solicitação não significa que o usuário enviou o WhatsApp.
  return {code,total_cents:total,whatsapp_url:whatsappLink(settings.whatsapp,lines.join('\n'))};
}
const failedLogins=new Map();
const orderRate=new Map();
function allowOrder(ip){
  const now=Date.now(), times=(orderRate.get(ip)||[]).filter(time=>now-time<60_000);
  if(times.length>=5){orderRate.set(ip,times);return false;}
  times.push(now);orderRate.set(ip,times);
  if(orderRate.size>10000)for(const [key,list] of orderRate)if(!list.some(time=>now-time<60_000))orderRate.delete(key);
  return true;
}
function loginAllowed(ip){const now=Date.now();let attempts=(failedLogins.get(ip)||[]).filter(time=>now-time<15*60_000);failedLogins.set(ip,attempts);return attempts.length<6;}
function failedLogin(ip){const attempts=failedLogins.get(ip)||[]; attempts.push(Date.now());failedLogins.set(ip,attempts);}
function passwordEquals(candidate){
  if(typeof candidate!=='string'||candidate.length>1024)return false;
  const salt='bolos-do-cerrado-admin-auth-v1';
  const one=crypto.scryptSync(candidate,salt,32),two=crypto.scryptSync(password,salt,32);
  return crypto.timingSafeEqual(one,two);
}
function csvEscape(value){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return `"${s.replaceAll('"','""')}"`;}
function serveFile(req,res,filename){
  try{
    const st=fs.statSync(filename);if(!st.isFile())return sendError(res,404,'Não encontrado.');
    const ext=path.extname(filename).toLowerCase();const type=MIME[ext]||'application/octet-stream';
    let start=0,end=st.size-1,status=200;
    const range=String(req.headers.range||'').match(/^bytes=(\d+)-(\d*)$/);
    if(range){start=Number(range[1]);end=range[2]?Number(range[2]):end;if(start> end||end>=st.size){res.writeHead(416,{'Content-Range':`bytes */${st.size}`});return res.end();}status=206;}
    const h={'Content-Type':type,'Content-Length':end-start+1,'Cache-Control':filename.endsWith('.html')?'no-cache':'public, max-age=3600','Accept-Ranges':'bytes'};
    if(status===206)h['Content-Range']=`bytes ${start}-${end}/${st.size}`;
    res.writeHead(status,h);
    if(req.method==='HEAD')return res.end();
    fs.createReadStream(filename,{start,end}).pipe(res);
  }catch{return sendError(res,404,'Não encontrado.');}
}
function safeServe(req,res,pathname,root){
  const target=path.resolve(root,'.'+pathname);
  if(target!==root&&!target.startsWith(root+path.sep))return sendError(res,403,'Acesso negado.');
  return serveFile(req,res,target);
}
async function handle(req,res){
  for(const [key,value] of Object.entries(headers()))res.setHeader(key,value);
  const u=new URL(req.url,'http://localhost');
  const pathname=u.pathname;
  const method=req.method;
  if(method==='GET'&&pathname==='/health')return json(res,200,{ok:true,service:'Bolos do Cerrado'});
  if(method==='GET'&&pathname==='/api/site')return json(res,200,{settings:getSettings(),products:publicProducts()});
  if(method==='POST'&&pathname==='/api/orders'){
    if(!requireWrite(req,res,null))return;
    if(!allowOrder(req.socket.remoteAddress||'unknown'))return sendError(res,429,'Muitas solicitações. Aguarde um minuto.');
    const body=await bodyJson(req);return json(res,201,buildOrder(body));
  }
  if(method==='POST'&&pathname==='/api/admin/login'){
    if(!requireWrite(req,res,null))return;
    const ip=req.socket.remoteAddress||'unknown';if(!loginAllowed(ip))return sendError(res,429,'Muitas tentativas. Tente novamente mais tarde.');
    const body=await bodyJson(req,5000);
    if(!passwordEquals(body.password)){failedLogin(ip);return sendError(res,401,'Senha incorreta.');}
    failedLogins.delete(ip);
    const token=crypto.randomBytes(32).toString('hex');const hash=crypto.createHash('sha256').update(token).digest('hex');
    const csrf=crypto.randomBytes(24).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
    db.prepare('INSERT INTO sessions(token_hash,csrf,expires_at) VALUES(?,?,?)').run(hash,csrf,Date.now()+43_200_000);
    setSession(res,token);return json(res,200,{ok:true,csrf});
  }
  if(pathname.startsWith('/api/admin/')){
    const session=admin(req,res);if(!session)return;
    if(method!=='GET'&&!requireWrite(req,res,session))return;
    if(method==='GET'&&pathname==='/api/admin/me')return json(res,200,{ok:true,csrf:session.csrf});
    if(method==='POST'&&pathname==='/api/admin/logout'){
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.token_hash);expireSession(res);return json(res,200,{ok:true});
    }
    if(method==='GET'&&pathname==='/api/admin/dashboard'){
      const counts=Object.fromEntries(db.prepare('SELECT status,COUNT(*) AS count FROM orders GROUP BY status').all().map(row=>[row.status,row.count]));
      const completed=db.prepare("SELECT COALESCE(SUM(total_cents),0) AS total FROM orders WHERE status='concluido'").get().total;
      return json(res,200,{counts,completed_cents:completed,products:db.prepare('SELECT COUNT(*) AS count FROM products').get().count,orders:db.prepare('SELECT COUNT(*) AS count FROM orders').get().count});
    }
    if(method==='GET'&&pathname==='/api/admin/products')return json(res,200,{products:allProducts()});
    if(method==='POST'&&pathname==='/api/admin/products'){
      const p=productForAdmin(await bodyJson(req));
      const result=db.prepare('INSERT INTO products(name,description,category,price_cents,image_url,published,available,label) VALUES(?,?,?,?,?,?,?,?)').run(p.name,p.description,p.category,p.price_cents,p.image_url,p.published,p.available,p.label);
      return json(res,201,{id:Number(result.lastInsertRowid)});
    }
    const productRoute=pathname.match(/^\/api\/admin\/products\/(\d+)$/);
    if(productRoute&&method==='PUT'){
      const p=productForAdmin(await bodyJson(req)),id=Number(productRoute[1]);
      const result=db.prepare('UPDATE products SET name=?,description=?,category=?,price_cents=?,image_url=?,published=?,available=?,label=? WHERE id=?').run(p.name,p.description,p.category,p.price_cents,p.image_url,p.published,p.available,p.label,id);
      if(!result.changes)return sendError(res,404,'Produto não encontrado.');return json(res,200,{ok:true});
    }
    if(productRoute&&method==='DELETE'){
      const result=db.prepare('DELETE FROM products WHERE id=?').run(Number(productRoute[1]));return json(res,200,{ok:true,deleted:result.changes});
    }
    if(method==='GET'&&pathname==='/api/admin/orders'){
      const rows=db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 250').all().map(r=>({...r,items:JSON.parse(r.items_json),items_json:undefined}));
      return json(res,200,{orders:rows});
    }
    const orderRoute=pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
    if(orderRoute&&method==='PATCH'){
      const {status}=await bodyJson(req,2000);
      if(!['aguardando_confirmacao','em_preparo','pronto','concluido','cancelado'].includes(status))return sendError(res,400,'Status inválido.');
      const result=db.prepare('UPDATE orders SET status=? WHERE id=?').run(status,Number(orderRoute[1]));
      if(!result.changes)return sendError(res,404,'Pedido não encontrado.');return json(res,200,{ok:true});
    }
    if(method==='GET'&&pathname==='/api/admin/backup'){
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      const bytes=fs.readFileSync(path.join(DATA,'loja.sqlite'));
      res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="bolos-do-cerrado-backup.sqlite"','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      return res.end(bytes);
    }
    if(method==='GET'&&pathname==='/api/admin/orders.csv'){
      const orders=db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
      const csv=['Código,Data,Cliente,Telefone,E-mail,Localização,Atendimento,Observações,Produto e quantidade,Total (R$),Status',...orders.map(o=>[o.code,o.created_at,o.customer_name,o.customer_phone,o.customer_email,o.address,o.fulfillment,o.notes,JSON.parse(o.items_json).map(it=>`${it.quantity}x ${it.name}`).join(' | '),(o.total_cents/100).toFixed(2).replace('.',','),o.status].map(csvEscape).join(','))].join('\r\n');
      res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="pedidos-bolos-do-cerrado.csv"','Cache-Control':'no-store'});return res.end('\ufeff'+csv);
    }
    if(method==='GET'&&pathname==='/api/admin/settings')return json(res,200,{settings:getSettings()});
    if(method==='PUT'&&pathname==='/api/admin/settings'){
      const input=await bodyJson(req);
      const allow=['shop_name','whatsapp','instagram','address','hours','hero_image','video_url','headline','enabled_orders'];
      const values={};for(const key of allow)if(Object.prototype.hasOwnProperty.call(input,key))values[key]=safeText(input[key],key==='hero_image'||key==='video_url'||key==='instagram'?900:350);
      if(values.whatsapp!==undefined&&!validNumber(values.whatsapp))return sendError(res,400,'WhatsApp deve conter DDI+DDD+número, apenas dígitos.');
      if(values.instagram!==undefined&&!/^https:\/\/www\.instagram\.com\/[a-zA-Z0-9_.]+\/?$/.test(values.instagram))return sendError(res,400,'Insira o link completo do perfil do Instagram.');
      for(const key of ['hero_image','video_url'])if(values[key]&&!(values[key].startsWith('/uploads/')||values[key].startsWith('/assets/')||key==='hero_image'&&/^https:\/\/images\.pexels\.com\//.test(values[key])))return sendError(res,400,'Utilize arquivos enviados pelo painel para imagens e vídeos.');
      if(values.enabled_orders!==undefined)values.enabled_orders=values.enabled_orders==='1'?'1':'0';
      const stmt=db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      for(const [key,value] of Object.entries(values))stmt.run(key,value);
      return json(res,200,{ok:true,settings:getSettings()});
    }
    if(method==='POST'&&pathname==='/api/admin/upload'){
      const input=await bodyJson(req,18*1024*1024);
      if(!['image','video'].includes(input.type)||typeof input.data!=='string')return sendError(res,400,'Envio inválido.');
      const match=input.data.match(/^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/);
      if(!match)return sendError(res,400,'Arquivo inválido.');
      const media=match[1];const types={ 'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','video/mp4':'.mp4' };
      if(!types[media]||(input.type==='image'&&!media.startsWith('image/'))||(input.type==='video'&&media!=='video/mp4'))return sendError(res,400,'Use JPG, PNG, WEBP ou MP4.');
      const file=Buffer.from(match[2],'base64'), max=input.type==='video'?12*1024*1024:4*1024*1024;
      if(!file.length||file.length>max)return sendError(res,413,`O arquivo excede ${input.type==='video'?12:4} MB.`);
      const magic=media==='image/png'?file.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):
       media==='image/jpeg'?file[0]===255&&file[1]===216&&file[2]===255:
       media==='image/webp'?file.toString('ascii',0,4)==='RIFF'&&file.toString('ascii',8,12)==='WEBP':
       file.toString('ascii',4,8)==='ftyp';
      if(!magic)return sendError(res,400,'O conteúdo não corresponde ao formato informado.');
      const filename=crypto.randomBytes(16).toString('hex')+types[media];
      fs.writeFileSync(path.join(UPLOADS,filename),file,{flag:'wx',mode:0o600});
      return json(res,201,{url:'/uploads/'+filename});
    }
    return sendError(res,404,'Rota administrativa não encontrada.');
  }
  if((method==='GET'||method==='HEAD')&&pathname==='/admin')return serveFile(req,res,path.join(PRIVATE,'admin.html'));
  if((method==='GET'||method==='HEAD')&&pathname==='/admin.css')return serveFile(req,res,path.join(PRIVATE,'admin.css'));
  if((method==='GET'||method==='HEAD')&&pathname==='/admin.js')return serveFile(req,res,path.join(PRIVATE,'admin.js'));
  if((method==='GET'||method==='HEAD')&&pathname.startsWith('/uploads/'))return safeServe(req,res,pathname.replace(/^\/uploads/,''),UPLOADS);
  if((method==='GET'||method==='HEAD')){
    const parsed=pathname==='/'?'/index.html':pathname;
    return safeServe(req,res,parsed,PUBLIC);
  }
  sendError(res,404,'Rota não encontrada.');
}
const PRIVATE=path.join(ROOT,'private');
const server=http.createServer((req,res)=>{
  Promise.resolve().then(()=>handle(req,res)).catch(err=>{
    console.error('Erro:',err.message);
    if(!res.headersSent)sendError(res,err.status||500,err.status?err.message:'Erro interno.');
    else if(!res.writableEnded)res.end();
  });
});
const PORT=Number(process.env.PORT)||3000;
server.listen(PORT,'0.0.0.0',()=>console.log(`Bolos do Cerrado: http://localhost:${PORT} | /admin`));
