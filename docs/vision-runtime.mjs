import {resolveModelRevision} from './vision-model-files.mjs?v=20261105.1';
import {MODEL,MODEL_CACHE,RUNTIME_PATH} from './vision-ai-config.mjs?v=20261105.1';
import {FOOD_PROMPTS} from './food-labels.mjs?v=20261105.1';
import {processPredictions} from './vision-results.mjs?v=20261105.1';
export async function loadLibrary({onProgress=()=>{}}={}){
 // Persist lazy runtime files even if first use starts before the service worker claims the page.
 let cache;try{cache=await globalThis.caches?.open(MODEL_CACHE);}catch{}
 if(cache)for(const file of ['transformers.mjs','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm']){
  const url=new URL(RUNTIME_PATH+file,import.meta.url).href;if(await cache.match(url))continue;
  onProgress({stage:'download',file});const response=await fetch(url,{credentials:'omit'});if(!response.ok)throw Error('Não foi possível carregar o runtime local.');await cache.put(url,response);
 }
 return import(new URL(RUNTIME_PATH+'transformers.mjs',import.meta.url));
}
export function configureLibrary(library){
 const {env}=library;env.allowLocalModels=false;env.useFSCache=false;env.useBrowserCache=true;env.cacheKey=MODEL_CACHE;
 env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
 env.backends.onnx.wasm.wasmPaths={mjs:new URL(RUNTIME_PATH+'ort-wasm-simd-threaded.jsep.mjs',import.meta.url).href,wasm:new URL(RUNTIME_PATH+'ort-wasm-simd-threaded.jsep.wasm',import.meta.url).href};
}
export class LocalFoodRecognizer {
 constructor({libraryLoader=loadLibrary,onProgress=()=>{},gpu=globalThis.navigator?.gpu,revisionResolver=resolveModelRevision}={}){Object.assign(this,{libraryLoader,onProgress,gpu,revisionResolver,device:null,model:null,processor:null,library:null});}
 async prepare(){
  if(this.model)return;
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
   // A smaller image budget limits activation memory on phones. No picture leaves this worker.
   this.processor.image_processor.size={shortest_edge:480,longest_edge:640};
   let adapter;try{adapter=await this.gpu?.requestAdapter();}catch{}
   this.device=adapter?'webgpu':'wasm';
   try{this.model=await this.library.AutoModelForZeroShotObjectDetection.from_pretrained(MODEL.id,{...this.options,device:this.device});}
   catch(error){if(this.device!=='webgpu')throw error;this.onProgress({stage:'fallback'});this.device='wasm';this.model=await this.library.AutoModelForZeroShotObjectDetection.from_pretrained(MODEL.id,{...this.options,device:'wasm'});}
  };
  // Optional Hub files may be absent even after a complete download. Cache-only mode
  // returns null for them instead of attempting network requests during offline startup.
  try{await load();}catch(error){this.options={...this.options,progress_callback,local_files_only:false};await load();}
  this.onProgress({stage:'ready',device:this.device});
 }
 async recognize(image){
  await this.prepare();
  const raw=new this.library.RawImage(image.data,image.width,image.height,4),predictions=[];
  // Short category captions avoid interference between dozens of unrelated food names.
  for(const [part,prompt] of FOOD_PROMPTS.entries()){
   this.onProgress({stage:'inference',device:this.device,part:part+1,total:FOOD_PROMPTS.length});
   const inputs=await this.processor(raw,prompt,{padding:true,truncation:true,max_length:256});
   let output;
   try{output=await this.model(inputs);}catch(error){if(this.device!=='webgpu')throw error;await this.model.dispose?.();this.onProgress({stage:'fallback'});this.device='wasm';this.model=await this.library.AutoModelForZeroShotObjectDetection.from_pretrained(MODEL.id,{...this.options,device:'wasm'});output=await this.model(inputs);}
   const result=this.processor.post_process_grounded_object_detection(output,inputs.input_ids,{box_threshold:MODEL.boxThreshold,text_threshold:MODEL.textThreshold,target_sizes:[[image.height,image.width]]})[0];
   if(!result||!Array.isArray(result.boxes)||!Array.isArray(result.labels)||!Array.isArray(result.scores)||result.boxes.length!==result.labels.length||result.boxes.length!==result.scores.length)throw Error('Resposta do modelo inválida.');
   predictions.push(...result.boxes.map((b,i)=>({label:result.labels[i],score:result.scores[i],box:{xmin:b[0],ymin:b[1],xmax:b[2],ymax:b[3]}})));
  }
  predictions.sort((a,b)=>b.score-a.score);
  return {...processPredictions(predictions.slice(0,900),image.width,image.height,{threshold:MODEL.boxThreshold}),model:{id:MODEL.id,device:this.device,predictionCount:predictions.length,topPredictions:predictions.slice(0,8).map(({label,score})=>({label,score}))}};
 }
 async dispose(){await this.model?.dispose?.();this.model=null;this.processor=null;}
}
