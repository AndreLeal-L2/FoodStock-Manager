const VERSION='20261105.4';
const CACHE='foodstock-shell-'+VERSION;
const MODEL_CACHE='foodstock-ai-model-v1';
const FILES=['./','index.html','style.css','tokens.css','base.css','boot.js','app.js','store.mjs','model.mjs','checkout.mjs','cloud.mjs','config.mjs','vision.mjs','vision-model.mjs','vision-client.mjs','vision-ai-worker.mjs','vision-runtime.mjs','vision-model-files.mjs','vision-ai-config.mjs','vision-results.mjs','food-labels.mjs','label-results.mjs','label-runtime.mjs','photo-recognizer.mjs','shopping-template.mjs','fonts/host-grotesk.ttf','fonts/atkinson-mono.ttf'];
const ASSETS=FILES.map(path=>/\.(?:css|js|mjs)$/.test(path)?path+'?v='+VERSION:path);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(asset=>new Request(new URL(asset,self.registration.scope),{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([
 caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('foodstock-shell-')&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()
])));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 if(['vendor/vision-4.3.2/','vendor/labels-7.0.0/'].some(path=>url.pathname.startsWith(new URL(path,self.registration.scope).pathname))){event.respondWith(caches.open(MODEL_CACHE).then(async cache=>{const cached=await cache.match(event.request);if(cached)return cached;const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}));return;}
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(cache=>cache.match(new URL('index.html',self.registration.scope)))));
 else if(ASSETS.some(asset=>new URL(asset,self.registration.scope).href===url.href))event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request)).then(cached=>cached||fetch(event.request)));
});
