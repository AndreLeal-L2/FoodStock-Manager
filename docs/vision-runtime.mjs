import {cachePublicFiles} from './vision-model-files.mjs?v=20261105.4';
import {MODEL,MODEL_CACHE,RUNTIME_PATH} from './vision-ai-config.mjs?v=20261105.4';
import {VISUAL_QUERIES} from './food-labels.mjs?v=20261105.4';
import {processPredictions} from './vision-results.mjs?v=20261105.4';
export async function loadLibrary({onProgress=()=>{}}={}){
 // Persist lazy runtime files even if first use starts before the service worker claims the page.
 await cachePublicFiles(['transformers.mjs','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm'].map(file=>new URL(RUNTIME_PATH+file,import.meta.url).href),onProgress);
 return import(new URL(RUNTIME_PATH+'transformers.mjs',import.meta.url));
}
export function configureLibrary(library){
 const {env}=library;env.allowLocalModels=false;env.useFSCache=false;env.useBrowserCache=true;env.cacheKey=MODEL_CACHE;
 env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
 env.backends.onnx.wasm.wasmPaths={mjs:new URL(RUNTIME_PATH+'ort-wasm-simd-threaded.jsep.mjs',import.meta.url).href,wasm:new URL(RUNTIME_PATH+'ort-wasm-simd-threaded.jsep.wasm',import.meta.url).href};
}
export class LocalFoodRecognizer {
 constructor({libraryLoader=loadLibrary,onProgress=()=>{},revisionResolver=async()=>MODEL.revision}={}){Object.assign(this,{libraryLoader,onProgress,revisionResolver,device:null,model:null,processor:null,library:null});}
 async prepare(){
  if(this.model)return;
  if(globalThis.navigator?.deviceMemory&&navigator.deviceMemory<4)throw Error('Este dispositivo tem pouca memória para a análise visual. Usa a leitura de rótulos ou um computador com pelo menos 4 GB.');
  this.onProgress({stage:'runtime'});const revision=await this.revisionResolver();this.library=await this.libraryLoader({onProgress:this.onProgress});configureLibrary(this.library);
  // The upstream tokenizer existence probe drops its revision/options. Pin the URL
  // template too, so that probe reads the same immutable files from our cache.
  this.library.env.remotePathTemplate='{model}/resolve/'+revision+'/';
  const progress_callback=event=>{if(event.status==='progress')this.onProgress({stage:'download',file:String(event.file||'').split('/').pop(),loaded:Number(event.loaded)||0,total:Number(event.total)||0,progress:Number(event.progress)||0});else if(['initiate','download','done'].includes(event.status))this.onProgress({stage:'download',file:String(event.file||'').split('/').pop()});};
  this.options={revision,dtype:MODEL.dtype,progress_callback:null,local_files_only:true};
  const load=async()=>{
   // Transformers.js requires this flag even for its browser-cache-only mode.
   this.library.env.allowLocalModels=this.options.local_files_only;
   this.processor=await this.library.AutoProcessor.from_pretrained(MODEL.id,this.options);
   this.tokenizer=await this.library.AutoTokenizer.from_pretrained(MODEL.id,this.options);
   this.device='wasm';
   this.model=await this.library.AutoModelForZeroShotObjectDetection.from_pretrained(MODEL.id,{...this.options,device:this.device});
  };
  // Optional Hub files may be absent even after a complete download. Cache-only mode
  // returns null for them instead of attempting network requests during offline startup.
  try{await load();}catch(error){this.options={...this.options,progress_callback,local_files_only:false};await load();}
  this.onProgress({stage:'ready',device:this.device});
 }
 async recognize(image){
  await this.prepare();
  const raw=new this.library.RawImage(image.data,image.width,image.height,4);
  const inputs={...this.tokenizer(VISUAL_QUERIES.map(query=>query.text),{padding:true,truncation:true}),...await this.processor.image_processor(raw)};
  this.onProgress({stage:'inference',device:this.device});
  const output=await this.model(inputs);
  const result=this.processor.image_processor.post_process_object_detection(output,MODEL.boxThreshold,[[image.height,image.width]],true)[0];
  if(!result||!Array.isArray(result.boxes)||!Array.isArray(result.classes)||!Array.isArray(result.scores)||result.boxes.length!==result.classes.length||result.boxes.length!==result.scores.length)throw Error('Resposta do modelo inválida.');
  const predictions=result.boxes.map((box,index)=>{
   if(!Array.isArray(box)||box.length!==4||!Number.isInteger(result.classes[index])||!VISUAL_QUERIES[result.classes[index]])throw Error('Identificação do modelo inválida.');
   return {label:VISUAL_QUERIES[result.classes[index]].label,score:result.scores[index],box:{xmin:box[0],ymin:box[1],xmax:box[2],ymax:box[3]}};
  });
  predictions.sort((a,b)=>b.score-a.score);
  return {...processPredictions(predictions.slice(0,900),image.width,image.height,{threshold:MODEL.boxThreshold}),model:{id:MODEL.id,device:this.device,predictionCount:predictions.length,topPredictions:predictions.slice(0,8).map(({label,score})=>({label,score}))}};
 }
 async dispose(){await this.model?.dispose?.();this.model=null;this.processor=null;this.tokenizer=null;}
}
