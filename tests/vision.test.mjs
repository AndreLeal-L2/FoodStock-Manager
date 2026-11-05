import test from 'node:test';import assert from 'node:assert/strict';
import {foodForLabel,FOOD_PROMPT,FOOD_PROMPTS} from '../docs/food-labels.mjs';
import {processPredictions} from '../docs/vision-results.mjs';
import {cachePublicFiles} from '../docs/vision-model-files.mjs';
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
function fakeLibrary({failRun=false}={}){
 const calls={downloads:[],images:[],inputs:[],disposed:0};
 const processor={image_processor:Object.assign(async raw=>{calls.images.push(raw);return {pixel_values:raw.data,pixel_mask:'mask'};},{size:{}}),tokenizer:prompt=>{assert.ok(FOOD_PROMPTS.includes(prompt));return {input_ids:[FOOD_PROMPTS.indexOf(prompt)]};},post_process_grounded_object_detection:()=>[{boxes:[[0,0,80,90]],labels:['rice'],scores:[.8]}]};
 const library={env:{backends:{onnx:{wasm:{}}}},RawImage:class{constructor(data,width,height,channels){Object.assign(this,{data,width,height,channels});}},AutoProcessor:{from_pretrained:async(id,options)=>{if(options.local_files_only&&!library.env.allowLocalModels)throw Error('Invalid upstream local-only configuration');calls.downloads.push({id,options});return processor;}},AutoModelForZeroShotObjectDetection:{from_pretrained:async(id,options)=>{calls.downloads.push({id,options});return Object.assign(async inputs=>{calls.inputs.push(inputs);assert.ok(inputs.pixel_values instanceof Uint8ClampedArray);assert.equal(inputs.pixel_mask,'mask');if(failRun)throw Error('inference failed');return {};},{dispose:async()=>calls.disposed++});}}};return {library,calls};
}
test('model adapter keeps pixels local, loads public weights once and reuses the prepared model',async()=>{
 const {library,calls}=fakeLibrary();let loads=0;const recognizer=new LocalFoodRecognizer({revisionResolver:async()=>'a'.repeat(40),libraryLoader:async()=>{loads++;return library;}});
 assert.equal((await recognizer.recognize(image())).items[0].name,'Arroz');await recognizer.recognize(image());assert.equal(loads,1);assert.equal(calls.downloads.length,2);assert.equal(calls.images.length,2);assert.equal(calls.inputs.length,2*FOOD_PROMPTS.length);assert.ok(calls.inputs.slice(0,FOOD_PROMPTS.length).every(input=>input.pixel_values===calls.inputs[0].pixel_values));assert.notEqual(calls.inputs[0].pixel_values,calls.inputs.at(-1).pixel_values);assert.deepEqual(calls.inputs.slice(0,FOOD_PROMPTS.length).map(input=>input.input_ids[0]),FOOD_PROMPTS.map((_,i)=>i));assert.equal(calls.images[0].channels,4);assert.ok(calls.downloads.every(call=>!('image' in call.options)));assert.equal(library.env.backends.onnx.wasm.numThreads,1);assert.equal(library.env.useBrowserCache,true);assert.equal(library.env.remotePathTemplate,'{model}/resolve/'+'a'.repeat(40)+'/');await recognizer.dispose();assert.equal(calls.disposed,1);
});
test('cache-only loading avoids optional network files and a partial cache can resume downloading',async()=>{
 const {library,calls}=fakeLibrary(),original=library.AutoProcessor.from_pretrained;let misses=0;
 library.AutoProcessor.from_pretrained=async(id,options)=>{if(options.local_files_only){misses++;throw Error('required file missing from cache');}return original(id,options);};
 const recognizer=new LocalFoodRecognizer({revisionResolver:async()=>'a'.repeat(40),libraryLoader:async()=>library});await recognizer.recognize(image());assert.equal(misses,1);assert.ok(calls.downloads.every(call=>call.options.local_files_only===false));
 const cached=fakeLibrary(),offline=new LocalFoodRecognizer({revisionResolver:async()=>'a'.repeat(40),libraryLoader:async()=>cached.library});await offline.recognize(image());assert.ok(cached.calls.downloads.every(call=>call.options.local_files_only===true));
});
test('the visual model runs on the verified CPU backend and propagates inference errors',async()=>{
 const {library,calls}=fakeLibrary(),recognizer=new LocalFoodRecognizer({revisionResolver:async()=>'a'.repeat(40),libraryLoader:async()=>library});assert.equal((await recognizer.recognize(image())).model.device,'wasm');assert.ok(calls.downloads.filter(call=>call.options.device).every(call=>call.options.device==='wasm'));
 const failed=fakeLibrary({failRun:true}),broken=new LocalFoodRecognizer({revisionResolver:async()=>'a'.repeat(40),libraryLoader:async()=>failed.library});await assert.rejects(broken.recognize(image()),/inference failed/);
});
test('load failures cannot fabricate detections or require personal reference data',async()=>{
 const recognizer=new LocalFoodRecognizer({revisionResolver:async()=>'a'.repeat(40),libraryLoader:async()=>{throw Error('offline download');}});await assert.rejects(recognizer.recognize(image()),/offline download/);
});
class FakeWorker {constructor(){this.messages=[];this.terminated=false;}postMessage(message){this.messages.push(message);}terminate(){this.terminated=true;}reply(result,id=this.messages.at(-1).id){this.onmessage({data:{id,result}});}}
test('client reuses a worker, rejects concurrent jobs and ignores stale replies',async()=>{
 const workers=[],client=new VisionModelClient({workerFactory:()=>{const w=new FakeWorker();workers.push(w);return w;}});const first=client.recognize(image());await assert.rejects(client.recognize(image()),/curso/);workers[0].reply({items:[]},'stale-id');assert.ok(client.job);workers[0].reply({items:[]});assert.deepEqual(await first,{items:[]});const second=client.recognize(image());assert.equal(workers.length,1);workers[0].reply({items:[]});await second;client.dispose();assert.equal(workers[0].terminated,true);const third=client.recognize(image());workers[0].onerror();assert.equal(workers[1].terminated,false);assert.ok(client.job);workers[1].reply({items:[]});await third;client.dispose();
});
test('an engine error destroys its worker so the next photo can retry from a clean runtime',async()=>{
 const workers=[],client=new VisionModelClient({workerFactory:()=>{const worker=new FakeWorker();workers.push(worker);return worker;}}),failed=client.recognize(image());workers[0].onmessage({data:{id:workers[0].messages[0].id,error:'runtime failed'}});await assert.rejects(failed,/runtime failed/);assert.equal(workers[0].terminated,true);const retry=client.recognize(image());assert.equal(workers.length,2);workers[1].reply({items:[]});await retry;client.dispose();
});
test('cancel and cache clearing terminate inference while preserving all stock/session stores',async()=>{
 const w=new FakeWorker(),client=new VisionModelClient({workerFactory:()=>w}),abort=new AbortController(),promise=client.recognize(image(),{signal:abort.signal});abort.abort();await assert.rejects(promise,{name:'AbortError'});assert.equal(w.terminated,true);assert.equal(client.worker,null);
 const original=globalThis.caches,deleted=[];globalThis.caches={delete:async name=>deleted.push(name)};try{await client.clearModel();assert.deepEqual(deleted,['foodstock-ai-model-v1']);}finally{globalThis.caches=original;}
});

test('public runtime assets are cached once and can be reused without network',async()=>{
 const originalCache=globalThis.caches,originalFetch=globalThis.fetch,entries=new Map(),calls=[];
 globalThis.caches={open:async name=>{assert.equal(name,'foodstock-ai-model-v1');return {match:async key=>entries.get(key)?.clone(),put:async(key,response)=>entries.set(key,response)};}};
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response('public runtime');};
 try{const urls=['https://example.test/runtime.mjs','https://example.test/weights.gz'];await cachePublicFiles(urls);assert.equal(calls.length,2);assert.ok(calls.every(call=>call.options.credentials==='omit'));globalThis.fetch=async()=>assert.fail('Cached files must not fetch again');await cachePublicFiles(urls);assert.equal(entries.size,2);}
 finally{globalThis.caches=originalCache;globalThis.fetch=originalFetch;}
});
