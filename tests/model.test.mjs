import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyData,project,statistics,templateItems} from '../docs/model.mjs';
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
