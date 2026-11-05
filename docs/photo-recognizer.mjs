import {LabelReader} from './label-runtime.mjs?v=20261105.4';
import {LocalFoodRecognizer} from './vision-runtime.mjs?v=20261105.4';
export class PhotoRecognizer {
 constructor({onProgress=()=>{},labels=new LabelReader({onProgress}),visual=new LocalFoodRecognizer({onProgress})}={}){Object.assign(this,{labels,visual});}
 async recognize(image,{visualOnly=false}={}){
  const result=await (visualOnly?this.visual:this.labels).recognize(image);
  return {...result,method:visualOnly?'visual':'labels'};
 }
}
