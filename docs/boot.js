// This loader must run before importing any application module, including after an update.
(()=>{
 const VERSION='20261104.1';
 const button=document.querySelector('#recover-interface'),message=document.querySelector('#message');
 function failed(error){
  console.error('FoodStock startup:',error);
  document.querySelector('#connection').textContent='Não foi possível iniciar a aplicação.';
  message.hidden=false;message.className='';message.dataset.bootError='true';
  message.textContent='A interface não terminou de carregar. Tenta recarregá-la. Os alimentos, compras e alterações guardadas neste navegador serão mantidos.';
  button.hidden=false;
 }
 button.addEventListener('click',async()=>{
  button.disabled=true;
  try{
   const scope=new URL('./',document.baseURI).href;
   if('serviceWorker' in navigator){const registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.filter(r=>r.scope===scope).map(r=>r.unregister()));}
   // Only disposable application files: IndexedDB, localStorage and session data are untouched.
   if('caches' in window)await Promise.all((await caches.keys()).filter(k=>k.startsWith('foodstock-shell-')).map(k=>caches.delete(k)));
   const url=new URL(location.href);url.searchParams.set('refresh',String(Date.now()));location.replace(url);
  }catch(error){failed(error);button.disabled=false;}
 });
 if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{
  const note=document.querySelector('#offline-cache-note');if(note)note.textContent='Os dados ficam guardados, mas a interface ainda não está preparada para abrir sem Internet.';
 });
 const timeout=setTimeout(()=>failed(Error('Startup timeout')),20000);
 import('./app.js?v='+VERSION).then(()=>{
  clearTimeout(timeout);
  if(message.dataset.bootError){message.hidden=true;delete message.dataset.bootError;button.hidden=true;}
 }).catch(error=>{clearTimeout(timeout);failed(error);});
})();
