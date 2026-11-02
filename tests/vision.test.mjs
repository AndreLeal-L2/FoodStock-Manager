import test from 'node:test';import assert from 'node:assert/strict';
import {createHandler,sanitizeItems,validImage,MAX_BODY} from '../supabase/functions/recognize-food/handler.mjs';
import {photoDraft,captureData} from '../docs/vision-model.mjs';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVnUAAAAASUVORK5CYII=';
const item={name:'Arroz',category:'Hidratos e acompanhamentos',quantity:null,unit:null,visibleCount:2,brand:null,notes:'Peso ilegível.'};
const request=(body={image},headers={})=>new Request('https://project.supabase.co/functions/v1/recognize-food',{method:'POST',headers:{origin:'https://site.example',authorization:'Bearer user-token','Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
test('photo suggestions never treat visible package count as weight and require existing stock recount',()=>{
 const value=sanitizeItems({items:[item]});let draft=photoDraft(value,[]);assert.equal(draft.items[0].quantity,'');assert.equal(draft.items[0].unit,'');assert.equal(draft.items[0].brand,'');assert.equal(draft.items[0].visibleCount,2);
 draft=photoDraft(value,[{id:'rice',name:'Arroz',stock:4.25,unit:'kg'}]);assert.equal(draft.items[0].quantity,'');assert.equal(draft.items[0].expectedStock,4.25);draft.items[0].quantity='2';assert.equal(captureData(draft).items[0].quantity,2);assert.equal(captureData(draft).items[0].newProduct,null);
});
test('recognition checks authentication, origin, size, image signature and quota before calling AI',async()=>{
 let calls=0,reservations=0;const handler=createHandler({allowedOrigins:['https://site.example'],verifyUser:async a=>a==='Bearer user-token'?{id:'user'}:null,reserve:async()=>reservations++,recognize:async()=>{calls++;return {items:[item]};}});
 assert.equal(validImage(image),true);assert.equal(validImage('data:image/jpeg;base64,bm90LWEtcGljdHVyZQ=='),false);
 assert.equal((await handler(request({}, {authorization:'Bearer wrong'}))).status,401);
 assert.equal((await handler(request({image},{origin:'https://evil.example'}))).status,403);
 assert.equal((await handler(request({image:'bad'}))).status,400);
 assert.equal((await handler(request('{'))).status,400);
 assert.equal((await handler(request('x'.repeat(MAX_BODY+1)))).status,400);
 assert.equal(calls,0);assert.equal(reservations,0);
 const response=await handler(request());assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://site.example');assert.equal((await response.json()).requiresReview,true);assert.equal(calls,1);assert.equal(reservations,1);
});
test('provider errors and absent secrets are explicit and do not leak secrets or pretend to recognize foods',async()=>{
 const opts={allowedOrigins:['https://site.example'],verifyUser:async()=>({id:'user'}),reserve:async()=>{},recognize:async()=>{throw Error('SECRET provider error');}};
 const response=await createHandler(opts)(request());assert.equal(response.status,502);assert.equal((await response.text()).includes('SECRET'),false);
 assert.equal((await createHandler({...opts,configured:false})(request())).status,503);
 assert.equal((await createHandler({...opts,reserve:async()=>{throw Object.assign(Error('quota'),{status:429});}})(request())).status,429);
 assert.throws(()=>sanitizeItems({items:[{...item,quantity:-1}]}),/inválidos/);
 assert.throws(()=>sanitizeItems({items:[{...item,category:'Invented'}]}),/inválido/);
});
