import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyData,project,statistics,templateItems,applyOperation} from '../docs/model.mjs';
import template from '../docs/shopping-template.mjs';
const productId='21ba286f-cb8d-4a7d-8e2b-1e5dbfd74d25';
const op=(kind,data,entityId=productId)=>({operationId:crypto.randomUUID(),kind,data,entityId,createdAt:new Date().toISOString()});
const product=()=>op('PRODUCT_CREATE',{name:'Arroz',unit:'kg',initialStock:0,minimumStock:1});
const purchase=(date,quantity,total)=>op('PURCHASE_CREATE',{productId,quantity,total,store:'Loja A',purchasedOn:date},crypto.randomUUID());
test('offline groceries survive projection with exact money and normalized prices',()=>{
 const base=emptyData();const pending=[product(),purchase('2024-01-01',.5,2),purchase('2024-02-01',2,6),op('CONSUME',{quantity:.25,reason:'Consumo'})];
 const {data}=project(base,pending,true),stats=statistics(data,2024);
 assert.equal(data.products[0].stock,2.25);assert.equal(stats.total,8);assert.equal(stats.prices[0].changePercent,-25);
 assert.equal(stats.months[1].previousMonthChangePercent,200);assert.equal(base.products.length,0);
});
test('monthly and yearly comparisons include the year boundary',()=>{
 const {data}=project(emptyData(),[product(),purchase('2023-12-01',1,10),purchase('2024-01-01',1,15)],true);
 const stats=statistics(data,2024);assert.equal(stats.months[0].previousMonthChangePercent,50);assert.equal(stats.yearChangePercent,50);
});
test('integer quantities and cents avoid decimal drift',()=>{
 const {data}=project(emptyData(),[product(),purchase('2024-01-01',.1,.1),purchase('2024-01-02',.2,.2)],true);
 assert.equal(data.products[0].stock,.3);assert.equal(statistics(data,2024).total,.3);
});
test('a depleted remote stock blocks replay without erasing pending operations',()=>{
 const data=emptyData();data.products=[{id:productId,name:'Arroz',unit:'kg',stock:.1,minimumStock:0}];
 const pending=[op('CONSUME',{quantity:1,reason:'Consumo'})];const result=project(data,pending);
 assert.equal(result.warnings.length,1);assert.equal(result.data.products[0].stock,.1);assert.equal(pending.length,1);
 assert.throws(()=>project(data,pending,true),/excede/);
});
test('the offline shopping template matches the server and does not become spending',async()=>{
 const server=JSON.parse(await readFile(new URL('../backend/src/main/resources/shopping-template.json',import.meta.url),'utf8'));
 assert.deepEqual(template,server);assert.equal(templateItems().length,39);
 const {data}=project(emptyData(),[op('SHOPPING_IMPORT',{},null),op('SHOPPING_CHECK',{checked:true,templateIndex:5},'template-5')],true);
 assert.equal(data.shoppingList.items[5].checked,true);assert.equal(data.shoppingList.items[5].quantityText,'12 ou 24');
 assert.equal(data.products.length,0);assert.equal(statistics(data,2024).total,0);
});
test('invalid local values are rejected before being queued',()=>{
 assert.throws(()=>project(emptyData(),[op('PRODUCT_CREATE',{name:'   ',unit:'kg',initialStock:0,minimumStock:0})],true));
 assert.throws(()=>project(emptyData(),[product(),purchase('2024-01-01',1,1.001)],true));
 assert.throws(()=>project(emptyData(),[product(),purchase('2999-01-01',1,1)],true));
});

test('checkout creates a new food, reuses an existing food and updates stock, expenses and list atomically',()=>{
 const before=project(emptyData(),[product(),op('SHOPPING_IMPORT',{},null),op('SHOPPING_CHECK',{checked:true,templateIndex:0}),op('SHOPPING_CHECK',{checked:true,templateIndex:7})],true).data;
 const checkout=op('CHECKOUT',{store:'Loja A',purchasedOn:'2024-01-01',items:[
  {shoppingId:'template-0',templateIndex:0,productId:crypto.randomUUID(),newProduct:{name:'Frango',unit:'kg'},purchaseId:crypto.randomUUID(),quantity:1.2,total:6},
  {shoppingId:'template-7',templateIndex:7,productId,newProduct:null,purchaseId:crypto.randomUUID(),quantity:1,total:2}
 ]});
 const {data}=project(before,[checkout],true);
 assert.equal(data.products.length,2);assert.equal(data.products.find(p=>p.id===productId).stock,1);assert.equal(data.products.find(p=>p.name==='Frango').stock,1.2);
 assert.equal(data.purchases.length,2);assert.equal(statistics(data,2024).total,8);assert.equal(data.shoppingList.items.filter(i=>i.checked).length,0);
 assert.equal(before.purchases.length,0);assert.equal(before.shoppingList.items[0].checked,true);
 assert.throws(()=>project(data,[checkout],true),/finalizado|desmarcado/);
});
test('a checkout failure in the second item cannot leave a partial local purchase',()=>{
 const before=project(emptyData(),[op('SHOPPING_IMPORT',{},null),op('SHOPPING_CHECK',{checked:true,templateIndex:0}),op('SHOPPING_CHECK',{checked:true,templateIndex:7})],true).data;
 const checkout=op('CHECKOUT',{store:'A',purchasedOn:'2024-01-01',items:[
  {templateIndex:0,productId:crypto.randomUUID(),newProduct:{name:'Frango',unit:'kg'},purchaseId:crypto.randomUUID(),quantity:1,total:5},
  {templateIndex:7,productId:'missing',newProduct:null,purchaseId:crypto.randomUUID(),quantity:1,total:2}
 ]});
 const result=project(before,[checkout]);assert.equal(result.warnings.length,1);assert.equal(result.data.products.length,0);assert.equal(result.data.purchases.length,0);
 assert.equal(result.data.shoppingList.items[0].checked,true);
});
test('checkout quantity suggestions do not guess ranges or package sizes',async()=>{
 const {plannedAmount,checkoutDraft}=await import('../docs/model.mjs');
 assert.deepEqual(plannedAmount('12 ou 24'),{quantity:'',unit:''});assert.deepEqual(plannedAmount('1 cx'),{quantity:'',unit:''});
 assert.deepEqual(plannedAmount('3 kg'),{quantity:'3',unit:'kg'});assert.deepEqual(plannedAmount('3 kg','un'),{quantity:'',unit:'un'});
 const data=project(emptyData(),[product(),op('SHOPPING_IMPORT',{},null),op('SHOPPING_CHECK',{checked:true,templateIndex:7})],true).data;
 const draft=checkoutDraft(data,'2024-01-01');assert.equal(draft.items[0].productId,productId);assert.equal(draft.items[0].unit,'kg');assert.equal(draft.items[0].total,'');
 assert.equal(data.purchases.length,0);
});
test('checkout rejects an invalid price before any stock can be changed',()=>{
 const data=project(emptyData(),[op('SHOPPING_IMPORT',{},null),op('SHOPPING_CHECK',{checked:true,templateIndex:0})],true).data;
 const checkout=op('CHECKOUT',{store:'A',purchasedOn:'2024-01-01',items:[{templateIndex:0,productId:crypto.randomUUID(),newProduct:{name:'Frango',unit:'kg'},purchaseId:crypto.randomUUID(),quantity:1,total:0}]});
 assert.throws(()=>project(data,[checkout],true));assert.equal(data.purchases.length,0);assert.equal(data.products.length,0);
});

test('inventory counts replace quantities without creating expenses, repeat safely and reject stale counts atomically',()=>{
 const base=emptyData(),id=crypto.randomUUID();
 applyOperation(base,{kind:'PRODUCT_CREATE',entityId:id,data:{name:'Arroz',unit:'kg',initialStock:5,minimumStock:0}});
 const capture={kind:'INVENTORY_CAPTURE',data:{items:[{productId:id,expectedStock:5,quantity:2,category:'Hidratos e acompanhamentos',brand:''}]}};
 applyOperation(base,capture);assert.equal(base.products[0].stock,2);assert.equal(base.purchases.length,0);
 assert.throws(()=>applyOperation(base,capture),/stock mudou/);assert.equal(base.products[0].stock,2);
 const bad={kind:'INVENTORY_CAPTURE',data:{items:[{productId:id,expectedStock:2,quantity:4,category:'Outros',brand:''},{productId:crypto.randomUUID(),expectedStock:0,quantity:1,category:'Outros',brand:''}]}};
 assert.throws(()=>applyOperation(base,bad),/não encontrado/);assert.equal(base.products[0].stock,2);
});

test('statistics keep exact totals, store names and all-year price history across products',()=>{
 const data=emptyData();data.products=[{id:'rice',name:'Arroz',unit:'kg'},{id:'milk',name:'Leite',unit:'un'},{id:'pasta',name:'Massa',unit:'kg'}];
 data.purchases=[
  {productId:'rice',purchasedOn:'2025-02-01',quantity:2,total:5.50,store:'A'},
  {productId:'milk',purchasedOn:'2024-03-02',quantity:4,total:4,store:'B'},
  {productId:'rice',purchasedOn:'2024-01-02',quantity:1,total:2.75,store:'__proto__'},
  {productId:'rice',purchasedOn:'2024-01-01',quantity:2,total:5.50,store:'A'},
  {productId:'milk',purchasedOn:'2023-12-31',quantity:2,total:2,store:'A'}
 ];
 const original=structuredClone(data),stats=statistics(data,2024);
 assert.equal(stats.total,12.25);assert.equal(stats.previousYearTotal,2);assert.equal(stats.yearChangePercent,512.5);
 assert.deepEqual(stats.stores,{A:5.5,B:4,['__proto__']:2.75});
 assert.deepEqual(stats.months.slice(0,4),[
  {month:'2024-01',total:8.25,previousMonthChangePercent:312.5},
  {month:'2024-02',total:0,previousMonthChangePercent:-100},
  {month:'2024-03',total:4,previousMonthChangePercent:null},
  {month:'2024-04',total:0,previousMonthChangePercent:-100}
 ]);
 assert.deepEqual(stats.prices.map(p=>[p.productId,p.latestDate,p.latestUnitPrice,p.previousUnitPrice,p.changePercent,p.cheapestDate,p.purchaseCount]),[
  ['rice','2025-02-01',2.75,2.75,0,'2025-02-01',3],['milk','2024-03-02',1,1,0,'2024-03-02',2]
 ]);
 assert.deepEqual(statistics(data,2022).stores,{});assert.deepEqual(data,original);
});
