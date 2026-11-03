const VERSION='20261103.1';
const CACHE='foodstock-shell-'+VERSION;
const FILES=['./','index.html','style.css','tokens.css','base.css','boot.js','app.js','store.mjs','model.mjs','checkout.mjs','cloud.mjs','config.mjs','vision.mjs','vision-model.mjs','shopping-template.mjs','fonts/host-grotesk.ttf','fonts/atkinson-mono.ttf'];
const ASSETS=FILES.map(path=>/\.(?:css|js|mjs)$/.test(path)?path+'?v='+VERSION:path);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(asset=>new Request(new URL(asset,self.registration.scope),{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([
 caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('foodstock-shell-')&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()
])));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(cache=>cache.match(new URL('index.html',self.registration.scope)))));
 else if(ASSETS.some(asset=>new URL(asset,self.registration.scope).href===url.href))event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request)).then(cached=>cached||fetch(event.request)));
});
