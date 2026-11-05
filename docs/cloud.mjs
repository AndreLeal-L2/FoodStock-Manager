import defaults from './config.mjs?v=20261105.1';
export class CloudError extends Error {constructor(message,status){super(message);this.status=status;}}
export function validateConfig(value){
 const url=new URL(value.url);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Usa o URL HTTPS do projeto Supabase, sem caminhos adicionais.');
 const key=value.publishableKey.trim();
 if(key.startsWith('sb_secret_'))throw Error('Usa apenas a chave pública publishable/anon.');
 if(key.split('.').length===3){try{if(JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role!=='anon')throw Error();}catch{throw Error('A chave JWT tem de ter o papel anon. Nunca uses service_role.');}}
 else if(!/^sb_publishable_[\w-]+$/.test(key))throw Error('Preenche a chave pública publishable/anon do projeto.');
 return {url:url.origin,publishableKey:key};
}
export class SupabaseCloud extends EventTarget {
 constructor(project=defaults){
  super();this.refreshing=null;this.epoch=0;
  try{this.config=validateConfig(project);}catch{this.config=null;}
  this.session=this.readSession();
  window.addEventListener('storage',e=>{if(e.key===this.sessionKey()){this.session=this.readSession();this.epoch++;this.dispatchEvent(new Event('change'));}});
 }
 sessionKey(){return 'foodstock-session:'+this.config?.url;}
 readSession(){try{return JSON.parse(localStorage.getItem(this.sessionKey())||'null');}catch{return null;}}
 get user(){return this.session?.user||null;}
 get profileKey(){return this.user?`supabase:${this.config.url}:${this.user.id}`:'primary';}
 async json(path,body,{token,method='POST',signal}={}){
  if(!this.config)throw new CloudError('A ligação do FoodStock não está disponível. Tenta novamente mais tarde.',0);
  const response=await fetch(this.config.url+path,{method,credentials:'omit',headers:{apikey:this.config.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal||AbortSignal.timeout(15000)});
  let data;try{data=await response.json();}catch{}
  if(!response.ok){
   if(data?.code==='invalid_credentials')throw new CloudError('Email ou palavra-passe incorretos.',response.status);
   if(data?.code==='email_not_confirmed')throw new CloudError('Confirma o teu email antes de iniciar sessão.',response.status);
   if(response.status===429)throw new CloudError('Demasiadas tentativas. Aguarda um pouco e tenta novamente.',429);
   throw new CloudError(response.status===401?'Sessão expirada. Inicia sessão novamente em Dados.':data?.message||data?.msg||data?.error_description||data?.error||`Não foi possível concluir o pedido (${response.status}).`,response.status);
  }
  return data;
 }
 async login(email,password){
  const epoch=this.epoch,data=await this.json('/auth/v1/token?grant_type=password',{email,password});
  if(epoch!==this.epoch)throw new CloudError('O projeto ou a conta mudou durante o início de sessão.',401);
  this.epoch++;this.setSession(data);this.dispatchEvent(new Event('change'));
 }
 async signup(email,password){
  const epoch=this.epoch,data=await this.json('/auth/v1/signup',{email,password});
  if(epoch!==this.epoch)throw new CloudError('O projeto ou a conta mudou durante a criação da conta.',401);
  if(data.access_token){this.epoch++;this.setSession(data);this.dispatchEvent(new Event('change'));return true;}return false;
 }
 setSession(data){const session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:data.expires_at||Math.floor(Date.now()/1000)+data.expires_in,user:data.user};localStorage.setItem(this.sessionKey(),JSON.stringify(session));this.session=session;}
 async token(){
  if(!this.session)throw new CloudError('Inicia sessão em Dados. A tua cópia offline continua guardada.',401);
  if(this.session.expires_at>Date.now()/1000+45)return this.session.access_token;
  if(!this.refreshing){const epoch=this.epoch;this.refreshing=this.json('/auth/v1/token?grant_type=refresh_token',{refresh_token:this.session.refresh_token}).then(data=>{if(epoch!==this.epoch)throw new CloudError('A conta mudou. Tenta novamente.',401);this.setSession(data);return data.access_token;}).finally(()=>{this.refreshing=null;});}
  return this.refreshing;
 }
 async logout(){
  const token=this.session?.access_token;this.epoch++;localStorage.removeItem(this.sessionKey());this.session=null;this.dispatchEvent(new Event('change'));
  if(token)this.json('/auth/v1/logout',undefined,{token}).catch(()=>{});
 }
 async authorized(path,body,signal){
  const epoch=this.epoch,token=await this.token();
  if(epoch!==this.epoch)throw new CloudError('A conta ou o projeto mudou. Tenta novamente.',401);
  return this.json(path,body,{token,signal});
 }
 async rpc(name,body,signal){return this.authorized('/rest/v1/rpc/'+name,body,signal);}
 async request(path,body,signal){
  if(path==='snapshot')return this.rpc('foodstock_snapshot',{p_expected_instance_id:body.expectedInstanceId,p_pending_ids:body.pendingIds},signal);
  return this.rpc('foodstock_apply',{p_operation:body},signal);
 }
}
