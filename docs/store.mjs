import { emptyData,project } from './model.mjs';
const DB_NAME='foodstock-offline-v1';
const newProfile=key=>({key,instanceId:null,base:emptyData(),pending:[],lastSynced:null,lastError:null});
let opening;
function openDatabase() {
 if(!opening)opening=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('profiles',{keyPath:'key'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(Error('Fecha outros separadores do FoodStock e volta a abrir.'));
 });
 return opening;
}
async function access(key,change) {
 const db=await openDatabase();
 return new Promise((resolve,reject)=>{
  const tx=change?db.transaction('profiles','readwrite',{durability:'strict'}):db.transaction('profiles','readonly');const store=tx.objectStore('profiles');let result;
  const request=store.get(key);
  request.onsuccess=()=>{
   try { result=request.result||newProfile(key);if(change){const next=change(result);if(next)result=next;store.put(result);} }
   catch(error){tx.abort();reject(error);}
  };
  tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error||Error('Não foi possível guardar os dados neste navegador.'));
 });
}
class ApiError extends Error {constructor(message,status){super(message);this.status=status;}}
export class LocalStore extends EventTarget {
 constructor(apiUrl){super();this.apiUrl=apiUrl;this.key='primary';this.running=false;this.connected=false;this.closed=false;this.controller=new AbortController();this.channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('foodstock-offline'):null;
  if(this.channel)this.channel.onmessage=e=>{if(e.data===this.key)this.changed(false);};
 }
 async view(){const profile=await access(this.key);return {...project(profile.base,profile.pending),profile,connected:this.connected,syncing:this.running};}
 changed(broadcast=true){if(this.closed)return;this.dispatchEvent(new Event('change'));if(broadcast)this.channel?.postMessage(this.key);}
 async enqueue(kind,entityId,data){
  const operation={operationId:crypto.randomUUID(),kind,entityId,data,createdAt:new Date().toISOString()};
  await access(this.key,profile=>{
   project(profile.base,[...profile.pending,operation],true);
   profile.pending.push(operation);return profile;
  });
  this.changed();this.sync().catch(()=>this.changed(false));return operation;
 }
 async request(path,body){
  const controller=new AbortController(),cancel=()=>controller.abort();
  if(this.controller.signal.aborted)controller.abort();
  this.controller.signal.addEventListener('abort',cancel,{once:true});
  const timeout=setTimeout(cancel,4000);
  try {
   const response=await fetch(this.apiUrl+'/api/sync/'+path,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
   if(!response.ok){let data;try{data=await response.json();}catch{}throw new ApiError(data?.message||(response.status===404?'Atualiza e reinicia a API Java para ativar a sincronização.':`A API respondeu ${response.status}.`),response.status);}
   return await response.json();
  }finally{clearTimeout(timeout);this.controller.signal.removeEventListener('abort',cancel);}
 }
 async pull(){
  const current=await access(this.key);
  const reply=await this.request('snapshot',{expectedInstanceId:current.instanceId,pendingIds:current.pending.slice(0,1000).map(op=>op.operationId)});
  if(this.closed)return;
  const valid=typeof reply.instanceId==='string'&&reply.data?.schemaVersion===3&&Array.isArray(reply.data.products)&&Array.isArray(reply.data.purchases)&&Array.isArray(reply.data.movements)&&Array.isArray(reply.data.shoppingList?.items)&&typeof reply.data.shoppingList.templateImported==='boolean'&&Array.isArray(reply.acknowledged)&&reply.acknowledged.every(id=>current.pending.slice(0,1000).some(op=>op.operationId===id));
  if(!valid)throw new Error('Resposta da API inválida. Os dados locais foram preservados.');
  await access(this.key,profile=>{if(profile.instanceId&&profile.instanceId!==reply.instanceId)throw new ApiError('Outra sessão está ligada a uma base diferente. Os dados locais foram preservados.',409);profile.instanceId=reply.instanceId;profile.base=reply.data;profile.pending=profile.pending.filter(op=>!reply.acknowledged.includes(op.operationId));profile.lastSynced=new Date().toISOString();profile.lastError=null;return profile;});
  this.connected=true;this.changed();
 }
 async sync(){
  if(this.running||this.closed)return;this.running=true;this.changed(false);
  const work=async()=>{
   try {
    await this.pull();
    for(let i=0;i<20;i++) {
     if(this.closed)break;
     const current=await access(this.key),op=current.pending[0];if(!op||op.error)break;
     try {await this.request('operations',{...op,createdAt:undefined,error:undefined,instanceId:current.instanceId});}
     catch(error) {
      if(error.status>=400&&error.status<500){await access(this.key,p=>{const entry=p.pending.find(v=>v.operationId===op.operationId);if(entry)entry.error=error.message;return p;});}
      throw error;
     }
     // A queued operation is removed only by a snapshot acknowledging its durable receipt.
     await this.pull();
    }
   } catch(error) {
    if(this.closed)return;
    this.connected=false;await access(this.key,p=>{p.lastError=error.status?error.message:'A API ainda não está disponível. As alterações continuam guardadas neste navegador.';return p;});
   } finally {this.running=false;this.changed();}
  };
  if(navigator.locks) {
   let ran=false;
   await navigator.locks.request('foodstock-sync',{ifAvailable:true},async lock=>{if(lock){ran=true;await work();}});
   if(!ran){this.running=false;this.changed(false);}
  }else await work();
 }
 async retry(){await access(this.key,p=>{if(p.pending[0])delete p.pending[0].error;return p;});this.changed();await this.sync();}
 async discard(id){await access(this.key,p=>{p.pending=p.pending.filter(op=>op.operationId!==id);return p;});this.changed();this.sync().catch(()=>this.changed(false));}
 async backup(){const view=await this.view();return {schemaVersion:3,exportedAt:new Date().toISOString(),apiUrl:this.apiUrl,data:view.data,profile:view.profile};}
 close(){this.closed=true;this.controller.abort();this.channel?.close();}
}
