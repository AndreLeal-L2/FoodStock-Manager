import {OCR_RUNTIME_PATH} from './vision-ai-config.mjs?v=20261105.4';
import {cachePublicFiles} from './vision-model-files.mjs?v=20261105.4';
import {readLabelResults} from './label-results.mjs?v=20261105.4';
export class LabelReader {
 constructor({onProgress=()=>{}}={}){this.onProgress=onProgress;}
 async recognize(image){
  this.onProgress({stage:'labels'});
  const base=new URL(OCR_RUNTIME_PATH,import.meta.url),url=file=>new URL(file,base).href;
  await cachePublicFiles([url('ocr.mjs')],this.onProgress);
  const library=await import(url('ocr.mjs'));
  const core=await library.relaxedSimd()?'tesseract-core-relaxedsimd-lstm':await library.simd()?'tesseract-core-simd-lstm':'tesseract-core-lstm';
  await cachePublicFiles(['worker.min.js',core+'.wasm.js',core+'.wasm','por.traineddata.gz','eng.traineddata.gz'].map(url),this.onProgress);
  const worker=await library.createWorker('por+eng',1,{workerPath:url('worker.min.js'),corePath:url(core+'.wasm.js'),langPath:base.href,cacheMethod:'none',workerBlobURL:false,logger:message=>this.onProgress({stage:'labels',progress:message.progress})});
  try{
   await worker.setParameters({tessedit_pageseg_mode:library.PSM.SPARSE_TEXT,user_defined_dpi:'150'});
   const canvas=new OffscreenCanvas(image.width,image.height);
   canvas.getContext('2d').putImageData(new ImageData(image.data,image.width,image.height),0,0);
   const bytes=new Uint8Array(await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer());
   const {data}=await worker.recognize(bytes,{}, {text:true,blocks:true});
   return readLabelResults(data,image.width,image.height);
  }finally{await worker.terminate();}
 }
}
