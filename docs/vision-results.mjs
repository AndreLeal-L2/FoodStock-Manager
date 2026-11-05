import {foodForLabel} from './food-labels.mjs?v=20261105.4';
function duplicate(a,b){
 const intersection=Math.max(0,Math.min(a.box.xmax,b.box.xmax)-Math.max(a.box.xmin,b.box.xmin))*Math.max(0,Math.min(a.box.ymax,b.box.ymax)-Math.max(a.box.ymin,b.box.ymin));
 const areaA=(a.box.xmax-a.box.xmin)*(a.box.ymax-a.box.ymin),areaB=(b.box.xmax-b.box.xmin)*(b.box.ymax-b.box.ymin);
 // Same food: suppress nested boxes. Different foods: suppress only competing boxes for the same area.
 return intersection/(a.label===b.label?Math.min(areaA,areaB):areaA+areaB-intersection)>.65;
}
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
 const detections=[];for(const candidate of candidates){if(!detections.some(other=>duplicate(candidate,other)))detections.push(candidate);if(detections.length>=60)break;}
 const groups=new Map();
 for(const detection of detections){if(!groups.has(detection.label))groups.set(detection.label,{name:detection.name,category:detection.category,brand:'',unit:null,quantity:null,visibleCount:0,notes:'Identificação pela aparência. Pode estar errada: confirma o alimento, os itens em falta e a quantidade total. A imagem não mede o peso nem o conteúdo restante.'});groups.get(detection.label).visibleCount++;}
 return {items:[...groups.values()],detections:detections.map(({name,box,score})=>({name,score,box,polygon:[[box.xmin,box.ymin],[box.xmax,box.ymin],[box.xmax,box.ymax],[box.xmin,box.ymax]]}))};
}
