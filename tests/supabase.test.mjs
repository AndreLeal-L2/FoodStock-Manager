import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
import {emptyData,templateItems} from '../docs/model.mjs';
const db=new PGlite();const alice=randomUUID(),bob=randomUUID();let instance;
const query=(text,params=[])=>db.query(text,params);
const rpc=async(name,args)=>{const {rows}=await query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args);return rows[0].result;};
const user=async id=>{await query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);};
const snapshot=()=>rpc('foodstock_snapshot',[null,[]]);
const operation=(kind,entityId,data,id=randomUUID())=>({operationId:id,instanceId:instance,kind,entityId,data});
const apply=async op=>{await db.exec('set role authenticated');try{return await rpc('foodstock_apply',[op]);}finally{await db.exec('reset role');}};
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 await query('insert into auth.users values($1),($2)',[alice,bob]);
 await db.exec(await readFile(new URL('../supabase/migrations/202611020001_foodstock.sql',import.meta.url),'utf8'));
 await user(alice);instance=(await snapshot()).instanceId;
});
after(()=>db.close());
test('PostgreSQL migration, account isolation, RLS and RPC grants',async()=>{
 await db.exec('set role authenticated');assert.equal((await snapshot()).data.products.length,0);await assert.rejects(query('select private.foodstock_owner()'),/permission denied/);await db.exec('reset role');
 await user(null);await assert.rejects(snapshot,/Inicia sessão/);
 await db.exec('set role anon');await assert.rejects(snapshot,/permission denied/);await db.exec('reset role');
 await user(bob);const b=await snapshot();assert.notEqual(b.instanceId,instance);
 await assert.rejects(rpc('foodstock_snapshot',[instance,[]]),/base diferente/);
 await user(alice);
});
test('all old offline operations, exact decimals, checkout atomicity and receipts',async()=>{
 const rice=randomUUID(),chicken=randomUUID();
 await apply(operation('PRODUCT_CREATE',rice,{name:'Arroz',unit:'kg',initialStock:2.25,minimumStock:1}));
 await apply(operation('SHOPPING_IMPORT',null,{}));
 const list=(await snapshot()).data.shoppingList.items;assert.equal(list.length,39);assert.deepEqual(list.map(i=>i.name),templateItems().map(i=>i.name));
 for(const i of [0,7])await apply(operation('SHOPPING_CHECK',list[i].id,{templateIndex:i,checked:true}));
 const data={store:'Continente',purchasedOn:'2026-01-01',items:[{templateIndex:0,productId:chicken,newProduct:{name:'Frango',unit:'kg'},purchaseId:randomUUID(),quantity:1.2,total:6},{templateIndex:7,productId:rice,purchaseId:randomUUID(),quantity:1,total:2}]};
 const bad=structuredClone(data);bad.items[1].productId=randomUUID();await assert.rejects(apply(operation('CHECKOUT',randomUUID(),bad)),/não existe/);
 let s=await snapshot();assert.equal(s.data.products.length,1);assert.equal(s.data.purchases.length,0);assert.equal(s.data.products[0].stock,2.25);assert.equal(s.data.shoppingList.items[0].checked,true);
 const op=operation('CHECKOUT',randomUUID(),data);assert.equal((await apply(op)).duplicate,false);assert.equal((await apply(op)).duplicate,true);
 s=await rpc('foodstock_snapshot',[instance,[op.operationId]]);assert.deepEqual(s.acknowledged,[op.operationId]);assert.equal(s.data.purchases.length,2);assert.equal(s.data.products.find(p=>p.id===rice).stock,3.25);assert.equal(s.data.shoppingList.items[0].checked,false);
 await assert.rejects(apply({...op,data:{...data,store:'Lidl'}}),/outra alteração/);
 await assert.rejects(apply(operation('CHECKOUT',randomUUID(),data)),/finalizado/);
 await apply(operation('CONSUME',rice,{quantity:0.25,reason:'Consumo'}));assert.equal((await snapshot()).data.products.find(p=>p.id===rice).stock,3);
 await assert.rejects(apply(operation('CONSUME',rice,{quantity:4,reason:'Consumo'})),/excede/);
 await assert.rejects(apply(operation('PURCHASE_CREATE',randomUUID(),{productId:rice,quantity:1,total:1.234,store:'Lidl',purchasedOn:'2026-01-01'})),/inválido/);
 await db.exec('set role authenticated');const rows=await query('select * from public.foodstock_products');assert.equal(rows.rows.length,2);
 await assert.rejects(query("update public.foodstock_products set stock=999"),/permission denied/);await db.exec('reset role');
 await user(bob);await db.exec('set role authenticated');assert.equal((await query('select * from public.foodstock_products')).rows.length,0);await db.exec('reset role');await user(alice);
});
test('inventory recount replaces stock without expenses, is atomic and rejects stale counts',async()=>{
 const s=await snapshot(),rice=s.data.products.find(p=>p.name==='Arroz'),beans=randomUUID();
 const op=operation('INVENTORY_CAPTURE',randomUUID(),{items:[{productId:rice.id,quantity:2,expectedStock:3,category:'Hidratos e acompanhamentos',brand:''},{productId:beans,quantity:3,category:'Conservas e leguminosas',brand:'',newProduct:{name:'Feijão',unit:'un',category:'Conservas e leguminosas',brand:''}}]});
 await apply(op);await apply(op);let now=await snapshot();assert.equal(now.data.products.find(p=>p.id===rice.id).stock,2);assert.equal(now.data.products.find(p=>p.id===beans).stock,3);assert.equal(now.data.purchases.length,2);
 await assert.rejects(apply(operation('INVENTORY_CAPTURE',randomUUID(),op.data)),/stock mudou/);now=await snapshot();assert.equal(now.data.products.length,3);assert.equal(now.data.purchases.length,2);
});
test('import preserves current stock and history exactly once, blocks overwrite and rolls back invalid backups',async()=>{
 await user(bob);const oldInstance=instance;instance=(await snapshot()).instanceId;
 const product=randomUUID(),data={...emptyData(),products:[{id:product,name:'Tomate',unit:'un',stock:2,minimumStock:0}],purchases:[{id:randomUUID(),productId:product,quantity:5,total:7,store:'Pingo Doce',purchasedOn:'2025-12-01'}],movements:[],shoppingList:{templateImported:true,items:templateItems()}};
 const bad=structuredClone(data);bad.purchases[0].total=-1;
 await assert.rejects(rpc('foodstock_import',[randomUUID(),bad]),/inválido/);assert.equal((await snapshot()).data.products.length,0);
 const id=randomUUID();await rpc('foodstock_import',[id,data]);assert.equal((await rpc('foodstock_import',[id,data])).duplicate,true);
 const s=await snapshot();assert.equal(s.data.products[0].stock,2);assert.equal(s.data.purchases.length,1);assert.equal(s.data.shoppingList.items.length,39);
 await assert.rejects(rpc('foodstock_import',[randomUUID(),data]),/já contém dados/);
 instance=oldInstance;await user(alice);
});
test('historical quota RPC remains scoped; local vision does not invoke it',async()=>{
 for(let i=1;i<=10;i++)assert.equal((await rpc('foodstock_reserve_analysis',[])).used,i);
 await assert.rejects(rpc('foodstock_reserve_analysis',[]),/Limite diário/);
 await user(bob);assert.equal((await rpc('foodstock_reserve_analysis',[])).used,1);await user(alice);
});
