export const categories=['Proteínas','Hidratos e acompanhamentos','Legumes','Fruta','Laticínios','Conservas e leguminosas','Bebidas','Lanche','Temperos','Outros'];
export function photoDraft(items,products){
 if(!Array.isArray(items)||items.length>60)throw Error('Resposta de reconhecimento inválida.');
 return {id:crypto.randomUUID(),items:items.map(item=>{
  if(typeof item.name!=='string'||!item.name.trim()||item.name.length>120||!categories.includes(item.category))throw Error('Alimento reconhecido inválido.');
  const matches=products.filter(p=>p.name.trim().toLocaleLowerCase('pt-PT')===item.name.trim().toLocaleLowerCase('pt-PT'));
  const p=matches.length===1?matches[0]:null;
  return {rowId:crypto.randomUUID(),newProductId:crypto.randomUUID(),productId:p?.id||'',name:item.name,category:item.category,brand:typeof item.brand==='string'?item.brand.slice(0,120):'',
   quantity:!p&&typeof item.quantity==='number'&&item.quantity>0&&item.quantity<1e9&&['kg','L','un'].includes(item.unit)?String(Math.round(item.quantity*1000)/1000):'',
   unit:p?.unit||(['kg','L','un'].includes(item.unit)?item.unit:''),expectedStock:p?.stock??null,
   visibleCount:Number.isInteger(item.visibleCount)&&item.visibleCount>0?item.visibleCount:null,notes:typeof item.notes==='string'?item.notes.slice(0,500):''};
 })};
}
export function captureData(draft){return {items:draft.items.map(i=>({productId:i.productId||i.newProductId,quantity:Number(i.quantity),expectedStock:i.expectedStock,category:i.category,brand:i.brand.trim(),newProduct:i.productId?null:{name:i.name.trim(),unit:i.unit,category:i.category,brand:i.brand.trim()}}))};}
