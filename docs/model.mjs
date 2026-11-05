import template from './shopping-template.mjs?v=20261105.3';
export const emptyData=()=>({schemaVersion:3,products:[],purchases:[],movements:[],shoppingList:{templateImported:false,items:[]}});
export const quantity=value=>Math.round(Number(value)*1000);
export const cents=value=>Math.round(Number(value)*100);
function validateOperation(op) {
 const b=op.data;
 const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error('Preenche os campos de texto e respeita os limites indicados.');};
 const decimal=(value,places,positive=false)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||(positive&&value===0)||value>=1000000000||Number(value.toFixed(places))!==value)throw Error(`Quantidade ou valor inválido. Usa até ${places} casas decimais.`);};
 switch(op.kind) {
  case 'PRODUCT_CREATE':text(b.name,120,true);if(!['kg','L','un'].includes(b.unit))throw Error('Unidade inválida.');decimal(b.initialStock,3);decimal(b.minimumStock,3);if(b.category!==undefined)text(b.category,80);if(b.brand!==undefined)text(b.brand,120);break;
  case 'PURCHASE_CREATE': {
   text(b.store,120,true);decimal(b.quantity,3,true);decimal(b.total,2,true);
   const d=new Date(b.purchasedOn+'T12:00:00Z'),now=new Date();
   const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(b.purchasedOn)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==b.purchasedOn||b.purchasedOn>today)throw Error('Usa uma data válida, que não esteja no futuro.');
   break;
  }
  case 'CONSUME':decimal(b.quantity,3,true);text(b.reason,200,true);break;
  case 'SHOPPING_CHECK':if(typeof b.checked!=='boolean')throw Error('Marcação inválida.');break;
  case 'SHOPPING_DETAILS':text(b.quantityText,120);text(b.notes,250);text(b.expectedQuantityText,120);text(b.expectedNotes,250);break;
  case 'INVENTORY_CAPTURE':
   if(!Array.isArray(b.items)||!b.items.length||b.items.length>60)throw Error('Revê entre 1 e 60 alimentos.');
   for(const line of b.items){
    decimal(line.quantity,3);text(line.category,80);text(line.brand,120);
    if(line.newProduct)validateOperation({kind:'PRODUCT_CREATE',data:{...line.newProduct,initialStock:line.quantity,minimumStock:0}});
    else decimal(line.expectedStock,3);
   }
   break;
  case 'CHECKOUT':
   if(!Array.isArray(b.items)||!b.items.length||b.items.length>100)throw Error('Seleciona pelo menos um item para finalizar.');
   for(const line of b.items) {
    validateOperation({kind:'PURCHASE_CREATE',data:{store:b.store,purchasedOn:b.purchasedOn,quantity:line.quantity,total:line.total}});
    if(line.newProduct)validateOperation({kind:'PRODUCT_CREATE',data:{...line.newProduct,initialStock:0,minimumStock:0}});
    if(typeof line.productId!=='string'||typeof line.purchaseId!=='string')throw Error('Identificador de compra inválido.');
   }
   break;
 }
}
export function templateItems() {
 let index=0;
 return template.groups.flatMap(group=>group.items.map(item=>({...item,id:`template-${index}`,templateIndex:index++,category:group.category,categoryNote:group.note,checked:false})));
}
export function plannedAmount(text,existingUnit='') {
 const match=String(text||'').trim().match(/^(\d+(?:[.,]\d{1,3})?)\s*(kg|l|un)?$/i);
 if(!match)return {quantity:'',unit:existingUnit};
 const plannedUnit=match[2]?(match[2].toLowerCase()==='l'?'L':match[2].toLowerCase()):'';
 return {quantity:existingUnit&&plannedUnit&&existingUnit!==plannedUnit?'':match[1].replace(',','.'),unit:existingUnit||plannedUnit};
}
export function checkoutDraft(data,today) {
 const items=data.shoppingList.items.filter(item=>item.checked).map(item=>{
  const matches=data.products.filter(p=>p.name.trim().toLocaleLowerCase('pt-PT')===item.name.trim().toLocaleLowerCase('pt-PT'));
  const product=matches.length===1?matches[0]:null;
  return {shoppingId:item.id,templateIndex:item.templateIndex,name:item.name,planned:item.quantityText,
   productId:product?.id||'',newProductId:crypto.randomUUID(),purchaseId:crypto.randomUUID(),...plannedAmount(item.quantityText,product?.unit),total:''};
 });
 return {id:crypto.randomUUID(),store:data.purchases[0]?.store||'',purchasedOn:today,items};
}
export function applyOperation(data,op) {
 validateOperation(op);
 const body=op.data;
 const product=()=>{const p=data.products.find(p=>p.id===op.entityId);if(!p)throw Error('O alimento desta alteração não existe na base atual.');return p;};
 const item=()=>{const value=data.shoppingList.items.find(i=>body.templateIndex!=null?i.templateIndex===body.templateIndex:i.id===op.entityId);if(!value)throw Error('O item desta alteração não existe na lista atual.');return value;};
 switch(op.kind) {
  case 'PRODUCT_CREATE': {
   if(data.products.some(p=>p.id===op.entityId))throw Error('Este alimento já existe.');
   data.products.push({id:op.entityId,name:body.name.trim(),unit:body.unit,stock:Number(body.initialStock),minimumStock:Number(body.minimumStock),category:body.category||'',brand:body.brand||''});
   break;
  }
  case 'PURCHASE_CREATE': {
   const p=data.products.find(p=>p.id===body.productId);if(!p)throw Error('O alimento desta compra não existe na base atual.');
   p.stock=(quantity(p.stock)+quantity(body.quantity))/1000;
   data.purchases.unshift({id:op.entityId,...body,store:body.store.trim(),productName:p.name,unit:p.unit,localCreatedAt:op.createdAt});
   break;
  }
  case 'CONSUME': {
   const p=product(), remaining=quantity(p.stock)-quantity(body.quantity);
   if(remaining<0)throw Error('O consumo excede o estoque disponível. Resolve a alteração pendente antes de continuar.');
   p.stock=remaining/1000;break;
  }
  case 'SHOPPING_IMPORT':
   if(!data.shoppingList.templateImported)data.shoppingList={templateImported:true,items:templateItems()};
   break;
  case 'SHOPPING_CHECK': item().checked=body.checked;break;
  case 'SHOPPING_DETAILS': {const i=item();i.quantityText=body.quantityText.trim();i.notes=body.notes.trim();break;}
  case 'INVENTORY_CAPTURE': {
   const next=structuredClone(data),seen=new Set();
   for(const line of body.items){
    if(seen.has(line.productId))throw Error('Agrupa o mesmo alimento numa única linha.');seen.add(line.productId);
    if(line.newProduct)applyOperation(next,{...op,kind:'PRODUCT_CREATE',entityId:line.productId,data:{...line.newProduct,initialStock:line.quantity,minimumStock:0}});
    else{
     const p=next.products.find(p=>p.id===line.productId);if(!p)throw Error('Alimento não encontrado.');
     if(quantity(p.stock)!==quantity(line.expectedStock))throw Error('O stock mudou. Revê a contagem antes de substituir.');
     p.stock=line.quantity;p.category=line.category;p.brand=line.brand;
    }
   }
   Object.assign(data,next);break;
  }
  case 'CHECKOUT': {
   const next=structuredClone(data),seen=new Set(),purchaseIds=new Set();
   for(const line of body.items) {
    const selected=next.shoppingList.items.find(i=>line.templateIndex!=null?i.templateIndex===line.templateIndex:i.id===line.shoppingId);
    if(!selected||!selected.checked)throw Error('Um dos itens já foi finalizado ou desmarcado. Revê os itens selecionados.');
    if(seen.has(selected.id)||purchaseIds.has(line.purchaseId)||next.purchases.some(p=>p.id===line.purchaseId))throw Error('Esta compra ou este item já foi registado.');
    seen.add(selected.id);purchaseIds.add(line.purchaseId);
    if(line.newProduct)applyOperation(next,{...op,kind:'PRODUCT_CREATE',entityId:line.productId,data:{...line.newProduct,initialStock:0,minimumStock:0}});
    applyOperation(next,{...op,kind:'PURCHASE_CREATE',entityId:line.purchaseId,data:{productId:line.productId,quantity:line.quantity,total:line.total,store:body.store,purchasedOn:body.purchasedOn}});
    selected.checked=false;
   }
   Object.assign(data,next);break;
  }
  default:throw Error('Alteração local desconhecida. Exporta os dados antes de atualizar.');
 }
 return data;
}
export function project(base,pending,strict=false) {
 const data=structuredClone(base||emptyData());const warnings=[];
 for(const operation of pending) {
  try { applyOperation(data,operation); }
  catch(error) { if(strict)throw error;warnings.push({id:operation.operationId,message:error.message});break; }
 }
 data.products.sort((a,b)=>a.name.localeCompare(b.name,'pt-PT'));
 data.purchases.sort((a,b)=>b.purchasedOn.localeCompare(a.purchasedOn));
 return {data,warnings};
}
export function statistics(data,year) {
 const monthCents=new Map(),histories=new Map(),storeCents=new Map();
 let total=0,previous=0;
 for(const purchase of data.purchases){
  const amount=cents(purchase.total),month=purchase.purchasedOn.slice(0,7);
  monthCents.set(month,(monthCents.get(month)||0)+amount);
  if(!histories.has(purchase.productId))histories.set(purchase.productId,[]);
  histories.get(purchase.productId).push(purchase);
  if(purchase.purchasedOn.startsWith(`${year}-`)){total+=amount;storeCents.set(purchase.store,(storeCents.get(purchase.store)||0)+amount);}
  if(purchase.purchasedOn.startsWith(`${year-1}-`))previous+=amount;
 }
 const variation=(now,previous)=>previous===0?null:Math.round((now-previous)/previous*10000)/100;
 const months=Array.from({length:12},(_,i)=>{
  const month=`${year}-${String(i+1).padStart(2,'0')}`;
  const previous=i===0?`${year-1}-12`:`${year}-${String(i).padStart(2,'0')}`;
  const total=monthCents.get(month)||0;
  return {month,total:total/100,previousMonthChangePercent:variation(total,monthCents.get(previous)||0)};
 });
 const prices=[];
 for(const product of data.products) {
  const history=histories.get(product.id);if(!history)continue;
  const unitPrice=p=>cents(p.total)*10/quantity(p.quantity);
  const latest=history[0], cheapest=history.reduce((a,b)=>unitPrice(b)<unitPrice(a)?b:a);
  prices.push({productId:product.id,name:product.name,unit:product.unit,latestUnitPrice:unitPrice(latest),latestStore:latest.store,latestDate:latest.purchasedOn,
   previousUnitPrice:history[1]?unitPrice(history[1]):null,changePercent:history[1]?variation(unitPrice(latest),unitPrice(history[1])):null,
   cheapestUnitPrice:unitPrice(cheapest),cheapestStore:cheapest.store,cheapestDate:cheapest.purchasedOn,purchaseCount:history.length});
 }
 return {year,total:total/100,previousYearTotal:previous/100,yearChangePercent:variation(total,previous),months,prices,stores:Object.fromEntries([...storeCents].sort().map(([k,v])=>[k,v/100]))};
}
