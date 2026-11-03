import {runVision,readImage,thumbnail} from './vision-client.mjs?v=20261103.2';
import {ALGORITHM,MAX_REFERENCES} from './vision-engine.mjs?v=20261103.2';
import {CATALOG_SCHEMA,exportCatalog,validateCatalog} from './vision-catalog.mjs?v=20261103.2';
import {categories} from './vision-model.mjs?v=20261103.2';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class VisualCatalog {
 constructor(getStore,notify,isBusy){
  Object.assign(this,{getStore,notify,isBusy,references:[],source:null,saving:false,scope:null,serial:''});
  this.form=document.querySelector('#reference-form');this.canvas=document.querySelector('#reference-crop');
  this.form.elements.category.innerHTML=categories.map(c=>`<option>${esc(c)}</option>`).join('');this.form.elements.category.value='Outros';
  this.form.elements.image.addEventListener('change',()=>this.choose(this.form.elements.image.files?.[0]).catch(e=>notify(e.message)));
  this.form.elements.productId.addEventListener('change',()=>this.target());
  this.form.addEventListener('submit',e=>{e.preventDefault();this.save().catch(e=>notify(e.message));});
  document.querySelector('#reference-whole').addEventListener('click',()=>{if(this.source){this.rect={x:0,y:0,w:this.source.width,h:this.source.height};this.draw();}});
  this.canvas.addEventListener('pointerdown',e=>{if(!this.source||this.saving)return;this.start=this.position(e);this.canvas.setPointerCapture(e.pointerId);});
  this.canvas.addEventListener('pointermove',e=>{if(!this.start)return;const p=this.position(e);this.rect={x:Math.min(this.start.x,p.x),y:Math.min(this.start.y,p.y),w:Math.abs(p.x-this.start.x),h:Math.abs(p.y-this.start.y)};this.draw();});
  const end=()=>{this.start=null;};this.canvas.addEventListener('pointerup',end);this.canvas.addEventListener('pointercancel',end);
  document.querySelector('#reference-list').addEventListener('click',e=>{const button=e.target.closest('[data-reference-remove]');if(button&&!this.saving&&!this.isBusy()&&confirm('Apagar esta referência deste navegador? O alimento e o stock não são alterados.'))this.getStore().removeReference(button.dataset.referenceRemove).catch(e=>notify(e.message));});
  document.querySelector('#reference-export').addEventListener('click',()=>this.export());
  document.querySelector('#reference-import').addEventListener('change',e=>this.import(e.target).catch(e=>notify(e.message)));
 }
 update(view){
  this.view=view;
  if(this.scope!==view.profile.key){this.abort?.abort();this.scope=view.profile.key;this.form.reset();this.form.elements.category.value='Outros';this.source=null;this.canvas.width=1;this.canvas.height=1;this.canvas.hidden=true;this.saving=false;this.loading=false;this.form.querySelector('[type=submit]').disabled=false;this.serial='';this.form.elements.name.disabled=false;this.form.elements.unit.disabled=false;}
  this.references=view.profile.visualReferences||[];
  const selected=this.form.elements.productId.value,options=view.data.products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.unit)})</option>`).join('');
  if(options!==this.options){this.options=options;this.form.elements.productId.innerHTML='<option value="">Nova referência, sem criar stock</option>'+options;this.form.elements.productId.value=selected;}
  document.querySelector('#reference-count').textContent=`${this.references.length}/${MAX_REFERENCES}`;
  const serial=JSON.stringify(this.references);if(serial===this.serial)return;this.serial=serial;
  document.querySelector('#reference-list').innerHTML=this.references.map(ref=>`<li><img src="${esc(ref.preview)}" alt="Referência: ${esc(ref.name)}" width="72" height="72"><div><strong>${esc(ref.name)}</strong><p class="hint">${esc(ref.category)}${ref.brand?' · '+esc(ref.brand):''} · ${esc(ref.unit)}</p></div><button type="button" class="secondary" data-reference-remove="${esc(ref.id)}">Apagar referência</button></li>`).join('')||'<li class="hint">Ainda não há referências neste navegador. Cadastra a primeira embalagem para começar.</li>';
 }
 target(){
  const p=this.view.data.products.find(p=>p.id===this.form.elements.productId.value);
  this.form.elements.name.disabled=Boolean(p);this.form.elements.unit.disabled=Boolean(p);
  if(p){this.form.elements.name.value=p.name;this.form.elements.unit.value=p.unit;this.form.elements.category.value=categories.includes(p.category)?p.category:'Outros';this.form.elements.brand.value=p.brand||'';}
 }
 async choose(file){
  if(!file||this.saving)return;const store=this.getStore(),generation=(this.generation||0)+1;this.generation=generation;this.loading=true;this.source=null;this.canvas.hidden=true;const button=this.form.querySelector('[type=submit]');button.disabled=true;document.querySelector('#reference-status').textContent='A preparar a referência…';
  try{const source=await readImage(file,640);if(store!==this.getStore()||generation!==this.generation)return;this.source=source;this.rect={x:0,y:0,w:source.width,h:source.height};this.canvas.width=source.width;this.canvas.height=source.height;this.canvas.hidden=false;this.draw();document.querySelector('#reference-status').textContent='Referência pronta. Seleciona a frente da embalagem ou usa a imagem completa.';}
  finally{if(store===this.getStore()&&generation===this.generation){this.loading=false;button.disabled=false;}}
 }

 position(event){const b=this.canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(this.canvas.width,(event.clientX-b.left)*this.canvas.width/b.width)),y:Math.max(0,Math.min(this.canvas.height,(event.clientY-b.top)*this.canvas.height/b.height))};}
 draw(){
  const ctx=this.canvas.getContext('2d');ctx.drawImage(this.source,0,0);ctx.fillStyle='rgba(0,0,0,.45)';ctx.fillRect(0,0,this.canvas.width,this.canvas.height);const r=this.rect;if(r.w>0&&r.h>0)ctx.drawImage(this.source,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);ctx.strokeStyle='#76b3ff';ctx.lineWidth=2;ctx.strokeRect(r.x,r.y,r.w,r.h);
 }
 async save(){
  if(this.saving||this.loading||this.isBusy())return;if(this.scope!==this.getStore().key)throw Error('A conta mudou. Escolhe novamente a referência.');
  if(!this.form.reportValidity())return;if(!this.source)throw Error('Escolhe uma fotografia de referência.');if(this.references.length>=MAX_REFERENCES)throw Error(`O limite é ${MAX_REFERENCES} referências neste navegador. Apaga uma antes de adicionar outra.`);
  const r=this.rect;if(r.w<64||r.h<64)throw Error('Seleciona uma área de pelo menos 64 × 64 píxeis, com a frente da embalagem.');
  const crop=document.createElement('canvas');crop.width=Math.floor(r.w);crop.height=Math.floor(r.h);crop.getContext('2d').drawImage(this.source,r.x,r.y,r.w,r.h,0,0,crop.width,crop.height);
  const fields=this.form.elements,metadata={id:crypto.randomUUID(),name:fields.name.value.trim(),category:fields.category.value,brand:fields.brand.value.trim(),unit:fields.unit.value,productId:fields.productId.value||null,preview:thumbnail(crop)},store=this.getStore(),button=this.form.querySelector('[type=submit]');
  this.saving=true;this.abort=new AbortController();button.disabled=true;document.querySelector('#reference-status').textContent='A extrair os detalhes visuais da embalagem…';
  try{
   const {features}=await runVision('reference',crop.getContext('2d').getImageData(0,0,crop.width,crop.height),[],{signal:this.abort.signal});if(store!==this.getStore())return;
   if(features.points.length/2<40)throw Error('A referência tem poucos detalhes. Fotografa a frente da embalagem mais perto, com letras ou desenhos nítidos, sem brilho.');
   await store.importReferences({schema:CATALOG_SCHEMA,algorithm:ALGORITHM,references:[{...metadata,features}]});
   this.form.reset();fields.name.disabled=false;fields.unit.disabled=false;fields.category.value='Outros';this.source=null;this.canvas.hidden=true;document.querySelector('#reference-status').textContent='Referência guardada neste navegador. O stock não foi alterado.';
   this.notify('Referência visual guardada. Já podes procurar esta embalagem nas tuas fotografias.',true);
  }finally{button.disabled=false;if(store===this.getStore())this.saving=false;}
 }
 export(){
  try{const url=URL.createObjectURL(new Blob([JSON.stringify(exportCatalog(this.references))],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='foodstock-referencias.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){this.notify(e.message);}
 }
 async import(input){
  try{if(this.saving||this.isBusy())return;const file=input.files?.[0];if(!file)return;if(file.size>8*1024*1024)throw Error('Escolhe um catálogo até 8 MB.');const catalog=JSON.parse(await file.text()),references=validateCatalog(catalog);if(!confirm(`Importar ${references.length} referência(s) para este navegador? Referências com o mesmo identificador serão atualizadas. O stock não será alterado.`))return;await this.getStore().importReferences(catalog);this.notify('Referências importadas neste navegador.',true);}finally{input.value='';}
 }
}
