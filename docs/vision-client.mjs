// Each bounded job runs outside the UI thread and owns its memory/abort lifecycle.
export function runVision(mode,image,references=[],{signal,onProgress=()=>{}}={}){
 return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID(),url=new URL('./vision-worker.mjs'+new URL(import.meta.url).search,import.meta.url),worker=new Worker(url,{type:'module'});
  let done=false;const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timeout);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(result);};
  const abort=()=>finish(new DOMException('Análise cancelada.','AbortError'));
  const timeout=setTimeout(()=>finish(Error('A análise demorou demasiado. Recorta a imagem ou usa menos referências e tenta novamente.')),30000);
  if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=event=>{if(event.data.id!==id)return;if(event.data.progress){onProgress(event.data.progress);return;}finish(event.data.error?Error(event.data.error):null,event.data.result);};
  worker.onerror=()=>finish(Error('Não foi possível iniciar a visão local. Recarrega a interface e tenta novamente.'));
  try{worker.postMessage({id,mode,image,references},[image.data.buffer]);}catch(error){finish(error);}
 });
}
export async function readImage(file,maxSize){
 if(!file?.type.startsWith('image/')||file.size>20*1024*1024)throw Error('Escolhe uma imagem até 20 MB.');
 let bitmap;try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{throw Error('Não consegui abrir esta imagem. Usa JPEG, PNG ou WebP.');}
 try{
  if(bitmap.width<48||bitmap.height<48)throw Error('Usa uma imagem com pelo menos 48 × 48 píxeis.');
  const ratio=Math.min(1,maxSize/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas;
 }finally{bitmap.close();}
}
export function thumbnail(canvas){const small=document.createElement('canvas'),ratio=Math.min(1,160/Math.max(canvas.width,canvas.height));small.width=Math.max(1,Math.round(canvas.width*ratio));small.height=Math.max(1,Math.round(canvas.height*ratio));small.getContext('2d').drawImage(canvas,0,0,small.width,small.height);return small.toDataURL('image/jpeg',.7);}
