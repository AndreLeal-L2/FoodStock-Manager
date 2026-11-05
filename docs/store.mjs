import { emptyData,project } from './model.mjs?v=20261105.1';
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
export async function access(key,change) {
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
 constructor(cloud){super();this.cloud=cloud;this.apiUrl=cloud.config?.url||'';this.key=cloud.profileKey;this.running=false;this.connected=false;this.closed=false;this.controller=new AbortController();this.channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('foodstock-offline'):null;
  if(this.channel)this.channel.onmessage=e=>{if(e.data===this.key)this.changed(false);};
 }
 async view(){const profile=await access(this.key);return {...project(profile.base,profile.pending),profile,connected:this.connected,syncing:this.running};}
 changed(broadcast=true){if(this.closed)return;this.dispatchEvent(new Event('change'));if(broadcast)this.channel?.postMessage(this.key);}
 async enqueue(kind,entityId,data){
  if(this.closed)throw Error('A conta mudou. Volta a abrir a conta original para concluir.');
  const operation={operationId:['CHECKOUT','INVENTORY_CAPTURE'].includes(kind)?entityId:crypto.randomUUID(),kind,entityId,data,createdAt:new Date().toISOString()};
  await access(this.key,profile=>{
   const existing=profile.pending.find(op=>op.operationId===operation.operationId);
   if(existing){if(existing.kind!==kind||JSON.stringify(existing.data)!==JSON.stringify(data))throw Error('Esta finalização já foi guardada com outros valores. Consulta o histórico antes de voltar a registar.');return profile;}
   project(profile.base,[...profile.pending,operation],true);
   profile.pending.push(operation);
   if(kind==='CHECKOUT'&&profile.checkoutDraft?.id===entityId)profile.checkoutDraft=null;
   if(kind==='INVENTORY_CAPTURE'&&profile.photoDraft?.id===entityId)profile.photoDraft=null;
   return profile;
  });
  this.changed();this.sync().catch(()=>this.changed(false));return operation;
 }
 async request(path,body){
  if(this.closed||this.key!==this.cloud.profileKey)throw new ApiError('A conta ou o projeto mudou. Os dados locais foram preservados.',401);
  const controller=new AbortController(),cancel=()=>controller.abort();
  if(this.controller.signal.aborted)controller.abort();
  this.controller.signal.addEventListener('abort',cancel,{once:true});
  const timeout=setTimeout(cancel,20000);
  try {
   return await this.cloud.request(path,body,controller.signal);
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
  if(this.running||this.closed||!this.cloud.user)return;this.running=true;this.changed(false);
  const work=async()=>{
   try {
    await this.pull();
    for(let i=0;i<20;i++) {
     if(this.closed)break;
     const current=await access(this.key),op=current.pending[0];if(!op||op.error)break;
     try {await this.request('operations',{...op,createdAt:undefined,error:undefined,instanceId:current.instanceId});}
     catch(error) {
      const unsupported=error.status===400&&error.message.startsWith('Tipo de alteração desconhecido');
      if(unsupported)error.message='O servidor precisa de ser atualizado para sincronizar esta alteração. Os dados continuam no navegador.';
      if(error.status>=400&&error.status<500&&![401,403,408,429].includes(error.status)&&!unsupported){await access(this.key,p=>{const entry=p.pending.find(v=>v.operationId===op.operationId);if(entry)entry.error=error.message;return p;});}
      throw error;
     }
     // A queued operation is removed only by a snapshot acknowledging its durable receipt.
     await this.pull();
    }
   } catch(error) {
    if(this.closed)return;
    this.connected=false;await access(this.key,p=>{p.lastError=error.status?error.message:'Sem ligação à tua conta. As alterações continuam guardadas neste navegador.';return p;});
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
 async backup(){const view=await this.view();return {schemaVersion:3,exportedAt:new Date().toISOString(),source:'supabase',projectUrl:this.apiUrl,data:view.data,profile:view.profile};}
 async savePhotoDraft(draft){await access(this.key,p=>{p.photoDraft=draft;return p;});}
 async clearPhotoDraft(id){await access(this.key,p=>{if(p.photoDraft?.id===id)p.photoDraft=null;return p;});}
 async importData(data){
  if(!this.cloud.user)throw Error('Inicia sessão antes de importar para a nuvem.');
  if(data&&!(data.products?.length||data.purchases?.length||data.movements?.length||data.shoppingList?.templateImported))throw Error('Não há dados para importar nesta cópia.');
  const current=await this.view();if(current.profile.pending.length)throw Error('Sincroniza ou resolve as alterações pendentes antes de importar.');
  const profile=await access(this.key,p=>{
   if(!p.importDraft){if(!data)throw Error('Não há importação pendente.');p.importDraft={id:crypto.randomUUID(),data};}
   else if(data&&JSON.stringify(p.importDraft.data)!==JSON.stringify(data))throw Error('Retoma primeiro a importação pendente. Os dados novos não foram enviados.');
   return p;
  });
  this.changed();
  if(this.closed||this.key!==this.cloud.profileKey)throw new ApiError('A conta mudou. Retoma a importação na conta original.',401);
  await this.cloud.rpc('foodstock_import',{p_import_id:profile.importDraft.id,p_data:profile.importDraft.data});
  await this.pull();
  await access(this.key,p=>{p.importDraft=null;return p;});
 }
 async cancelImport(){await access(this.key,p=>{p.importDraft=null;return p;});this.changed();}
 async legacy(){const p=await access('primary');const value=project(p.base,p.pending);if(value.warnings.length)throw Error('Resolve as alterações pendentes na cópia anterior antes de migrar. Exporta um backup para preservar tudo.');return value.data;}

 async saveCheckoutDraft(draft){await access(this.key,p=>{p.checkoutDraft=draft;return p;});}
 async clearCheckoutDraft(id){await access(this.key,p=>{if(p.checkoutDraft?.id===id)p.checkoutDraft=null;return p;});}
 close(){this.closed=true;this.controller.abort();this.channel?.close();}
}
