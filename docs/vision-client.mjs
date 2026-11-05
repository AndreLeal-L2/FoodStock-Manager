import {MODEL_CACHE} from './vision-ai-config.mjs?v=20261105.3';
// A reusable worker keeps public model weights warm between photos; cancellation destroys it.
export class VisionModelClient {
 constructor({workerFactory=url=>new Worker(url,{type:'module'})}={}){this.workerFactory=workerFactory;this.worker=null;this.job=null;}
 dispose(){if(this.job)this.job.finish(new DOMException('Análise cancelada.','AbortError'));this.worker?.terminate();this.worker=null;}
 async clearModel(){this.dispose();if('caches' in globalThis)await caches.delete(MODEL_CACHE);}
 recognize(image,{signal,onProgress=()=>{},visualOnly=false}={}){
  if(this.job)return Promise.reject(Error('Já há uma análise em curso.'));
  return new Promise((resolve,reject)=>{
   const id=crypto.randomUUID(),url=new URL('./vision-ai-worker.mjs'+new URL(import.meta.url).search,import.meta.url);
   if(!this.worker){this.worker=this.workerFactory(url);const worker=this.worker;worker.onmessage=event=>{if(this.worker!==worker)return;const job=this.job;if(!job||event.data.id!==job.id)return;if(event.data.progress){job.onProgress(event.data.progress);return;}const error=event.data.error?Object.assign(Error(event.data.error),{detail:event.data.detail}):null;if(error){worker.terminate();this.worker=null;}job.finish(error,event.data.result);};worker.onerror=()=>{if(this.worker!==worker)return;this.job?.finish(Error('O modelo local não conseguiu iniciar. Tenta recarregar a interface ou usar um navegador atualizado.'));worker.terminate();this.worker=null;};}
   let done=false;const abort=()=>{finish(new DOMException('Análise cancelada.','AbortError'));this.worker?.terminate();this.worker=null;};
   const timeout=setTimeout(()=>{finish(Error('A análise demorou demasiado. Tenta uma fotografia mais simples ou usa o Mac.'));this.worker?.terminate();this.worker=null;},600000);
   const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timeout);signal?.removeEventListener('abort',abort);this.job=null;error?reject(error):resolve(result);};
   this.job={id,finish,onProgress};if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
   try{this.worker.postMessage({id,image,visualOnly},[image.data.buffer]);}catch(error){finish(error);}
  });
 }
}
export async function readImage(file,maxSize){
 if(!file?.type.startsWith('image/')||file.size>20*1024*1024)throw Error('Escolhe uma imagem até 20 MB.');
 let bitmap;try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{throw Error('Não consegui abrir esta imagem. Usa JPEG, PNG ou WebP.');}
 try{if(bitmap.width<48||bitmap.height<48)throw Error('Usa uma imagem com pelo menos 48 × 48 píxeis.');const ratio=Math.min(1,maxSize/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas;}finally{bitmap.close();}
}
