import test from 'node:test';import assert from 'node:assert/strict';
import {foodForLabel,FOOD_PROMPT} from '../docs/food-labels.mjs';
import {processPredictions} from '../docs/vision-results.mjs';
import {resolveModelRevision} from '../docs/vision-model-files.mjs';
import {LocalFoodRecognizer} from '../docs/vision-runtime.mjs';
import {VisionModelClient} from '../docs/vision-client.mjs';
import {photoDraft,captureData} from '../docs/vision-model.mjs';
const box=(xmin=0,ymin=0,xmax=100,ymax=100)=>({xmin,ymin,xmax,ymax});
const prediction=(label,score=.8,b=box())=>({label,score,box:b});
const image=()=>({width:100,height:100,data:new Uint8ClampedArray(100*100*4)});
test('automatic vocabulary covers pantry foods without a user reference catalogue',()=>{
 assert.equal(foodForLabel('bag of rice').name,'Arroz');assert.equal(foodForLabel('canned beans').name,'Feijão');assert.equal(foodForLabel('tomato sauce').name,'Polpa de tomate');assert.equal(foodForLabel('orange juice').name,'Sumo');assert.equal(foodForLabel('potato chips').name,'Batatas fritas');assert.equal(foodForLabel('spaceship'),null);assert.equal(foodForLabel('rice milk'),null);assert.ok(FOOD_PROMPT.includes('rice.'));
});
test('model results reject unknown/weak/invalid predictions, clip boxes and deduplicate overlapping products',()=>{
 const result=processPredictions([prediction('rice',.9,box(-20,-10,80,90)),prediction('rice',.8,box(0,0,75,85)),prediction('beans',.8,box(110,10,180,90)),prediction('spaceship'),prediction('milk',.1),prediction('water bottle',NaN),prediction('eggs',.8,{...box(),xmax:Infinity})],200,100);
 assert.equal(result.items.length,2);assert.deepEqual(result.items.map(i=>i.name),['Arroz','Feijão']);assert.equal(result.detections[0].box.xmin,0);assert.equal(result.items[0].visibleCount,1);assert.equal(result.items[0].quantity,null);assert.equal(result.items[0].unit,null);assert.equal(result.items[0].brand,'');
});
test('separate boxes count visible packages, while physical inventory remains a reviewed value',()=>{
 const {items}=processPredictions([prediction('rice',.9,box(0,0,80,90)),prediction('rice',.8,box(110,10,180,90))],200,100);assert.equal(items[0].visibleCount,2);
 const draft=photoDraft(items,[{id:'rice',name:'Arroz',unit:'kg',stock:4.25}]);assert.equal(draft.items[0].quantity,'');assert.equal(draft.items[0].expectedStock,4.25);draft.items[0].quantity='2';assert.equal(captureData(draft).items[0].quantity,2);
 assert.equal(processPredictions([],200,100).items.length,0);
});
function fakeLibrary({failGpuLoad=false,failGpuRun=false}={}){
 const calls={downloads:[],images:[],disposed:0};
 const processor=Object.assign(async(raw,prompt)=>{calls.images.push(raw);assert.ok(prompt.includes('rice.'));return {pixel_values:'private-in-memory',input_ids:[1]};},{image_processor:{size:{}},post_process_grounded_object_detection:()=>[{boxes:[[0,0,80,90]],labels:['rice'],scores:[.8]}]});
 const library={env:{backends:{onnx:{wasm:{}}}},RawImage:class{constructor(data,width,height,channels){Object.assign(this,{data,width,height,channels});}},AutoProcessor:{from_pretrained:async(id,options)=>{calls.downloads.push({id,options});return processor;}},AutoModelForZeroShotObjectDetection:{from_pretrained:async(id,options)=>{calls.downloads.push({id,options});if(failGpuLoad&&options.device==='webgpu')throw Error('GPU unavailable');return Object.assign(async inputs=>{assert.equal(inputs.pixel_values,'private-in-memory');if(failGpuRun&&options.device==='webgpu')throw Error('GPU op unsupported');return {};},{dispose:async()=>calls.disposed++});}}};return {library,calls};
}
test('model adapter keeps pixels local, loads public weights once and reuses the prepared model',async()=>{
 const {library,calls}=fakeLibrary();let loads=0;const recognizer=new LocalFoodRecognizer({revisionResolver:async()=>'a'.repeat(40),libraryLoader:async()=>{loads++;return library;},gpu:null});
 assert.equal((await recognizer.recognize(image())).items[0].name,'Arroz');await recognizer.recognize(image());assert.equal(loads,1);assert.equal(calls.downloads.length,2);assert.equal(calls.images.length,2);assert.equal(calls.images[0].channels,4);assert.ok(calls.downloads.every(call=>!('image' in call.options)));assert.equal(library.env.backends.onnx.wasm.numThreads,1);assert.equal(library.env.useBrowserCache,true);await recognizer.dispose();assert.equal(calls.disposed,1);
});
test('GPU initialization and unsupported GPU operators both fall back to local CPU execution',async()=>{
 for(const key of ['failGpuLoad','failGpuRun']){const {library,calls}=fakeLibrary({[key]:true}),progress=[];const recognizer=new LocalFoodRecognizer({revisionResolver:async()=>'a'.repeat(40),libraryLoader:async()=>library,gpu:{requestAdapter:async()=>({})},onProgress:p=>progress.push(p)});const result=await recognizer.recognize(image());assert.equal(result.model.device,'wasm');assert.ok(progress.some(p=>p.stage==='fallback'));assert.ok(calls.downloads.some(call=>call.options.device==='wasm'));}
});
test('load failures cannot fabricate detections or require personal reference data',async()=>{
 const recognizer=new LocalFoodRecognizer({revisionResolver:async()=>'a'.repeat(40),libraryLoader:async()=>{throw Error('offline download');}});await assert.rejects(recognizer.recognize(image()),/offline download/);
});
class FakeWorker {constructor(){this.messages=[];this.terminated=false;}postMessage(message){this.messages.push(message);}terminate(){this.terminated=true;}reply(result,id=this.messages.at(-1).id){this.onmessage({data:{id,result}});}}
test('client reuses a worker, rejects concurrent jobs and ignores stale replies',async()=>{
 const workers=[],client=new VisionModelClient({workerFactory:()=>{const w=new FakeWorker();workers.push(w);return w;}});const first=client.recognize(image());await assert.rejects(client.recognize(image()),/curso/);workers[0].reply({items:[]},'stale-id');assert.ok(client.job);workers[0].reply({items:[]});assert.deepEqual(await first,{items:[]});const second=client.recognize(image());assert.equal(workers.length,1);workers[0].reply({items:[]});await second;client.dispose();assert.equal(workers[0].terminated,true);const third=client.recognize(image());workers[0].onerror();assert.equal(workers[1].terminated,false);assert.ok(client.job);workers[1].reply({items:[]});await third;client.dispose();
});
test('cancel and cache clearing terminate inference while preserving all stock/session stores',async()=>{
 const w=new FakeWorker(),client=new VisionModelClient({workerFactory:()=>w}),abort=new AbortController(),promise=client.recognize(image(),{signal:abort.signal});abort.abort();await assert.rejects(promise,{name:'AbortError'});assert.equal(w.terminated,true);assert.equal(client.worker,null);
 const original=globalThis.caches,deleted=[];globalThis.caches={delete:async name=>deleted.push(name)};try{await client.clearModel();assert.deepEqual(deleted,['foodstock-ai-model-v1']);}finally{globalThis.caches=original;}
});

test('first model download pins a public immutable revision and can reopen without network',async()=>{
 const entries=new Map(),calls=[];const cache={match:async key=>entries.get(key)?.clone(),put:async(key,value)=>entries.set(key,value)},storage={open:async()=>cache};
 const revision=await resolveModelRevision({cacheStorage:storage,fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({sha:'b'.repeat(40),private:false,gated:false}));}});assert.equal(revision,'b'.repeat(40));assert.equal(calls.length,1);assert.equal(calls[0].options.credentials,'omit');
 assert.equal(await resolveModelRevision({cacheStorage:storage,fetcher:async()=>{throw Error('offline');}}),revision);assert.equal(entries.size,1);
 await assert.rejects(resolveModelRevision({cacheStorage:null,fetcher:async()=>new Response(JSON.stringify({sha:'invalid'}))}),/download público/);
});
