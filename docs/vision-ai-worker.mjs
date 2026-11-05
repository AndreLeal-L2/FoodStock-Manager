import {LocalFoodRecognizer} from './vision-runtime.mjs?v=20261105.2';
let recognizer=null,busy=false,currentId;
self.onmessage=async event=>{
 const {id,image}=event.data;if(busy){self.postMessage({id,error:'Já há uma análise em curso.'});return;}
 busy=true;currentId=id;
 try{
  if(!recognizer)recognizer=new LocalFoodRecognizer({onProgress:progress=>self.postMessage({id:currentId,progress})});
  if(!image||image.width<48||image.height<48||image.width>1600||image.height>1600||image.data?.length!==image.width*image.height*4)throw Error('Fotografia inválida.');
  const result=await recognizer.recognize(image);self.postMessage({id,result});
 }catch(error){self.postMessage({id,error:'Não foi possível carregar ou executar o modelo neste dispositivo. Verifica a Internet no primeiro download e tenta um navegador atualizado no Mac ou no telemóvel.',detail:String(error.message||error).slice(0,500)});}
 finally{busy=false;}
};
