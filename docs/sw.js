const CACHE='foodstock-shell-v5';
const ASSETS=['./','index.html','style.css','tokens.css','base.css','app.js','store.mjs','model.mjs','checkout.mjs','shopping-template.mjs','fonts/host-grotesk.ttf','fonts/atkinson-mono.ttf'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('foodstock-shell-')&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('index.html',self.registration.scope))));
 else if(ASSETS.some(asset=>new URL(asset,self.registration.scope).pathname===url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
