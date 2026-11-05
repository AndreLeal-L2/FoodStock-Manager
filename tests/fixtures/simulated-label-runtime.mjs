// UI test boundary only. Actual OCR weights run separately in labels-browser.cjs.
export class LabelReader {
 constructor({onProgress}){this.onProgress=onProgress;}
 async recognize(image){
  this.onProgress({stage:'labels'});await new Promise(resolve=>setTimeout(resolve,image.width===801?5000:150));
  const make=(name,category)=>({name,category,unit:null,quantity:null,brand:'',visibleCount:null,notes:'Simulated label boundary for UI tests.'});
  return {items:[make('Arroz','Hidratos e acompanhamentos'),make('Feijão','Conservas e leguminosas')],detections:[],method:'labels'};
 }
}
