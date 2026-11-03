import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PNG} from 'pngjs';
import {ALGORITHM,extractFeatures,matchReferences,validateFeatures} from '../docs/vision-engine.mjs';
import {validateCatalog,exportCatalog,detectionsToItems} from '../docs/vision-catalog.mjs';
import {photoDraft,captureData} from '../docs/vision-model.mjs';
const image=PNG.sync.read(await readFile(new URL('./fixtures/box.png',import.meta.url))),photo=PNG.sync.read(await readFile(new URL('./fixtures/box-in-scene.png',import.meta.url)));
const features=extractFeatures(image,{reference:true}),reference={id:'rice-ref',name:'Arroz',category:'Hidratos e acompanhamentos',brand:'',productId:'rice',unit:'kg',features,preview:'data:image/png;base64,iVBORw0KGgo='};
const scene=extractFeatures(photo);
test('classical local features locate an actual photographed reference under viewpoint change',()=>{
 const found=matchReferences(scene,[reference]);assert.equal(found.length,1);assert.equal(found[0].referenceId,'rice-ref');assert.ok(found[0].matches>=14);
 const xs=found[0].polygon.map(p=>p[0]),ys=found[0].polygon.map(p=>p[1]);assert.ok(Math.min(...xs)>60&&Math.max(...xs)<320);assert.ok(Math.min(...ys)>120&&Math.max(...ys)<330);
});
test('photometric changes preserve matches without a learned model',()=>{
 const changed={width:photo.width,height:photo.height,data:Uint8Array.from(photo.data,(v,i)=>i%4===3?255:Math.round(v*.75+25))};assert.equal(matchReferences(extractFeatures(changed),[reference]).length,1);
});
test('two separated copies are counted by geometric detections, not by a provider response',()=>{
 const width=780,height=400,data=new Uint8Array(width*height*4).fill(255);
 for(const [ox,oy] of [[20,30],[420,140]])for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)for(let c=0;c<4;c++)data[((y+oy)*width+x+ox)*4+c]=image.data[(y*image.width+x)*4+c];
 const found=matchReferences(extractFeatures({width,height,data}),[reference]);assert.equal(found.length,2);
});
test('unknown or textureless images are rejected and cannot turn into stock',()=>{
 const blank={width:400,height:300,data:new Uint8Array(400*300*4).fill(160)};assert.equal(matchReferences(extractFeatures(blank),[reference]).length,0);
 let seed=234;const noise=Uint8Array.from(blank.data,(_,i)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return i%4===3?255:seed>>>24;});assert.equal(matchReferences(extractFeatures({...blank,data:noise}),[reference]).length,0);
 assert.throws(()=>validateFeatures({...features,algorithm:'unknown-version'}),/incompatível/);
});
test('catalogues validate bounded metadata and descriptors; importing cannot fetch external images',()=>{
 const catalog=exportCatalog([reference]);assert.equal(catalog.algorithm,ALGORITHM);assert.equal(validateCatalog(JSON.parse(JSON.stringify(catalog)))[0].features.descriptors.length,features.descriptors.length);
 assert.throws(()=>validateCatalog({...catalog,references:[{...reference,preview:'https://tracker.example/photo'}]}),/inválidos/);
 assert.throws(()=>validateCatalog({...catalog,references:[reference,reference]}),/repetidas/);
 assert.throws(()=>validateCatalog({...catalog,references:[{...reference,features:{...features,descriptors:[-1]}}]}),/inválida/);
});
test('reference metadata and geometric counts require explicit physical quantities and inventory review',()=>{
 const items=detectionsToItems([{referenceId:reference.id},{referenceId:reference.id}],[reference]);assert.equal(items[0].visibleCount,2);assert.equal(items[0].quantity,null);assert.equal(items[0].brand,'');
 const draft=photoDraft(items,[{id:'rice',name:'Arroz',stock:4.25,unit:'kg'}]);assert.equal(draft.items[0].quantity,'');assert.equal(draft.items[0].expectedStock,4.25);draft.items[0].quantity='2';assert.equal(captureData(draft).items[0].quantity,2);assert.equal(captureData(draft).items[0].newProduct,null);
});

test('visually identical references with different identities are ambiguous rather than guessed',()=>{
 const other={...reference,id:'beans-ref',name:'Feijão',productId:'beans'};assert.equal(matchReferences(scene,[reference,other]).length,0);
});
test('a quarter-turn of a known reference is matched by geometric orientation',()=>{
 const width=image.height,height=image.width,data=new Uint8Array(width*height*4);
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)for(let c=0;c<4;c++)data[(x*width+(width-1-y))*4+c]=image.data[(y*image.width+x)*4+c];
 assert.equal(matchReferences(extractFeatures({width,height,data}),[reference]).length,1);
});
test('multiple views of the same label remain compatible before and after stock association',()=>{
 const unlinked={...reference,id:'unlinked-rice',name:'arroz',productId:null};assert.equal(matchReferences(scene,[reference,unlinked]).length,1);
 const result=detectionsToItems([{referenceId:reference.id},{referenceId:unlinked.id}],[reference,unlinked]);assert.equal(result.length,1);assert.equal(result[0].productId,'rice');assert.equal(result[0].visibleCount,2);
});
