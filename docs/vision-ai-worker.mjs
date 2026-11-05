import {PhotoRecognizer} from './photo-recognizer.mjs?v=20261105.4';
let recognizer=null,busy=false,currentId;
self.onmessage=async event=>{
 const {id,image,visualOnly}=event.data;if(busy){self.postMessage({id,error:'Já há uma análise em curso.'});return;}
 busy=true;currentId=id;
 try{
  if(!recognizer)recognizer=new PhotoRecognizer({onProgress:progress=>self.postMessage({id:currentId,progress})});
  if(!image||image.width<48||image.height<48||image.width>2048||image.height>2048||image.data?.length!==image.width*image.height*4)throw Error('Fotografia inválida.');
  const result=await recognizer.recognize(image,{visualOnly:visualOnly===true});self.postMessage({id,result});
 }catch(error){self.postMessage({id,error:'Não foi possível concluir a identificação local. Verifica a Internet no primeiro download; para a pesquisa visual, tenta um navegador atualizado no Mac.',detail:String(error.message||error).slice(0,500)});}
 finally{busy=false;}
};
