// UI test double only. Production model validation runs separately with real weights.
export class LocalFoodRecognizer {
 constructor({onProgress}){this.onProgress=onProgress;}
 async recognize(image){
  if(!(image.data instanceof Uint8ClampedArray)||image.width<48)throw Error('Invalid local pixels');
  this.onProgress({stage:'download',loaded:1024,total:2048,progress:50});
  await new Promise(resolve=>setTimeout(resolve,image.width===801?5000:150));this.onProgress({stage:'inference',device:'wasm'});
  const make=(name,category)=>({name,category,unit:null,quantity:null,brand:'',visibleCount:1,notes:'Simulated model boundary for UI tests.'});
  return {items:[make('Arroz','Hidratos e acompanhamentos'),make('Feijão','Conservas e leguminosas')],detections:[{name:'Arroz',polygon:[[35,40],[335,40],[335,260],[35,260]]},{name:'Feijão',polygon:[[445,105],[745,105],[745,325],[445,325]]}],model:{id:'test-double-only',device:'wasm'}};
 }
}
