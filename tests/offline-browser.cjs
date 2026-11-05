// Real Chromium + local PostgreSQL (PGlite). Supabase HTTP/Auth/vision boundaries
// and model boundaries are simulated; real ONNX/model gates are separate tests.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const http=require('node:http');const {once}=require('node:events');const {randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),cloudUrl='https://dpayzufrevapbqimpwzn.supabase.co';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function eventually(fn,ms=15000){const deadline=Date.now()+ms;let last;while(Date.now()<deadline){try{const value=await fn();if(value)return value;}catch(e){last=e;}await wait(80);}throw last||Error('Timed out');}
(async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 const alice=randomUUID(),bob=randomUUID(),users={alice:{id:alice,email:'alice@example.com'},bob:{id:bob,email:'bob@example.com'}};
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 await db.query('insert into auth.users values($1),($2)',[alice,bob]);await db.exec(await fs.readFile(path.join(root,'supabase/migrations/202611020001_foodstock.sql'),'utf8'));
 let queue=Promise.resolve();const locked=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
 const sqlRpc=(user,name,args)=>locked(async()=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user.id]);return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;});
 const snapshot=user=>sqlRpc(user,'foodstock_snapshot',[null,[]]);
 const docs=path.join(root,'docs'),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'foodstock-cloud-'));
 const site=http.createServer(async(req,res)=>{try{let file=new URL(req.url,'http://test').pathname;if(file.endsWith('/'))file+='index.html';if(file==='/vision-runtime.mjs'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await fs.readFile(path.join(root,'tests/fixtures/simulated-model-runtime.mjs')));return;}const full=path.resolve(docs,'.'+decodeURIComponent(file));if(!full.startsWith(docs+path.sep))throw Error();res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.ttf':'font/ttf','.wasm':'application/wasm'})[path.extname(full)]||'application/octet-stream'});res.end(await fs.readFile(full));}catch{res.writeHead(404);res.end();}});
 site.listen(0,'127.0.0.1');await once(site,'listening');const origin=`http://127.0.0.1:${site.address().port}`;
 let context,online=true,loseNext=false,visionCalls=0,authRefreshes=0;
 const errors=[];const requests=[];
 const launch=async()=>{
  const ctx=await chromium.launchPersistentContext(path.join(tmp,'browser'),{executablePath:process.env.FOODSTOCK_BROWSER||'/usr/bin/chromium',headless:true,args:['--no-sandbox'],viewport:{width:390,height:844}});
  ctx.on('page',page=>{page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));});
  await ctx.route(cloudUrl+'/**',async route=>{
   if(!online)return route.abort('connectionrefused');
   const req=route.request(),url=new URL(req.url()),body=req.postDataJSON(),token=req.headers().authorization?.replace('Bearer ','');
   const user=Object.values(users).find(u=>token==='token-'+u.id);
   const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(url.pathname==='/auth/v1/token'){
    let u;if(url.searchParams.get('grant_type')==='refresh_token'){u=Object.values(users).find(u=>body.refresh_token==='refresh-'+u.id);authRefreshes++;}else u=Object.values(users).find(u=>u.email===body.email&&body.password==='password123');
    if(!u)return reply({message:'Email ou palavra-passe inválidos.'},400);
    return reply({access_token:'token-'+u.id,refresh_token:'refresh-'+u.id,expires_in:3600,user:u});
   }
   if(url.pathname==='/auth/v1/signup')return reply({user:users.alice});
   if(url.pathname==='/auth/v1/logout')return reply({});
   if(!user)return reply({message:'Unauthorized'},401);
   if(url.pathname.startsWith('/functions/')){visionCalls++;return reply({message:'Unexpected external recognition request'},500);}
   try{
    const name=url.pathname.split('/').pop();let args;
    if(name==='foodstock_snapshot')args=[body.p_expected_instance_id,body.p_pending_ids];
    else if(name==='foodstock_apply')args=[body.p_operation];
    else if(name==='foodstock_import')args=[body.p_import_id,body.p_data];
    else return reply({message:'Not found'},404);
    const result=await sqlRpc(user,name,args);
    if(loseNext&&name==='foodstock_apply'){loseNext=false;online=false;return route.abort('failed');}
    return reply(result);
   }catch(e){return reply({message:e.message,code:e.code},e.code==='40001'?409:400);}
  });return ctx;
 };
 async function profile(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('foodstock-offline-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('profiles'),get=tx.objectStore('profiles').getAll();get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();};}));}
 const current=async p=>(await profile(p)).find(v=>v.key===`supabase:${cloudUrl}:${alice}`);
 const pending=(p,n)=>eventually(async()=>{const v=await current(p);return v?.pending.length===n&&v;});
 const log=msg=>console.log('PASS:',msg);
 try{
  context=await launch();let page=await context.newPage();await page.goto(origin);await page.waitForFunction(()=>document.querySelector('#connection').textContent!=='A abrir os dados deste navegador…');
  await page.locator('nav a[href="#stock"]').click();await page.locator('#product-form [name=name]').fill('Arroz');await page.locator('#product-form [name=initialStock]').fill('5');await page.locator('#product-form button').click();await eventually(async()=>assert.equal((await profile(page)).find(v=>v.key==='primary')?.pending.length,1)||true);
  await page.locator('nav a[href="#settings"]').click();assert.equal(await page.locator('#supabase-url,#supabase-key,#settings-form').count(),0);assert.match(await page.locator('.settings-connection h2').textContent(),/FoodStock/);
  await page.locator('#auth-form [name=email]').fill(users.alice.email);await page.locator('#auth-form [name=password]').fill('password123');await page.locator('#auth-form button[value=login]').click();await pending(page,0);
  await page.locator('#migrate-local').waitFor();page.once('dialog',d=>d.accept());await page.locator('#migrate-local').click();await eventually(async()=>(await snapshot(users.alice)).data.products.length===1);await eventually(async()=>(await current(page))?.base.products.length===1);
  assert.equal((await snapshot(users.alice)).data.products[0].stock,5);assert.equal((await profile(page)).find(v=>v.key==='primary').pending.length,1);log('guest data migration preserves the original offline copy and exact stock');
  online=false;await page.locator('nav a[href="#shopping"]').click();await page.locator('#import-shopping').click();await page.locator('[data-shopping-id="template-7"]').check();await page.locator('#checkout-open').click();await page.locator('#checkout-form [name=store]').fill('Continente');await page.locator('#checkout-form [name=purchasedOn]').fill('2026-01-01');await page.locator('#checkout-form [name=quantity]').fill('1');await page.locator('#checkout-form [name=total]').fill('2');await page.locator('#checkout-form [data-checkout-later]').click();await page.locator('#checkout-panel').waitFor({state:'hidden'});
  await page.reload();await page.locator('nav a[href="#shopping"]').click();assert.equal(await page.locator('#checkout-form [name=store]').inputValue(),'Continente');await page.locator('#checkout-form button[type=submit]').click();await pending(page,3);await page.locator('#checkout-panel').waitFor({state:'hidden'});assert.equal((await current(page)).base.products[0].stock,5);
  log('offline checkout draft survives reload, then saves one stock-and-expense operation');
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);await context.setOffline(true);await page.reload();await page.locator('nav a[href="#shopping"]').click();await pending(page,3);assert.match(await page.locator('#shopping-status').textContent(),/0 de 39/);await context.close();context=await launch();page=await context.newPage();await page.goto(origin);await pending(page,3);online=true;await page.locator('#refresh').click();await pending(page,0);let server=await snapshot(users.alice);assert.equal(server.data.products[0].stock,6);assert.equal(server.data.purchases.length,1);log('browser restart retains outbox; reconnect synchronizes once with authenticated Supabase');
  await page.locator('nav a[href="#stock"]').click();
  const samples=await page.evaluate(()=>{
   function label(seed,title){const c=document.createElement('canvas');c.width=300;c.height=220;const g=c.getContext('2d');g.fillStyle='#f5f0df';g.fillRect(0,0,300,220);g.fillStyle='#163d65';g.fillRect(0,0,300,48);g.fillStyle='#fff';g.font='bold 28px sans-serif';g.fillText(title,12,34);
    for(let i=0;i<150;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=12+(seed%276);seed=(Math.imul(seed,1664525)+1013904223)>>>0;const y=60+(seed%145);g.fillStyle=i%2?'#153b23':'#9a2828';g.fillRect(x,y,3+(i%8),3+((i*3)%9));}return c;}
   const rice=label(1234,'ARROZ'),beans=label(786,'FEIJAO'),scene=document.createElement('canvas');scene.width=800;scene.height=380;const g=scene.getContext('2d');g.fillStyle='#bbb';g.fillRect(0,0,800,380);g.drawImage(rice,35,40);g.drawImage(beans,445,105);
   const blank=document.createElement('canvas');blank.width=300;blank.height=220;const bg=blank.getContext('2d');bg.fillStyle='#fff';bg.fillRect(0,0,300,220);return {blank:blank.toDataURL('image/png').split(',')[1],rice:rice.toDataURL('image/png').split(',')[1],beans:beans.toDataURL('image/png').split(',')[1],scene:scene.toDataURL('image/png').split(',')[1]};
  });
  assert.equal(await page.locator('#visual-catalog,#reference-form').count(),0);
  online=false;await context.setOffline(true);const slow=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=801;c.height=380;return c.toDataURL('image/png').split(',')[1];});await page.locator('[data-photo-input]').first().setInputFiles({name:'slow.png',mimeType:'image/png',buffer:Buffer.from(slow,'base64')});await page.locator('#photo-analyze').click();await page.locator('#photo-cancel').click();await eventually(async()=>(await page.locator('#photo-status').textContent()).includes('cancelada'));assert.equal((await current(page)).pending.length,0);
  await page.locator('[data-photo-input]').first().setInputFiles({name:'pantry.png',mimeType:'image/png',buffer:Buffer.from(samples.scene,'base64')});await page.locator('#photo-analyze').click();await page.locator('#photo-review-form').waitFor();assert.equal(visionCalls,0);assert.equal((await snapshot(users.alice)).data.products.length,1);assert.equal((await current(page)).photoDraft.items.length,2);await fs.mkdir(path.join(root,'.hallmark/shots'),{recursive:true});await page.locator('#photo-preview').screenshot({path:path.join(root,'.hallmark/shots/local-ai-matches.png')});
  const riceRow='[data-photo-line]:has([name=name][value="Arroz"])',beansRow='[data-photo-line]:has([name=name][value="Feijão"])';assert.equal(await page.locator(riceRow+' [name=quantity]').inputValue(),'');
  await page.locator(riceRow+' [name=quantity]').fill('2');await page.locator(beansRow+' [name=quantity]').fill('3');await page.locator(beansRow+' [name=unit]').selectOption('un');await page.locator(beansRow+' [name=quantity]').blur();await eventually(async()=>(await current(page))?.photoDraft?.items.find(i=>i.name==='Feijão')?.quantity==='3');
  await page.reload();await page.locator('nav a[href="#stock"]').click();await page.locator('#photo-review-form').waitFor();assert.equal(await page.locator(riceRow+' [name=quantity]').inputValue(),'2');
  await page.evaluate(async()=>{await (await caches.open('foodstock-ai-model-v1')).put('./test-model',new Response('public weights'));});page.once('dialog',d=>d.accept());await page.locator('#photo-clear-model').click();await eventually(async()=>!(await page.evaluate(()=>caches.has('foodstock-ai-model-v1'))));assert.equal((await current(page)).photoDraft.items.length,2);
  await page.locator('#photo-review-form button[type=submit]').click();assert.equal((await current(page)).pending.length,0);await page.locator('#photo-review-form [name=reviewed]').check();
  for(const width of [320,390,640,768,960,1024,1440]){await page.setViewportSize({width,height:900});const outside=await page.locator('#photo-review-form input, #photo-review-form select, #photo-review-form button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).filter(n=>n.getBoundingClientRect().left<0||n.getBoundingClientRect().right>innerWidth+1).length);assert.equal(outside,0,'photo layout at '+width);}
  await page.setViewportSize({width:390,height:844});await fs.mkdir(path.join(root,'.hallmark/shots'),{recursive:true});await page.screenshot({path:path.join(root,'.hallmark/shots/supabase-photo-mobile.png'),fullPage:true});
  await page.locator('#photo-review-form button[type=submit]').evaluate(b=>{b.click();b.click();});await pending(page,1);assert.equal((await current(page)).pending[0].kind,'INVENTORY_CAPTURE');await page.locator('#photo-review').waitFor({state:'hidden'});log('no-reference UI with a simulated local model: cancel, required review, offline draft, mobile layout and one atomic confirmation');
  await context.setOffline(false);online=true;loseNext=true;await page.locator('#refresh').click();await eventually(async()=>(await snapshot(users.alice)).data.products.length===2);assert.equal((await current(page)).pending.length,1);online=true;await page.locator('#refresh').click();await pending(page,0);server=await snapshot(users.alice);assert.equal(server.data.products.find(p=>p.name==='Arroz').stock,2);assert.equal(server.data.products.find(p=>p.name==='Feijão').stock,3);assert.equal(server.data.purchases.length,1);log('lost response after inventory commit cannot duplicate stock; recount does not create expenses');
  await page.locator('nav a[href="#settings"]').click();await page.locator('#signout').click();await page.locator('#auth-form').waitFor();await page.locator('#auth-form [name=email]').fill(users.bob.email);await page.locator('#auth-form [name=password]').fill('password123');await page.locator('#auth-form button[value=login]').click();await page.locator('#account-email').filter({hasText:users.bob.email}).waitFor();await page.locator('nav a[href="#stock"]').click();await eventually(async()=>!(await page.locator('#inventory').textContent()).includes('Arroz'));assert.equal((await snapshot(users.bob)).data.products.length,0);assert.equal((await snapshot(users.alice)).data.products.length,2);log('sign out and account switch isolate caches, drafts and cloud data');
  await page.locator('nav a[href="#settings"]').click();const invalidBackup={schemaVersion:3,products:[{id:randomUUID(),name:'Inválido',unit:'g',stock:1,minimumStock:0}],purchases:[],movements:[]};page.once('dialog',d=>d.accept());await page.locator('#import-file').setInputFiles({name:'invalid-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalidBackup))});await page.locator('#cancel-import').waitFor();await eventually(async()=>(await page.locator('#message').textContent()).includes('Unidade inválida'));page.once('dialog',d=>d.accept());await page.locator('#cancel-import').click();await page.locator('#cancel-import').waitFor({state:'hidden'});assert.equal((await snapshot(users.bob)).data.products.length,0);log('invalid import preserves cloud data and can be cancelled without losing the source');
  // Expired cached sessions refresh before any cloud RPC, retaining the same account scope.
  await page.evaluate(()=>{const key='foodstock-session:https://dpayzufrevapbqimpwzn.supabase.co',s=JSON.parse(localStorage.getItem(key));s.expires_at=0;localStorage.setItem(key,JSON.stringify(s));});await page.reload();await eventually(()=>authRefreshes>0);log('expired sessions refresh securely before syncing');
  online=false;await page.locator('nav a[href="#stock"]').click();
  const before=(await profile(page)).find(v=>v.key.endsWith(':'+bob));
  await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;window.restoreTransactions=()=>{IDBDatabase.prototype.transaction=original;};IDBDatabase.prototype.transaction=function(names,mode,options){if(mode==='readwrite')throw Error('simulated storage failure');return original.call(this,names,mode,options);};});
  await page.locator('#product-form [name=name]').fill('Falha de armazenamento');await page.locator('#product-form button').click();await eventually(async()=>(await page.locator('#message').textContent()).includes('simulated storage failure'));await page.evaluate(()=>window.restoreTransactions());assert.deepEqual((await profile(page)).find(v=>v.key.endsWith(':'+bob)).pending,before.pending);assert.equal((await snapshot(users.bob)).data.products.length,0);log('storage failure cannot report a successful save or send unsaved data');
  const second=await context.newPage();await second.goto(origin);await second.locator('nav a[href="#stock"]').click();
  await page.locator('#product-form [name=name]').fill('Da primeira aba');await second.locator('#product-form [name=name]').fill('Da segunda aba');await Promise.all([page.locator('#product-form button').click(),second.locator('#product-form button').click()]);
  await eventually(async()=>(await profile(page)).find(v=>v.key.endsWith(':'+bob))?.pending.length===2);online=true;await Promise.all([page.locator('#refresh').click(),second.locator('#refresh').click()]);await eventually(async()=>(await profile(page)).find(v=>v.key.endsWith(':'+bob))?.pending.length===0);assert.equal((await snapshot(users.bob)).data.products.length,2);await second.close();log('two tabs preserve both writes and synchronize without duplicates');
  assert.equal(requests.some(url=>/localhost:8080|127\.0\.0\.1:8080|openai\.com|functions\/v1\/recognize-food/.test(url)),false);assert.equal(visionCalls,0);assert.deepEqual(errors,[]);log('no local Java dependency and no uncaught JavaScript errors');
 }finally{await context?.close();await new Promise(r=>site.close(r));await db.close();await fs.rm(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
