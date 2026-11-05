// Integration gate: real public model weights + a public fruit photo, no references.
// Downloads can be hundreds of MB. This test never uses a personal photo/account.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),startStatic=require('./helpers/static.cjs');
function safe(text){return String(text).replace(/https?:\/\/[^\s)"'<>\\]+/g,url=>{try{const u=new URL(url);return u.origin+u.pathname;}catch{return '[URL]';}}).slice(0,3500);}
// Calibration uses the real model. The normal quality assertions below remain mandatory.
async function calibrateCaptions(page,encoded){
 return page.evaluate(async encoded=>{
  const version=new URL(document.querySelector('script[src*="boot.js"]').src).search;
  const {FOOD_PROMPTS}=await import('./food-labels.mjs'+version),{LocalFoodRecognizer}=await import('./vision-runtime.mjs'+version),{readImage}=await import('./vision-client.mjs'+version);
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),canvas=await readImage(new File([bytes],'fruits.jpg',{type:'image/jpeg'}),1280),image=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height),original=FOOD_PROMPTS.slice();
  const singular={bananas:'banana',apples:'apple',oranges:'orange',lemons:'lemon',pears:'pear',potatoes:'potato',carrots:'carrot',mushrooms:'mushroom',onions:'onion',tomatoes:'tomato',eggs:'egg'};
  const plain=original.map(prompt=>prompt.replace(/\b(bananas|apples|oranges|lemons|pears|potatoes|carrots|mushrooms|onions|tomatoes|eggs)\b/g,word=>singular[word]));
  const forms={orange:['orange fruit','orange slice'],lemon:['lemon','lemon slice'],kiwi:['kiwi fruit','kiwi slice'],lime:['lime fruit'],cabbage:['cabbage','purple cabbage']};
  const expanded=plain.map(prompt=>prompt.split('.').map(p=>p.trim()).filter(Boolean).flatMap(label=>forms[label]||[label]).map(label=>label+'.').join(' '));
  const joint=expanded.filter((_,index)=>index!==3).map((prompt,index)=>index===2?prompt+' '+expanded[3]:prompt);
  const variants=[['singular',plain],['forms',expanded],['context',expanded.map(prompt=>prompt+' fruit. vegetable. package. background.')],['joint-produce',joint]];
  const model=new LocalFoodRecognizer(),results=[];
  try{for(const [name,prompts] of variants){FOOD_PROMPTS.splice(0,FOOD_PROMPTS.length,...prompts);const start=performance.now(),result=await model.recognize(image);results.push({name,items:result.items.map(i=>i.name),seconds:Math.round((performance.now()-start)/1000),predictions:result.model.topPredictions});}}
  finally{FOOD_PROMPTS.splice(0,FOOD_PROMPTS.length,...original);await model.dispose();}
  return results;
 },encoded);
}
(async()=>{const site=await startStatic(),temp=await fs.mkdtemp(path.join(os.tmpdir(),'foodstock-real-ai-'));let context;const failedRequests=[];try{
 context=await chromium.launchPersistentContext(path.join(temp,'browser'),{executablePath:process.env.FOODSTOCK_BROWSER||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-gpu'],viewport:{width:390,height:844}});const page=await context.newPage(),outbound=[];context.on('requestfailed',request=>failedRequests.push({url:safe(request.url()),error:request.failure()?.errorText}));context.on('request',request=>{if(new URL(request.url()).origin!==site.origin)outbound.push({url:request.url(),method:request.method(),body:request.postData()});});page.on('console',message=>{if(message.type()==='log'&&message.text().startsWith('MODEL_STAGE'))console.log(message.text());});
 await page.goto(site.origin);await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);const encoded=(await fs.readFile(path.join(__dirname,'fixtures/fruits.jpg'))).toString('base64');
 const run=()=>page.evaluate(async encoded=>{const version=new URL(document.querySelector('script[src*="boot.js"]').src).search;const {VisionModelClient,readImage}=await import('./vision-client.mjs'+version);const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),canvas=await readImage(new File([bytes],'fruits.jpg',{type:'image/jpeg'}),1280),client=new VisionModelClient();let last='';try{return await client.recognize(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height),{visualOnly:true,onProgress:p=>{const stage=p.stage+(p.part?':'+p.part+'/'+p.total:p.total?':'+Math.floor((p.progress||0)/10)*10:'');if(stage!==last){last=stage;console.log('MODEL_STAGE '+stage);}}});}catch(error){throw Error(error.message+' '+(error.detail||''));}finally{client.dispose();}},encoded);
 const result=await run();
 const visible=new Set(['Bananas','Laranjas','Limões','Lima','Kiwi','Couve']);
 if(result.items.filter(item=>visible.has(item.name)).length<2||result.items.some(item=>!visible.has(item.name))){const calibration=await calibrateCaptions(page,encoded);console.log('::notice title=Real caption calibration::'+JSON.stringify(calibration));}
 assert.equal(result.method,'visual','The appearance action must use the visual model');
 assert.ok(result.items.filter(item=>visible.has(item.name)).length>=2,'The visual model must identify at least two actual foods; '+JSON.stringify({items:result.items.map(i=>i.name),model:result.model}));
 assert.ok(result.items.every(item=>visible.has(item.name)),'No salt, milk or other absent foods may be suggested for the fruit fixture; '+JSON.stringify({items:result.items.map(i=>i.name),model:result.model}));assert.ok(result.items.every(item=>item.quantity===null&&item.brand===''));assert.ok(outbound.every(r=>['GET','HEAD','OPTIONS'].includes(r.method)&&!r.body),'Only public file/metadata requests may leave the browser');
 const cacheSummary=await page.evaluate(async()=>{const cache=await caches.open('foodstock-ai-model-v1');return (await cache.keys()).map(r=>new URL(r.url).pathname);});if(process.env.GITHUB_ACTIONS)console.log('::notice title=Online recognition and cache::'+JSON.stringify({items:result.items.map(i=>i.name),files:cacheSummary,predictions:result.model.topPredictions}));
 await context.setOffline(true);await page.reload();const offline=await run();assert.deepEqual(offline.items,result.items,'Completed downloads must reopen offline with the same reviewed suggestions');
 const text='Real local model gate passed: '+result.items.map(i=>i.name).join(', ')+'; backend '+result.model.device+'. Cold reload also passed offline. No image upload or user references.';console.log('PASS:',text);if(process.env.GITHUB_ACTIONS)console.log('::notice title=Real model validation::'+text);if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'### Real model validation\n\n'+text+'\n');
 }catch(error){const failureDetail='Failed requests: '+JSON.stringify(failedRequests.slice(-8));error.message+='; '+failureDetail;error.stack+='\n'+failureDetail;if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'### Real model validation failed\n\n```text\n'+safe(error.stack||error)+'\n```\n');throw error;}
 finally{await context?.close();await site.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{const message=safe(e.stack||e);console.error(message);if(process.env.GITHUB_ACTIONS)console.error('::error title=Real model validation::'+message.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));process.exitCode=1;});
