import test from 'node:test';import assert from 'node:assert/strict';
import {readLabelResults} from '../docs/label-results.mjs';
import {foodForLabel,FOOD_PROMPTS} from '../docs/food-labels.mjs';
import {LocalFoodRecognizer} from '../docs/vision-runtime.mjs';
import {PhotoRecognizer} from '../docs/photo-recognizer.mjs';
import {photoDraft,appendPhotoDraft} from '../docs/vision-model.mjs';
const sample=(lines,confidence=95)=>({blocks:[{paragraphs:[{lines:lines.map((text,row)=>({text,words:text.split(' ').map((text,column)=>({text,confidence,bbox:{x0:column*90,y0:row*40,x1:column*90+80,y1:row*40+30}}))}))}]}]});
const recognized=name=>({name,category:'Outros',brand:'',quantity:null,unit:null});
test('Portuguese labels identify pantry foods without guessing package counts or weights',()=>{
 const result=readLabelResults(sample(['ARROZ BASMATI 1 kg','FEIJÃO PRETO 500 g','POLPA DE TOMATE','AZEITE','ARROZ']),1000,500);
 assert.deepEqual(result.items.map(i=>i.name),['Arroz','Feijão','Polpa de tomate','Azeite']);assert.ok(result.items.every(i=>i.quantity===null&&i.unit===null&&i.visibleCount===null&&i.brand===''));assert.match(result.items[0].notes,/rótulo/);assert.equal(result.detections[0].source,'label');
 assert.equal(foodForLabel('CEBOLA EM PÓ').category,'Temperos');assert.equal(foodForLabel('BATATA PALHA').name,'Batata palha');assert.equal(foodForLabel('EXTRATO DE TOMATE').name,'Polpa de tomate');
});
test('ingredients, absence claims, uncertain words, unrelated text and invalid boxes are rejected',()=>{
 for(const phrase of ['Ingredientes: leite','PODE CONTER OVOS','SEM LEITE','NÃO CONTÉM LEITE','Traços de amendoim','Informação nutricional: leite','ARROZ LEITE','BANCO','BEBIDA VEGETAL SEM LEITE','MAY CONTAIN MILK','WITHOUT MILK','MILK FREE'])assert.equal(readLabelResults(sample([phrase]),1000,500).items.length,0,phrase);
 assert.equal(readLabelResults(sample(['ARROZ'],45),1000,500).items.length,0);const invalid=sample(['ARROZ']);invalid.blocks[0].paragraphs[0].lines[0].words[0].bbox.x0=NaN;assert.equal(readLabelResults(invalid,1000,500).items.length,0);assert.throws(()=>readLabelResults({},NaN,50));
 assert.equal(readLabelResults(sample(['Ingredientes:','LEITE']),1000,500).items.length,0);assert.equal(readLabelResults(sample(['LEITE SEM LACTOSE']),1000,500).items[0].name,'Leite');
 assert.equal(foodForLabel('salt').name,'Sal');assert.ok(FOOD_PROMPTS.every(prompt=>!prompt.includes('salt.')&&!prompt.includes('flour.')&&!prompt.includes('onion powder.')));
});
test('reading labels never downloads the large visual model, including photos without readable names',async()=>{
 for(const found of [true,false]){const image={privatePixels:true},reader=new PhotoRecognizer({labels:{recognize:async original=>{assert.equal(original,image);return {items:found?[recognized('Arroz')]:[],detections:[]};}},visual:{recognize:async()=>assert.fail('Visual download must require an explicit action')}});const result=await reader.recognize(image);assert.equal(result.method,'labels');assert.equal(result.items.length,found?1:0);}
});
test('explicit visual search skips OCR, and engine failures cannot fabricate suggestions',async()=>{
 const failed=new PhotoRecognizer({labels:{recognize:async()=>{throw Error('OCR offline');}},visual:{recognize:async()=>{throw Error('visual offline');}}});await assert.rejects(failed.recognize({}),/OCR offline/);await assert.rejects(failed.recognize({},{visualOnly:true}),/visual offline/);
 const visual=new PhotoRecognizer({labels:{recognize:async()=>assert.fail('Must not read labels again')},visual:{recognize:async()=>({items:[],detections:[]})}});assert.equal((await visual.recognize({},{visualOnly:true})).method,'visual');
});
test('adding visual suggestions keeps manual edits, draft identity and stock expectations without duplicates',()=>{
 const products=[{id:'rice',name:'Arroz',unit:'kg',stock:4}],draft=photoDraft([recognized('Arroz')],products);draft.items[0].quantity='2.5';draft.items[0].brand='Minha marca';
 const before=structuredClone(draft),combined=appendPhotoDraft(draft,[recognized('ARROZ'),recognized('Feijão')],products);assert.equal(combined.id,draft.id);assert.equal(combined.items.length,2);assert.deepEqual(combined.items[0],before.items[0]);assert.equal(combined.items[0].expectedStock,4);assert.deepEqual(draft,before);
 const full={...draft,items:Array.from({length:60},(_,i)=>({...draft.items[0],name:'Item '+i}))};assert.throws(()=>appendPhotoDraft(full,[recognized('Bananas')],products),/60 alimentos/);assert.equal(full.items.length,60);
});

test('the heavy visual model checks memory before downloading while label reading remains available',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(navigator,'deviceMemory');Object.defineProperty(navigator,'deviceMemory',{value:2,configurable:true});
 try{const visual=new LocalFoodRecognizer({revisionResolver:async()=>assert.fail('Must not download on low-memory devices')});await assert.rejects(visual.recognize({}),/pouca memória/);const labels=new PhotoRecognizer({labels:{recognize:async()=>({items:[recognized('Arroz')],detections:[],method:'labels'})},visual});assert.equal((await labels.recognize({})).method,'labels');}
 finally{if(descriptor)Object.defineProperty(navigator,'deviceMemory',descriptor);else delete navigator.deviceMemory;}
});
