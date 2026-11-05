import {MODEL,MODEL_CACHE} from './vision-ai-config.mjs?v=20261105.1';
// Pin the first download to an immutable Hub commit, then reuse it offline.
// Only a public model ID/revision is sent. Images never enter these requests.
export async function resolveModelRevision({fetcher=globalThis.fetch,cacheStorage=globalThis.caches}={}){
 if(/^[0-9a-f]{40}$/.test(MODEL.revision))return MODEL.revision;
 const key=new URL('./local-model-manifest.json',import.meta.url).href;let cache;
 try{cache=await cacheStorage?.open(MODEL_CACHE);const response=await cache?.match(key);if(response){const saved=await response.json();if(saved.model===MODEL.id&&/^[0-9a-f]{40}$/.test(saved.revision))return saved.revision;}}catch{}
 const response=await fetcher('https://huggingface.co/api/models/'+MODEL.id,{credentials:'omit'});
 if(!response.ok)throw Error('Não foi possível obter o modelo público. Verifica a Internet para o primeiro download.');
 const metadata=await response.json();if(metadata.private||metadata.gated||!/^[0-9a-f]{40}$/.test(metadata.sha))throw Error('O modelo não está disponível para download público.');
 const manifest={model:MODEL.id,revision:metadata.sha};try{await cache?.put(key,new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));}catch{}
 return manifest.revision;
}
