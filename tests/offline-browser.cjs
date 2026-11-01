// End-to-end validation with a temporary H2 database and an isolated browser profile.
// Requires mvn verify, npm ci, a JDK 21+ and a Chromium executable.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const root=path.resolve(__dirname,'..');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port;await new Promise(r=>s.close(r));return port;}
async function eventually(fn,timeout=25000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const result=await fn();if(result)return result;}catch(e){last=e;}await wait(100);}throw last||Error('Timed out waiting for expected state');}
(async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'foodstock-offline-'));
 const docs=path.join(root,'docs');
 const site=http.createServer(async(req,res)=>{
  try{
   let file=decodeURIComponent(new URL(req.url,'http://test').pathname);if(file.endsWith('/'))file+='index.html';
   const target=path.resolve(docs,'.'+file);if(!target.startsWith(docs+path.sep))throw Error('Invalid path');
   const body=await fs.readFile(target),ext=path.extname(target);
   res.writeHead(200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.ttf':'font/ttf'})[ext]||'application/octet-stream'});res.end(body);
  }catch{res.writeHead(404);res.end();}
 });
 site.listen(0,'127.0.0.1');await once(site,'listening');
 const origin=`http://127.0.0.1:${site.address().port}`,apiPort=await freePort(),api=`http://127.0.0.1:${apiPort}`;
 const java=process.env.FOODSTOCK_JAVA||(process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin/java'):'java');
 const jar=process.env.FOODSTOCK_JAR||path.join(root,'backend/target/foodstock-0.1.0.jar');
 const executablePath=process.env.FOODSTOCK_BROWSER||'/usr/bin/chromium';
 let server,context;
 const launch=()=>chromium.launchPersistentContext(path.join(tmp,'browser'),{executablePath,headless:true,args:['--no-sandbox'],viewport:{width:390,height:844}});
 async function startApi(){
  server=spawn(java,['-jar',jar],{cwd:path.join(root,'backend'),env:{...process.env,PORT:String(apiPort),FOODSTOCK_DB_URL:`jdbc:h2:file:${path.join(tmp,'database')}`,FOODSTOCK_ALLOWED_ORIGINS:origin},stdio:['ignore','pipe','pipe']});
  const log=[];server.stdout.on('data',d=>log.push(String(d)));server.stderr.on('data',d=>log.push(String(d)));
  await eventually(async()=>{if(server.exitCode!=null)throw Error(log.join('').slice(-4000));return (await fetch(api+'/api/health')).ok;});
 }
 async function stopApi(){if(server&&server.exitCode==null){server.kill('SIGTERM');await once(server,'exit');}server=null;}
 const profile=p=>p.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('foodstock-offline-v1',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('profiles'),get=tx.objectStore('profiles').get('primary');get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();};open.onerror=()=>reject(open.error);}));
 const pending=(p,n)=>eventually(async()=>{const v=await profile(p);return v?.pending.length===n&&v;});
 const json=async route=>(await fetch(api+'/api'+route)).json();
 const log=message=>console.log('PASS:',message);
 const errors=[];
 try{
  context=await launch();await context.addInitScript(url=>localStorage.setItem('foodstock-api',url),api);
  let p=context.pages()[0];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin+'/#shopping');await p.getByRole('button',{name:'Carregar a tua lista'}).click();
  await p.locator('.shopping-item').nth(38).waitFor();
  const eggs=p.locator('.shopping-item').filter({has:p.getByRole('checkbox',{name:'Ovos no carrinho',exact:true})});
  await eggs.getByRole('checkbox').check();await pending(p,2);
  await eggs.locator('summary').click();await eggs.locator('[name=quantityText]').fill('24');await eggs.locator('[name=notes]').fill('Do telefone <script>');await eggs.getByRole('button',{name:'Guardar alterações'}).click();await pending(p,3);
  await p.getByRole('link',{name:'Despensa',exact:true}).click();
  await p.locator('#product-form [name=name]').fill('Arroz offline');await p.locator('#product-form button').click();await pending(p,4);
  await p.getByRole('link',{name:'Compras',exact:true}).click();
  const productId=await p.locator('#purchase-form select option').nth(1).getAttribute('value');
  async function buy(page,q,total){
   await page.locator('#purchase-form select').selectOption(productId);
   for(const [name,value]of Object.entries({quantity:q,total,store:'Mercearia teste',purchasedOn:'2024-01-01'}))await page.locator(`#purchase-form [name=${name}]`).fill(value);
   await page.locator('#purchase-form button').click();
  }
  await buy(p,'1.5','3.60');await pending(p,5);
  await p.getByRole('link',{name:'Despensa',exact:true}).click();await p.locator('#consume-form select[name=productId]').selectOption(productId);await p.locator('#consume-form [name=quantity]').fill('0.25');await p.locator('#consume-form button').click();await pending(p,6);
  await p.evaluate(()=>navigator.serviceWorker.ready);
  await p.reload();await p.locator('#inventory td').getByText('1,25 kg',{exact:true}).waitFor();
  await context.setOffline(true);await p.reload();await p.locator('#inventory td').getByText('1,25 kg',{exact:true}).waitFor();
  await p.getByRole('link',{name:'Lista',exact:true}).click();await eggs.getByRole('checkbox').uncheck();await pending(p,7);
  await p.getByRole('link',{name:'Dados',exact:true}).click();const downloading=p.waitForEvent('download');await p.locator('#export').click();const download=await downloading;await download.saveAs(path.join(tmp,'backup.json'));
  const backup=JSON.parse(await fs.readFile(path.join(tmp,'backup.json'),'utf8'));assert.equal(backup.profile.pending.length,7);assert.equal(backup.data.purchases.length,1);
  log('API off: create product, purchase, consumption and shopping edits; full offline reload and JSON export');
  await context.close();context=await launch();await context.setOffline(true);p=context.pages()[0];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin+'/#shopping');await p.locator('.shopping-item').nth(38).waitFor();assert.equal((await profile(p)).pending.length,7);assert.equal(await p.locator('#shopping-items script').count(),0);
  log('browser restart retains all queued operations and the cached interface');
  const draft=p.locator('form[data-shopping-index="5"]');await draft.locator('..').locator('summary').click();await draft.locator('[name=notes]').fill('Rascunho sem guardar');
  await context.setOffline(false);await startApi();
  // No manual sync click: the visible-page timer must notice that the API started.
  await pending(p,0);await p.locator('#connection').filter({hasText:'Tudo sincronizado'}).waitFor();
  let remote=await json('/export');assert.equal(remote.products.length,1);assert.equal(remote.purchases.length,1);assert.equal(remote.products[0].stock,1.25);
  const syncedEggs=remote.shoppingList.items.find(i=>i.name==='Ovos');assert.equal(syncedEggs.checked,false);assert.equal(syncedEggs.quantityText,'24');assert.equal(syncedEggs.notes,'Do telefone <script>');
  assert.equal(await p.locator('form[data-shopping-index="5"] [name=notes]').inputValue(),'Rascunho sem guardar');
  assert.equal(await p.evaluate(()=>document.activeElement.name),'notes');await p.locator('.shopping-edit[open] summary').click();
  log('API starts later: automatic timer sends the backlog once, preserving open drafts and keyboard focus across ID remapping');
  let resolveLost;const lost=new Promise(r=>resolveLost=r);let drop=true;
  await p.route('**/api/sync/operations',async route=>{
   if(drop&&route.request().postDataJSON().kind==='PURCHASE_CREATE'){drop=false;await route.fetch();await route.abort();resolveLost();}else await route.continue();
  });
  await p.getByRole('link',{name:'Compras',exact:true}).click();await buy(p,'1','2');await lost;await pending(p,1);
  await p.evaluate(()=>dispatchEvent(new Event('focus')));await pending(p,0);remote=await json('/export');assert.equal(remote.purchases.length,2);assert.equal(remote.products[0].stock,2.25);
  await p.unroute('**/api/sync/operations');
  log('response lost after commit: reconnect acknowledges the durable receipt without duplicating purchase or stock');
  await p.route('**/api/sync/**',route=>route.abort());await p.getByRole('link',{name:'Despensa',exact:true}).click();
  await p.locator('#consume-form select[name=productId]').selectOption(productId);await p.locator('#consume-form [name=quantity]').fill('2');await p.locator('#consume-form button').click();await pending(p,1);
  const consumed=await fetch(api+`/api/products/${productId}/consume`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quantity:1,reason:'Outro dispositivo'})});assert.equal(consumed.status,204);
  await p.unroute('**/api/sync/**');await p.evaluate(()=>dispatchEvent(new Event('focus')));
  await eventually(async()=>{const v=await profile(p);return v.pending[0]?.error;});
  await p.reload();await p.getByRole('link',{name:'Dados',exact:true}).click();await p.locator('.pending-details summary').click();
  assert.equal((await profile(p)).pending.length,1);p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Descartar',exact:true}).click();await pending(p,0);
  remote=await json('/export');assert.equal(remote.products[0].stock,1.25);
  log('conflicting consumption is retained across reload and requires explicit resolution');
  const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(origin+'/#purchases');await second.locator('#connection').filter({hasText:'sincronizado'}).waitFor();
  await p.getByRole('link',{name:'Compras',exact:true}).click();await Promise.all([buy(p,'0.5','1'),buy(second,'0.5','1')]);await pending(p,0);
  remote=await json('/export');assert.equal(remote.purchases.length,4);assert.equal(remote.products[0].stock,2.25);await second.close();
  log('two browser tabs preserve both operations without duplicate deliveries');
  await p.getByRole('link',{name:'Despensa',exact:true}).click();
  await p.evaluate(()=>{IDBObjectStore.prototype.put=function(){throw new DOMException('Teste de armazenamento cheio','QuotaExceededError');};});
  await p.locator('#product-form [name=name]').fill('Não deve ser gravado');await p.locator('#product-form button').click();await p.locator('#message').filter({hasText:'armazenamento cheio'}).waitFor();
  assert.equal((await json('/products')).length,1);await p.reload();
  log('storage failure never reports success or sends an unsaved operation');
  await stopApi();await startApi();await p.evaluate(()=>dispatchEvent(new Event('focus')));await pending(p,0);
  remote=await json('/export');assert.equal(remote.purchases.length,4);assert.equal(remote.products[0].stock,2.25);
  log('database and sync receipts survive a Java API restart');
  await p.getByRole('link',{name:'Lista',exact:true}).click();await p.evaluate(()=>document.fonts.ready);
  const shots=path.resolve(process.env.FOODSTOCK_SHOTS||path.join(root,'.hallmark/shots'));await fs.mkdir(shots,{recursive:true});
  for(const width of [320,375,390,768,1024,1440,1920]){await p.setViewportSize({width,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);}
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(shots,'offline-shopping-mobile.png')});
  await p.setViewportSize({width:1440,height:900});await p.screenshot({path:path.join(shots,'offline-shopping-desktop.png')});
  await p.getByRole('link',{name:'Resumo',exact:true}).click();await p.locator('#year').fill('2024');await p.locator('#year').press('Tab');await p.getByText('Total de 2024').waitFor();
  assert.match(await p.locator('#metrics').innerText(),/7,60/);await p.screenshot({path:path.join(shots,'offline-dashboard-desktop.png')});
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(shots,'offline-dashboard-mobile.png')});
  assert.deepEqual(errors,[]);log('seven responsive widths, exact offline statistics, no uncaught JavaScript errors');
 }finally{
  if(context)await context.close();await stopApi();await new Promise(r=>site.close(r));await fs.rm(tmp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
