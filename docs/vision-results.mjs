import {foodForLabel} from './food-labels.mjs?v=20261105.2';
function overlap(a,b){const intersection=Math.max(0,Math.min(a.xmax,b.xmax)-Math.max(a.xmin,b.xmin))*Math.max(0,Math.min(a.ymax,b.ymax)-Math.max(a.ymin,b.ymin));return intersection/Math.max(1,Math.min((a.xmax-a.xmin)*(a.ymax-a.ymin),(b.xmax-b.xmin)*(b.ymax-b.ymin)));}
export function processPredictions(predictions,width,height,{threshold=.25}={}){
 if(!Array.isArray(predictions)||predictions.length>900||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('O modelo devolveu uma resposta inválida.');
 const candidates=[];
 for(const prediction of predictions){
  if(typeof prediction.label!=='string'||prediction.label.length>500||typeof prediction.score!=='number'||!Number.isFinite(prediction.score)||prediction.score<threshold||prediction.score>1)continue;
  const food=foodForLabel(prediction.label),box=prediction.box;if(!food||!box||!['xmin','ymin','xmax','ymax'].every(k=>typeof box[k]==='number'&&Number.isFinite(box[k])))continue;
  const bounded={xmin:Math.max(0,Math.min(width,box.xmin)),ymin:Math.max(0,Math.min(height,box.ymin)),xmax:Math.max(0,Math.min(width,box.xmax)),ymax:Math.max(0,Math.min(height,box.ymax))};
  if(bounded.xmax-bounded.xmin<4||bounded.ymax-bounded.ymin<4)continue;
  candidates.push({...food,score:prediction.score,box:bounded});
 }
 candidates.sort((a,b)=>b.score-a.score);
 const detections=[];for(const candidate of candidates){if(!detections.some(other=>overlap(candidate.box,other.box)>.65))detections.push(candidate);if(detections.length>=60)break;}
 const groups=new Map();
 for(const detection of detections){if(!groups.has(detection.label))groups.set(detection.label,{name:detection.name,category:detection.category,brand:'',unit:null,quantity:null,visibleCount:0,notes:'Sugestão de IA local. Confirma a identificação, as embalagens em falta e a quantidade total; o modelo não sabe o peso nem o conteúdo restante.'});groups.get(detection.label).visibleCount++;}
 return {items:[...groups.values()],detections:detections.map(({name,box,score})=>({name,score,box,polygon:[[box.xmin,box.ymin],[box.xmax,box.ymin],[box.xmax,box.ymax],[box.xmin,box.ymax]]}))};
}
