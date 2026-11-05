import {foodForLabel} from './food-labels.mjs?v=20261105.3';
export function readLabelResults(data,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Dimensões de fotografia inválidas.');
 const items=new Map(),detections=[];
 for(const block of data?.blocks||[])for(const paragraph of block.paragraphs||[]){
  const lines=paragraph.lines||[];
  if(lines.some(line=>/(?:ingredientes|ingredients|pode conter|may contain|tra[çc]os|traces of|informa[çc][aã]o nutricional|nutrition)/iu.test(line.text||'')))continue;
  for(const line of lines){
   const text=String(line.text||'').trim(),excluded=text.match(/\b(?:sem|n[aã]o cont[eé]m|isento de|without|free from)\b(.*)$/iu);
   if((excluded&&foodForLabel(excluded[1]))||/\b(?:milk|leite)[ -]free\b/iu.test(text))continue;
   const words=(line.words||[]).filter(word=>Number.isFinite(word.confidence)&&word.confidence>=70);
   const label=words.map(word=>word.text).join(' '),food=foodForLabel(label);
   if(!food||!words.length)continue;
   const boxes=words.map(word=>word.bbox);
   if(!boxes.every(box=>box&&['x0','y0','x1','y1'].every(k=>Number.isFinite(box[k]))))continue;
   const x0=Math.max(0,Math.min(width,Math.min(...boxes.map(b=>b.x0)))),y0=Math.max(0,Math.min(height,Math.min(...boxes.map(b=>b.y0))));
   const x1=Math.max(0,Math.min(width,Math.max(...boxes.map(b=>b.x1)))),y1=Math.max(0,Math.min(height,Math.max(...boxes.map(b=>b.y1))));
   if(x1<=x0||y1<=y0)continue;
   if(!items.has(food.label))items.set(food.label,{name:food.name,category:food.category,brand:'',unit:null,quantity:null,visibleCount:null,notes:`Lido no rótulo: «${label.slice(0,120)}». Confirma o produto e a quantidade total; o texto não mede o conteúdo nem conta embalagens.`});
   if(detections.length<60)detections.push({name:food.name,source:'label',polygon:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]});
  }
 }
 return {items:[...items.values()].slice(0,60),detections,method:'labels'};
}
