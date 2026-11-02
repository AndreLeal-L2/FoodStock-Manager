export const CATEGORIES=['Proteínas','Hidratos e acompanhamentos','Legumes','Fruta','Laticínios','Conservas e leguminosas','Bebidas','Lanche','Temperos','Outros'];
export const MAX_BODY=4_000_000;
export function sanitizeItems(value){
 if(!Array.isArray(value?.items)||value.items.length>60)throw Error('Resposta de reconhecimento inválida.');
 return value.items.map(item=>{
  if(typeof item.name!=='string'||!item.name.trim()||item.name.length>120||!CATEGORIES.includes(item.category))throw Error('Alimento inválido.');
  const number=(n,max,integer=false)=>n===null||(typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=max&&(!integer||Number.isInteger(n)));
  if(!number(item.visibleCount,1000,true)||!number(item.quantity,999999999)||![null,'kg','L','un'].includes(item.unit)||
   ![null,'string'].includes(item.brand===null?null:typeof item.brand)||typeof item.notes!=='string'||item.notes.length>500||(item.brand||'').length>120)throw Error('Quantidades ou detalhes inválidos.');
  return {name:item.name.trim(),category:item.category,visibleCount:item.visibleCount,quantity:item.quantity===null?null:Math.round(item.quantity*1000)/1000,unit:item.unit,brand:item.brand||'',notes:item.notes};
 });
}
export function validImage(image){
 if(typeof image!=='string'||image.length>3_800_000)return false;
 const match=image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!match||match[2].length%4!==0)return false;
 let bytes;try{bytes=atob(match[2].slice(0,64));}catch{return false;}
 return match[1]==='jpeg'?bytes.startsWith('\xff\xd8\xff'):match[1]==='png'?bytes.startsWith('\x89PNG\r\n\x1a\n'):bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP';
}
async function readJson(request){
 const reader=request.body?.getReader();if(!reader)throw Error('Fotografia em falta.');
 let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BODY)throw Error('A fotografia excede o limite de envio.');chunks.push(value);}}
 finally{reader.releaseLock();}
 const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(body));
}
export function createHandler({allowedOrigins,verifyUser,reserve,recognize,configured=true}){
 return async request=>{
  const origin=request.headers.get('origin');const allowed=!origin||allowedOrigins.includes(origin);
  const headers={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin',...(origin&&allowed?{'Access-Control-Allow-Origin':origin}:{})};
  const reply=(status,message)=>new Response(JSON.stringify(typeof message==='string'?{message}:message),{status,headers});
  if(!allowed)return reply(403,'Origem não autorizada.');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type'}});
  if(request.method!=='POST')return reply(405,'Usa POST.');
  const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return reply(401,'Inicia sessão para analisar uma fotografia.');
  let user;try{user=await verifyUser(authorization);}catch{return reply(503,'Não foi possível verificar a sessão. Tenta novamente.');}
  if(!user?.id)return reply(401,'Sessão inválida ou expirada.');
  if(!configured)return reply(503,'O reconhecimento ainda não foi configurado no Supabase. Podes registar os alimentos manualmente.');
  let body;try{body=await readJson(request);}catch{return reply(400,'Envia uma fotografia JPEG, PNG ou WebP dentro do limite.');}
  if(!validImage(body.image))return reply(400,'Fotografia inválida ou demasiado grande.');
  try{await reserve(authorization);}catch(error){return reply(error.status===429?429:503,error.status===429?'Limite diário de análises atingido. Tenta amanhã.':'Não foi possível reservar a análise. Tenta novamente.');}
  try{return reply(200,{items:sanitizeItems(await recognize(body.image)),requiresReview:true});}
  catch{return reply(502,'Não foi possível reconhecer esta fotografia. Tenta uma imagem mais nítida ou adiciona os alimentos manualmente.');}
 };
}
