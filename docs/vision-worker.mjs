import {extractFeatures,matchReferences} from './vision-engine.mjs?v=20261103.2';
self.onmessage=event=>{
 const {id,mode,image,references}=event.data;
 try{
  const features=extractFeatures(image,{reference:mode==='reference'});
  if(mode==='reference')self.postMessage({id,result:{features}});
  else self.postMessage({id,result:{detections:matchReferences(features,references,(current,total)=>self.postMessage({id,progress:{current,total}}))}});
 }catch(error){self.postMessage({id,error:error.message||'Não foi possível analisar a imagem.'});}
};
