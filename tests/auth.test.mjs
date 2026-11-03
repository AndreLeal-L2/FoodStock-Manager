import test from 'node:test';import assert from 'node:assert/strict';
import {SupabaseCloud,validateConfig} from '../docs/cloud.mjs';
const config={url:'https://project.supabase.co',publishableKey:'sb_publishable_test'};
const values=new Map();globalThis.window=new EventTarget();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const session={access_token:'old-token',refresh_token:'refresh-token',expires_at:0,user:{id:'user-a',email:'a@example.com'}};
const json=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
test('only HTTPS projects and public publishable/anon keys are accepted',()=>{
 assert.equal(validateConfig(config).url,config.url);
 assert.throws(()=>validateConfig({...config,url:'http://project.supabase.co'}),/HTTPS/);
 assert.throws(()=>validateConfig({...config,url:'https://user:password@project.supabase.co'}),/HTTPS/);
 assert.throws(()=>validateConfig({...config,publishableKey:'sb_secret_private'}),/pública/);
 const jwt=role=>btoa('{}')+'.'+btoa(JSON.stringify({role}))+'.signature';
 assert.throws(()=>validateConfig({...config,publishableKey:jwt('service_role')}),/anon/);assert.equal(validateConfig({...config,publishableKey:jwt('anon')}).publishableKey,jwt('anon'));
});
test('concurrent cloud requests refresh an expired session once and keep failures retryable',async()=>{
 values.clear();const cloud=new SupabaseCloud(config);cloud.setSession(session);
 const original=globalThis.fetch;let refresh=0,calls=0;
 globalThis.fetch=async(url,options)=>{if(url.includes('/token?')){refresh++;return json({...session,access_token:'new-token',expires_at:Math.floor(Date.now()/1000)+3600});}calls++;assert.equal(options.headers.Authorization,'Bearer new-token');return json({ok:true});};
 try{await Promise.all([cloud.rpc('one',{}),cloud.rpc('two',{})]);assert.equal(refresh,1);assert.equal(calls,2);
  cloud.setSession(session);globalThis.fetch=async()=>{throw Error('offline');};await assert.rejects(cloud.token(),/offline/);assert.equal(cloud.user.id,'user-a');assert.equal(cloud.session.refresh_token,'refresh-token');
 }finally{globalThis.fetch=original;}
});
test('changing account while a token is refreshing cannot send the old payload to the new account',async()=>{
 values.clear();const cloud=new SupabaseCloud(config);cloud.setSession(session);
 const original=globalThis.fetch;let finish,called=false;const waiting=new Promise(r=>{finish=r;});
 globalThis.fetch=async(url)=>{if(url.includes('/token?'))return waiting;called=true;return json({});};
 try{const result=cloud.rpc('foodstock_import',{p_data:{private:'user-a'}});await Promise.resolve();cloud.epoch++;cloud.setSession({...session,user:{id:'user-b'},expires_at:Math.floor(Date.now()/1000)+3600});finish(json({...session,expires_at:Math.floor(Date.now()/1000)+3600}));await assert.rejects(result,/conta mudou/);assert.equal(called,false);assert.equal(cloud.user.id,'user-b');}
 finally{globalThis.fetch=original;}
});
test('deployment owns the connection; legacy browser settings cannot redirect login or remove the existing session',()=>{
 values.clear();values.set('foodstock-cloud-config',JSON.stringify(config));
 const deployed='https://dpayzufrevapbqimpwzn.supabase.co';values.set('foodstock-session:'+deployed,JSON.stringify(session));
 const cloud=new SupabaseCloud();assert.equal(cloud.config.url,deployed);assert.equal(cloud.user.id,'user-a');assert.equal(cloud.profileKey,`supabase:${deployed}:user-a`);assert.equal(cloud.configure,undefined);
 assert.ok(values.has('foodstock-cloud-config'));assert.ok(values.has('foodstock-session:'+deployed));
});
