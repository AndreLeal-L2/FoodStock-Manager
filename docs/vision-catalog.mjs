import {ALGORITHM,MAX_REFERENCES,validateFeatures} from './vision-engine.mjs?v=20261103.2';
import {categories} from './vision-model.mjs?v=20261103.2';
export const CATALOG_SCHEMA='foodstock-visual-catalog';
export function validateReference(reference){
 const text=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0);
 if(!reference||!text(reference.id,80,true)||!text(reference.name,120,true)||!categories.includes(reference.category)||!text(reference.brand,120)||!['kg','L','un'].includes(reference.unit)||!(reference.productId===null||text(reference.productId,80,true))||!text(reference.preview,50000)||!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(reference.preview))throw Error('Os dados da referência visual são inválidos.');
 validateFeatures(reference.features);
 return {id:reference.id,name:reference.name.trim(),category:reference.category,brand:reference.brand.trim(),unit:reference.unit,productId:reference.productId,preview:reference.preview,features:reference.features};
}
export function validateCatalog(catalog){
 if(catalog?.schema!==CATALOG_SCHEMA||catalog?.algorithm!==ALGORITHM||!Array.isArray(catalog.references)||catalog.references.length>MAX_REFERENCES)throw Error(`Escolhe um catálogo FoodStock com até ${MAX_REFERENCES} referências compatíveis.`);
 const seen=new Set();return catalog.references.map(reference=>{const value=validateReference(reference);if(seen.has(value.id))throw Error('Há referências repetidas no catálogo.');seen.add(value.id);return value;});
}
export function exportCatalog(references){return {schema:CATALOG_SCHEMA,algorithm:ALGORITHM,references:references.map(validateReference)};}
export function detectionsToItems(detections,references){
 const groups=new Map(),label=ref=>[ref.name,ref.brand,ref.unit].map(v=>v.trim().toLocaleLowerCase('pt-PT')).join('|');
 for(const detection of detections){const ref=references.find(r=>r.id===detection.referenceId);if(!ref)continue;const ids=[...new Set(references.filter(r=>r.productId&&label(r)===label(ref)).map(r=>r.productId))],productId=ref.productId||(ids.length===1?ids[0]:null),key=productId||label(ref);
  if(!groups.has(key))groups.set(key,{name:ref.name,category:ref.category,brand:ref.brand,productId,unit:ref.unit,quantity:null,visibleCount:0,notes:'Correspondência com uma embalagem cadastrada. Podem existir itens que não foram reconhecidos; confirma a quantidade total.'});groups.get(key).visibleCount++;
 }
 return [...groups.values()];
}
