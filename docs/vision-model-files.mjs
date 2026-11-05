import {MODEL_CACHE} from './vision-ai-config.mjs?v=20261105.4';
export async function cachePublicFiles(urls,onProgress=()=>{}){
 let cache;try{cache=await globalThis.caches?.open(MODEL_CACHE);}catch{}
 if(!cache)return;
 for(const url of urls){
  if(await cache.match(url))continue;
  onProgress({stage:'download',file:new URL(url).pathname.split('/').pop()});
  const response=await fetch(url,{credentials:'omit'});
  if(!response.ok)throw Error('Não foi possível descarregar os ficheiros de identificação local.');
  await cache.put(url,response);
 }
}
