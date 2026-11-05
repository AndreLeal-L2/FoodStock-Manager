import {VisionModelClient,readImage} from './vision-client.mjs?v=20261104.1';
import {photoDraft,captureData,categories} from './vision-model.mjs?v=20261104.1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class Vision {
 constructor(getStore,notify,reload){
  Object.assign(this,{getStore,notify,reload,draft:null,busy:false,writes:Promise.resolve(),scope:null});
  this.model=new VisionModelClient();
  document.querySelector('#photo-clear-model').addEventListener('click',()=>this.clearModel().catch(e=>notify(e.message)));
  document.querySelector('#photo-manual').addEventListener('click',()=>this.manual().catch(e=>notify(e.message)));
  document.querySelector('#photo-cancel').addEventListener('click',()=>this.abort?.abort());
  this.panel=document.querySelector('#photo-review');this.preview=document.querySelector('#photo-preview');
  for(const input of document.querySelectorAll('[data-photo-input]'))input.addEventListener('change',()=>this.choose(input.files?.[0]).catch(e=>notify(e.message)).finally(()=>{input.value='';}));
  document.querySelector('#photo-analyze').addEventListener('click',()=>this.analyze().catch(e=>notify(e.message)));
  this.panel.addEventListener('input',()=>{if(this.busy||!this.draft)return;this.collect();clearTimeout(this.timer);this.timer=setTimeout(()=>this.persist().catch(e=>notify(e.message)),250);});
  this.panel.addEventListener('change',e=>{if(this.busy||!this.draft)return;if(e.target.name==='productId')this.target(e.target);this.persist().catch(e=>notify(e.message));});
  this.panel.addEventListener('focusout',()=>{if(this.draft&&!this.busy)this.persist().catch(e=>notify(e.message));});
  this.panel.addEventListener('submit',e=>{e.preventDefault();this.submit().catch(e=>notify(e.message));});
  this.panel.addEventListener('click',e=>{
   if(this.busy)return;
   if(e.target.closest('[data-photo-add]')){this.collect();this.draft.items.push(photoDraft([{name:'Novo alimento',category:'Outros',unit:null,quantity:null,visibleCount:null,brand:'',notes:''}],[]).items[0]);this.render();this.persist().catch(e=>notify(e.message));}
   const remove=e.target.closest('[data-photo-remove]');if(remove){this.collect();this.draft.items.splice(Number(remove.dataset.photoRemove),1);this.render();this.persist().catch(e=>notify(e.message));}
   if(e.target.closest('[data-photo-cancel]'))this.cancel().catch(e=>notify(e.message));
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.draft&&!this.busy)this.persist().catch(()=>{});});
 }
 update(view){
  this.view=view;
  if(this.scope!==view.profile.key){this.model.dispose();this.reset();this.scope=view.profile.key;}
  if(!this.draft&&view.profile.photoDraft){this.draft=structuredClone(view.profile.photoDraft);this.render();}
  document.querySelector('#photo-requirements').textContent='Escolhe a foto e identifica os alimentos com IA local, sem cadastrar referências. Confirma sempre os resultados antes de guardar.';
 }
 reset(){this.generation=(this.generation||0)+1;clearTimeout(this.timer);this.abort?.abort();this.draft=null;this.image=null;this.busy=false;this.panel.innerHTML='';this.panel.hidden=true;this.preview.getContext('2d').clearRect(0,0,this.preview.width,this.preview.height);this.preview.hidden=true;document.querySelector('#photo-cancel').hidden=true;document.querySelector('#photo-clear-model').disabled=false;document.querySelector('#photo-analyze').disabled=true;document.querySelector('#photo-status').textContent='';}
 async choose(file){
  if(!file||this.busy)return;const store=this.getStore(),generation=(this.generation||0)+1;this.generation=generation;this.image=null;this.preview.hidden=true;const button=document.querySelector('#photo-analyze');button.disabled=true;
  const image=await readImage(file,1280);if(store!==this.getStore()||generation!==this.generation)return;this.image=image;this.preview.width=image.width;this.preview.height=image.height;this.preview.getContext('2d').drawImage(image,0,0);this.preview.hidden=false;button.disabled=false;document.querySelector('#photo-status').textContent='Fotografia preparada. Os píxeis são analisados apenas neste dispositivo.';
 }

 async analyze(){
  if(this.busy||!this.image)return;
  if(this.scope!==this.getStore().key)throw Error('A conta mudou. Escolhe novamente a fotografia.');
  if(this.draft&&!confirm('Substituir o rascunho de reconhecimento atual? O stock ainda não foi alterado.'))return;
  this.busy=true;this.abort=new AbortController();const button=document.querySelector('#photo-analyze'),cancel=document.querySelector('#photo-cancel'),store=this.getStore();button.disabled=true;cancel.hidden=false;document.querySelector('#photo-clear-model').disabled=true;
  document.querySelector('#photo-status').textContent='A preparar o reconhecimento local…';
  try{
   const result=await this.model.recognize(this.image.getContext('2d').getImageData(0,0,this.image.width,this.image.height),{signal:this.abort.signal,onProgress:progress=>{if(store===this.getStore())this.progress(progress);}});if(store!==this.getStore())return;
   const draft=photoDraft(result.items,(await store.view()).data.products);await store.savePhotoDraft(draft);this.draft=draft;this.render();this.drawDetections(result.detections);
   document.querySelector('#photo-status').textContent=draft.items.length?`${draft.items.length} alimento(s) sugerido(s) por IA local. Revê a identificação e as quantidades totais; podem faltar produtos.`:'O modelo não identificou alimentos com segurança. Tenta uma foto mais próxima ou adiciona os itens manualmente.';
   this.panel.scrollIntoView({block:'start',behavior:'instant'});
  }catch(error){if(store!==this.getStore())return;document.querySelector('#photo-status').textContent=error.name==='AbortError'?'Análise cancelada. O stock não foi alterado.':'A análise não foi concluída. O stock não foi alterado.';if(error.name!=='AbortError')throw error;}
  finally{if(store===this.getStore()){this.busy=false;button.disabled=!this.image;cancel.hidden=true;document.querySelector('#photo-clear-model').disabled=false;}}
 }
 drawDetections(detections){
  const ctx=this.preview.getContext('2d'),scale=this.image.width/Math.max(1,this.preview.getBoundingClientRect().width),size=Math.max(14,12*scale);ctx.drawImage(this.image,0,0);ctx.lineWidth=2*scale;ctx.font=`${size}px sans-serif`;
  for(const detection of detections){const points=detection.polygon;ctx.strokeStyle='#76b3ff';ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.stroke();const name=detection.name||'Alimento',width=ctx.measureText(name).width+6*scale,x=Math.max(0,Math.min(this.image.width-width,points[0][0])),y=Math.max(size*1.4,points[0][1]);ctx.fillStyle='#0b111a';ctx.fillRect(x,y-size*1.4,width,size*1.4);ctx.fillStyle='#edf3fb';ctx.fillText(name,x+3*scale,y-size*.2);}
 }

 progress(progress){
  const status=document.querySelector('#photo-status');
  if(progress.stage==='runtime')status.textContent='A iniciar o motor local. Na primeira utilização pode ser necessário descarregar o modelo.';
  else if(progress.stage==='download'){const mb=value=>(value/1048576).toFixed(1);status.textContent=progress.total>0?`A descarregar um ficheiro do modelo: ${mb(progress.loaded)} de ${mb(progress.total)} MB (${Math.round(progress.progress)}%). A foto fica neste dispositivo.`:'A obter os ficheiros do modelo local. A foto fica neste dispositivo.';}
  else if(progress.stage==='fallback')status.textContent='A aceleração gráfica não está disponível para este modelo. A preparar execução local no processador…';
  else if(progress.stage==='inference')status.textContent='A identificar os alimentos neste dispositivo. Podes cancelar; o stock mantém-se até confirmares.';
  else if(progress.stage==='ready')status.textContent='Modelo pronto. A preparar a fotografia…';
 }
 async clearModel(){if(this.busy)return;if(!confirm('Libertar o espaço do modelo neste navegador? Os teus alimentos e compras ficam guardados. O próximo reconhecimento precisará de descarregar o modelo novamente.'))return;await this.model.clearModel();this.notify('Ficheiros do modelo removidos. O stock e as compras foram preservados.',true);}
 async manual(){if(this.busy)return;if(this.draft&&!confirm('Substituir esta revisão por um registo manual? O stock ainda não foi alterado.'))return;const store=this.getStore(),draft=photoDraft([{name:'Novo alimento',category:'Outros',unit:null,quantity:null,brand:'',visibleCount:null,notes:''}],[]);await store.savePhotoDraft(draft);if(store!==this.getStore())return;this.draft=draft;this.render();this.panel.scrollIntoView({block:'start',behavior:'instant'});}


 render(){
  if(!this.draft)return;
  const products=this.view.data.products;
  this.panel.hidden=false;this.panel.innerHTML=`<h3>Rever os alimentos</h3><p class="hint">Uma foto não revela tudo. Confirma a quantidade total de cada alimento que tens em casa. Para um alimento existente, esta contagem substitui o stock anterior; não é uma compra e não cria gastos.</p>
   <form id="photo-review-form">${this.draft.items.map((line,index)=>`<fieldset class="checkout-line" data-photo-line="${index}"><legend>Alimento ${index+1}</legend>
    ${line.visibleCount?`<p class="hint">Embalagens sugeridas pelo modelo: ${esc(line.visibleCount)}. Confirma o peso ou volume se usares kg ou L.</p>`:''}${line.notes?`<p class="hint">${esc(line.notes)}</p>`:''}
    <label>Alimento na despensa<select name="productId"><option value="">Criar novo alimento</option>${products.map(p=>`<option value="${esc(p.id)}" ${p.id===line.productId?'selected':''}>${esc(p.name)} (${esc(p.unit)})</option>`).join('')}</select></label>
    <label>Nome<input name="name" maxlength="120" required value="${esc(line.name)}" ${line.productId?'disabled':''}></label>
    <div class="form-row"><label>Categoria<select name="category">${categories.map(c=>`<option ${line.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label>Marca (opcional)<input name="brand" maxlength="120" value="${esc(line.brand)}"></label></div>
    <div class="form-row"><label>Unidade<select name="unit" required ${line.productId?'disabled':''}><option value="">Escolher unidade</option>${['kg','L','un'].map(unit=>`<option ${line.unit===unit?'selected':''}>${unit}</option>`).join('')}</select></label><label>Quantidade total em casa<input name="quantity" type="number" min="0" max="999999999" step="0.001" required value="${esc(line.quantity)}"></label></div>
    <p class="hint" data-old-stock>${line.productId?`Stock anterior: ${esc(line.expectedStock)} ${esc(line.unit)}. Esta contagem substitui esse valor.`:'Novo alimento, sem preço de compra associado.'}</p><button type="button" class="secondary" data-photo-remove="${index}">Remover este item</button></fieldset>`).join('')}
    <div class="checkout-actions"><button type="button" class="secondary" data-photo-add>Adicionar item em falta</button><button type="button" class="secondary" data-photo-cancel>Cancelar revisão</button></div>
    <label class="review-confirmation"><input name="reviewed" type="checkbox" required>Revi os alimentos, as unidades e as quantidades totais. Quero atualizar o stock com estes valores.</label><button type="submit" ${!this.draft.items.length?'disabled':''}>Guardar contagem no stock</button></form>`;
 }
 target(select){
  const row=select.closest('[data-photo-line]'),line=this.draft.items[Number(row.dataset.photoLine)],p=this.view.data.products.find(p=>p.id===select.value);
  line.expectedStock=p?.stock??null;row.querySelector('[name=name]').disabled=Boolean(p);row.querySelector('[name=unit]').disabled=Boolean(p);row.querySelector('[name=quantity]').value='';
  if(p){row.querySelector('[name=name]').value=p.name;row.querySelector('[name=unit]').value=p.unit;row.querySelector('[name=category]').value=p.category||'Outros';row.querySelector('[name=brand]').value=p.brand||'';}
  row.querySelector('[data-old-stock]').textContent=p?`Stock anterior: ${p.stock} ${p.unit}. Esta contagem substitui esse valor.`:'Novo alimento, sem preço de compra associado.';
 }
 collect(){if(!this.draft)return;for(const row of this.panel.querySelectorAll('[data-photo-line]')){const line=this.draft.items[Number(row.dataset.photoLine)];for(const name of ['productId','name','category','brand','unit','quantity'])line[name]=row.querySelector(`[name=${name}]`).value;}}
 persist(){clearTimeout(this.timer);if(!this.draft||this.busy)return this.writes;this.collect();const copy=structuredClone(this.draft),store=this.getStore();this.writes=this.writes.catch(()=>{}).then(()=>store.savePhotoDraft(copy));return this.writes;}
 async cancel(){if(!this.draft||this.busy)return;const store=this.getStore(),id=this.draft.id;if(!confirm('Cancelar esta revisão? O stock não será alterado.'))return;clearTimeout(this.timer);await this.writes.catch(()=>{});await store.clearPhotoDraft(id);if(store!==this.getStore())return;this.reset();}

 async submit(){
  if(this.busy)return;if(this.scope!==this.getStore().key)throw Error('A conta mudou. Abre novamente a revisão.');const form=this.panel.querySelector('form');if(!form.reportValidity())return;
  this.collect();if(!this.draft.items.length)throw Error('Adiciona pelo menos um alimento.');
  this.busy=true;clearTimeout(this.timer);const draft=structuredClone(this.draft),store=this.getStore(),button=form.querySelector('[type=submit]');button.disabled=true;
  try{await this.writes;await store.savePhotoDraft(draft);await store.enqueue('INVENTORY_CAPTURE',draft.id,captureData(draft));if(store!==this.getStore())return;this.reset();await this.reload();this.notify('Contagem guardada. O stock foi atualizado, sem alterar os gastos.',true);}
  finally{button.disabled=false;if(store===this.getStore())this.busy=false;}
 }
}
