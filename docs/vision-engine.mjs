// FoodStock classical vision: FAST corners, intensity-centroid orientation,
// deterministic rotated binary descriptors, Hamming matching and RANSAC homography.
// No learned weights, semantic classifier, network calls or external runtime.
export const ALGORITHM='foodstock-fast-brief-v1';
export const MAX_REFERENCES=24;
const CIRCLE=[[0,-3],[1,-3],[2,-2],[3,-1],[3,0],[3,1],[2,2],[1,3],[0,3],[-1,3],[-2,2],[-3,1],[-3,0],[-3,-1],[-2,-2],[-1,-3]];
let seed=0x4653544b;
const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
const sample=()=>{let x,y;do{x=Math.round(random()*24-12);y=Math.round(random()*24-12);}while(x*x+y*y>144);return [x,y];};
const PATTERN=Array.from({length:256},()=>[...sample(),...sample()]);
function gray(image){
 const {width,height,data}=image;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<48||height<48||width>1600||height>1600||data?.length!==width*height*4)throw Error('Usa uma fotografia válida com pelo menos 48 × 48 píxeis.');
 const out=new Uint8Array(width*height);for(let i=0;i<out.length;i++)out[i]=(77*data[i*4]+150*data[i*4+1]+29*data[i*4+2])>>>8;
 return out;
}
function resize(source,w,h,nw,nh){
 const out=new Uint8Array(nw*nh);
 for(let y=0;y<nh;y++){const sy=(y+.5)*h/nh-.5,y0=Math.max(0,Math.floor(sy)),y1=Math.min(h-1,y0+1),dy=Math.max(0,sy-y0);
  for(let x=0;x<nw;x++){const sx=(x+.5)*w/nw-.5,x0=Math.max(0,Math.floor(sx)),x1=Math.min(w-1,x0+1),dx=Math.max(0,sx-x0);
   out[y*nw+x]=(1-dy)*((1-dx)*source[y0*w+x0]+dx*source[y0*w+x1])+dy*((1-dx)*source[y1*w+x0]+dx*source[y1*w+x1]);}}
 return out;
}
function smooth(source,w,h){
 const out=new Uint8Array(source.length);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;out[i]=(source[i-w-1]+2*source[i-w]+source[i-w+1]+2*source[i-1]+4*source[i]+2*source[i+1]+source[i+w-1]+2*source[i+w]+source[i+w+1])>>>4;}
 return out;
}
function corners(pixels,w,h,limit){
 const scores=new Uint16Array(w*h),offsets=CIRCLE.map(([x,y])=>y*w+x),threshold=13;
 for(let y=17;y<h-17;y++)for(let x=17;x<w-17;x++){
  const i=y*w+x,v=pixels[i];let bright=0,dark=0;
  for(let k=0;k<16;k+=4){const d=pixels[i+offsets[k]]-v;if(d>threshold)bright++;if(d< -threshold)dark++;}if(bright<2&&dark<2)continue;
  let runB=0,runD=0,score=0,found=false;
  for(let k=0;k<24;k++){const d=pixels[i+offsets[k&15]]-v;runB=d>threshold?runB+1:0;runD=d< -threshold?runD+1:0;if(runB>=9||runD>=9)found=true;if(k<16)score+=Math.abs(d);}
  if(found)scores[i]=score;
 }
 const points=[];
 for(let y=17;y<h-17;y++)for(let x=17;x<w-17;x++){const i=y*w+x,s=scores[i];if(!s)continue;let max=true;for(let dy=-1;dy<=1&&max;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&scores[i+dy*w+dx]>s){max=false;break;}if(max)points.push({x,y,score:s});}
 points.sort((a,b)=>b.score-a.score);
 const cells=new Map(),chosen=[];const cell=16;
 for(const p of points){const key=Math.floor(p.x/cell)+','+Math.floor(p.y/cell),neighbors=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)neighbors.push(...(cells.get((Math.floor(p.x/cell)+dx)+','+(Math.floor(p.y/cell)+dy))||[]));
  if(neighbors.some(q=>(p.x-q.x)**2+(p.y-q.y)**2<25))continue;
  if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);chosen.push(p);if(chosen.length>=limit)break;
 }
 return chosen;
}
function describe(pixels,w,x,y){
 let mx=0,my=0;
 for(let dy=-12;dy<=12;dy++)for(let dx=-12;dx<=12;dx++)if(dx*dx+dy*dy<=144){const v=pixels[(y+dy)*w+x+dx];mx+=dx*v;my+=dy*v;}
 const angle=Math.atan2(my,mx),c=Math.cos(angle),s=Math.sin(angle),bits=new Uint32Array(8);
 for(let k=0;k<256;k++){const [ax,ay,bx,by]=PATTERN[k];const a=pixels[(y+Math.round(s*ax+c*ay))*w+x+Math.round(c*ax-s*ay)],b=pixels[(y+Math.round(s*bx+c*by))*w+x+Math.round(c*bx-s*by)];if(a<b)bits[k>>>5]|=1<<(k&31);}
 return bits;
}
export function extractFeatures(image,{reference=false}={}){
 const original=gray(image),limit=reference?360:1500,levels=reference?5:7,points=[],descriptors=[];
 for(let level=0;level<levels;level++){
  const scale=.8**level,w=Math.round(image.width*scale),h=Math.round(image.height*scale);if(w<56||h<56)break;
  const pixels=smooth(level?resize(original,image.width,image.height,w,h):original,w,h);
  for(const p of corners(pixels,w,h,Math.ceil(limit/levels))){points.push(p.x/scale,p.y/scale);descriptors.push(...describe(pixels,w,p.x,p.y));}
 }
 return {algorithm:ALGORITHM,width:image.width,height:image.height,points,descriptors};
}
export function validateFeatures(value){
 const n=value?.points?.length/2;
 if(!Array.isArray(value?.points)||value?.algorithm!==ALGORITHM||!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<48||value.height<48||value.width>640||value.height>640||!Number.isInteger(n)||n<20||n>400||!Array.isArray(value.descriptors)||value.descriptors.length!==n*8||!value.points.every((v,i)=>Number.isFinite(v)&&v>=0&&v<=(i%2?value.height:value.width))||!value.descriptors.every(v=>Number.isInteger(v)&&v>=0&&v<=0xffffffff))throw Error('Referência visual inválida ou incompatível.');
 return value;
}
const popcount=value=>{let v=value>>>0;v-=v>>>1&0x55555555;v=(v&0x33333333)+(v>>>2&0x33333333);return (((v+(v>>>4))&0x0f0f0f0f)*0x01010101)>>>24;};
function pairs(reference,scene){
 const result=[],rd=reference.descriptors,sd=scene.descriptors,sp=scene.points,rp=reference.points;
 for(let i=0;i<rp.length/2;i++){
  const best=[];
  for(let j=0;j<sp.length/2;j++){let distance=0;for(let k=0;k<8;k++){distance+=popcount(rd[i*8+k]^sd[j*8+k]);if(distance>70)break;}if(distance>70)continue;
   if(best.length===4&&distance>=best[3].distance)continue;best.push({j,distance});best.sort((a,b)=>a.distance-b.distance);if(best.length>4)best.pop();}
  if(!best.length)continue;
  const min=best[0].distance,ambiguous=best.length>1&&min>=36&&min>best[1].distance*.83;
  if(ambiguous)continue;
  const accepted=[];
  for(const match of best){if(match.distance>min+6)continue;const j=match.j;if(accepted.some(q=>(sp[j*2]-q.u)**2+(sp[j*2+1]-q.v)**2<225))continue;
   const p={x:rp[i*2],y:rp[i*2+1],u:sp[j*2],v:sp[j*2+1],ri:i,si:j};accepted.push(p);result.push(p);if(accepted.length>=3)break;}
 }
 return result;
}
function solve(matrix,vector){
 const a=matrix.map((row,i)=>[...row,vector[i]]),n=vector.length;
 for(let i=0;i<n;i++){let pivot=i;for(let r=i+1;r<n;r++)if(Math.abs(a[r][i])>Math.abs(a[pivot][i]))pivot=r;if(Math.abs(a[pivot][i])<1e-10)return null;[a[pivot],a[i]]=[a[i],a[pivot]];const d=a[i][i];for(let c=i;c<=n;c++)a[i][c]/=d;
  for(let r=0;r<n;r++)if(r!==i){const f=a[r][i];for(let c=i;c<=n;c++)a[r][c]-=f*a[i][c];}}
 return a.map(row=>row[n]);
}
function fit(matches,rw,rh,sw,sh){
 if(matches.length<4)return null;
 const matrix=Array.from({length:8},()=>Array(8).fill(0)),vector=Array(8).fill(0);
 for(const p of matches){const x=p.x/rw,y=p.y/rh,u=p.u/sw,v=p.v/sh;
  for(const [row,target] of [[[x,y,1,0,0,0,-u*x,-u*y],u],[[0,0,0,x,y,1,-v*x,-v*y],v]])for(let i=0;i<8;i++){vector[i]+=row[i]*target;for(let j=0;j<8;j++)matrix[i][j]+=row[i]*row[j];}}
 const h=solve(matrix,vector);if(!h)return null;
 return (x,y)=>{x/=rw;y/=rh;const den=h[6]*x+h[7]*y+1;if(Math.abs(den)<1e-8)return [Infinity,Infinity];return [(h[0]*x+h[1]*y+h[2])*sw/den,(h[3]*x+h[4]*y+h[5])*sh/den];};
}
function inliers(matches,project,threshold){
 const byReference=new Map();
 for(const p of matches){const [u,v]=project(p.x,p.y),d=(u-p.u)**2+(v-p.v)**2;if(d>threshold*threshold)continue;const old=byReference.get(p.ri);if(!old||d<old.d)byReference.set(p.ri,{p,d});}
 return [...byReference.values()].map(o=>o.p);
}
function locate(matches,reference,scene){
 if(matches.length<14)return null;
 let state=0x12345678;const randomIndex=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)%matches.length;};
 let best=[];const threshold=Math.max(5,scene.width*.007);
 for(let iteration=0;iteration<700;iteration++){
  const a=matches[randomIndex()],b=matches[randomIndex()];if(a.ri===b.ri||a.si===b.si)continue;
  const x=b.x-a.x,y=b.y-a.y,u=b.u-a.u,v=b.v-a.v,den=x*x+y*y;if(den<(reference.width*.15)**2)continue;
  const c=(u*x+v*y)/den,s=(v*x-u*y)/den,scale=Math.hypot(c,s);if(scale<.15||scale>4)continue;
  const tx=a.u-c*a.x+s*a.y,ty=a.v-s*a.x-c*a.y;
  const group=inliers(matches,(x,y)=>[c*x-s*y+tx,s*x+c*y+ty],threshold*2.5);if(group.length>best.length)best=group;
 }
 // Reprojection with a full projective transform rejects accidental text/logo matches.
 let projection=fit(best,reference.width,reference.height,scene.width,scene.height);
 if(!projection)return null;
 for(let pass=0;pass<3;pass++){best=inliers(matches,projection,threshold);projection=fit(best,reference.width,reference.height,scene.width,scene.height);if(!projection)return null;}
 if(best.length<14)return null;
 const xs=best.map(p=>p.x),ys=best.map(p=>p.y),coverage=(Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys))/(reference.width*reference.height);
 if(coverage<.12)return null;
 const polygon=[[0,0],[reference.width,0],[reference.width,reference.height],[0,reference.height]].map(([x,y])=>projection(x,y));
 const signs=polygon.map((p,i)=>{const a=polygon[(i+1)%4],b=polygon[(i+2)%4];return (a[0]-p[0])*(b[1]-a[1])-(a[1]-p[1])*(b[0]-a[0]);});
 if(!signs.every(v=>v>0)||!polygon.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)&&x> -scene.width*.2&&x<scene.width*1.2&&y> -scene.height*.2&&y<scene.height*1.2))return null;
 const area=Math.abs(polygon.reduce((sum,p,i)=>sum+p[0]*polygon[(i+1)%4][1]-p[1]*polygon[(i+1)%4][0],0)/2);
 if(area<1500||area>scene.width*scene.height*1.3)return null;
 return {polygon,matches:best.length,coverage};
}
function box(polygon){const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];}
function overlap(a,b){const [x,y,r,bottom]=box(a.polygon),[u,v,s,t]=box(b.polygon);const intersection=Math.max(0,Math.min(r,s)-Math.max(x,u))*Math.max(0,Math.min(bottom,t)-Math.max(y,v));return intersection/Math.max(1,Math.min((r-x)*(bottom-y),(s-u)*(t-v)));}
function inside(p,polygon){let sign=0;for(let i=0;i<4;i++){const a=polygon[i],b=polygon[(i+1)%4],cross=(b[0]-a[0])*(p.v-a[1])-(b[1]-a[1])*(p.u-a[0]);if(Math.abs(cross)<1e-5)continue;const next=Math.sign(cross);if(sign&&next!==sign)return false;sign=next;}return true;}
export function matchReferences(scene,references,onProgress=()=>{}){
 const detections=[];
 for(let index=0;index<references.length;index++){
  const reference=references[index];validateFeatures(reference.features);
  let candidates=pairs(reference.features,scene);
  for(let instance=0;instance<8;instance++){
   const found=locate(candidates,reference.features,scene);if(!found)break;
   detections.push({...found,referenceId:reference.id,referenceIndex:index});candidates=candidates.filter(p=>!inside(p,found.polygon));
  }
  onProgress(index+1,references.length);
 }
 detections.sort((a,b)=>b.matches-a.matches);
 const label=ref=>[ref.name||ref.id,ref.brand||'',ref.unit||''].map(v=>v.trim().toLocaleLowerCase('pt-PT')).join('|');
 const sameIdentity=(a,b)=>a.productId&&b.productId?a.productId===b.productId:label(a)===label(b);
 const accepted=[];
 for(const detection of detections){
  const overlapping=accepted.find(other=>overlap(detection,other)>.35);
  if(!overlapping){accepted.push(detection);continue;}
  if(!sameIdentity(references[overlapping.referenceIndex],references[detection.referenceIndex])&&detection.matches>=overlapping.matches*.85)overlapping.ambiguous=true;
 }
 return accepted.filter(detection=>!detection.ambiguous);
}
