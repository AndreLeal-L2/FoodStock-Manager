import {photoDraft,captureData,categories} from './vision-model.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function compress(file){
 if(!file.type.startsWith('image/')||file.size>20*1024*1024)throw Error('Escolhe uma imagem até 20 MB.');
 let bitmap;try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{throw Error('Não consegui abrir esta imagem. Exporta-a como JPEG, PNG ou WebP e tenta novamente.');}
 try{
  const ratio=Math.min(1,2048/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const image=canvas.toDataURL('image/jpeg',0.85);if(image.length>3_800_000)throw Error('A imagem continua demasiado grande. Recorta-a ou fotografa menos itens de cada vez.');return image;
 }finally{bitmap.close();}
}
export class Vision {
 constructor(getStore,cloud,notify,reload){
  Object.assign(this,{getStore,cloud,notify,reload,draft:null,busy:false,writes:Promise.resolve(),scope:null});
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
  if(this.scope!==view.profile.key){this.reset();this.scope=view.profile.key;}
  if(!this.draft&&view.profile.photoDraft){this.draft=structuredClone(view.profile.photoDraft);this.render();}
  document.querySelector('#photo-requirements').textContent=this.cloud.user?'Escolhe uma fotografia para analisar online. Os resultados só entram no stock depois da tua revisão.':'Para reconhecer alimentos, configura o Supabase e inicia sessão em Dados. Podes continuar a registar alimentos manualmente.';
 }
 reset(){clearTimeout(this.timer);this.abort?.abort();this.draft=null;this.image=null;this.busy=false;this.panel.innerHTML='';this.panel.hidden=true;this.preview.removeAttribute('src');this.preview.hidden=true;document.querySelector('#photo-analyze').disabled=true;document.querySelector('#photo-status').textContent='';}
 async choose(file){
  if(!file||this.busy)return;
  const store=this.getStore(),image=await compress(file);if(store!==this.getStore())return;this.image=image;this.preview.src=image;this.preview.hidden=false;document.querySelector('#photo-analyze').disabled=false;document.querySelector('#photo-status').textContent='Fotografia preparada. A análise envia esta imagem ao serviço de reconhecimento; não fica guardada no Supabase.';
 }
 async analyze(){
  if(this.busy||!this.image)return;
  if(this.scope!==this.getStore().key)throw Error('A conta mudou. Escolhe novamente a fotografia.');
  if(!this.cloud.user)throw Error('Inicia sessão em Dados para reconhecer os alimentos.');
  if(this.draft&&!confirm('Substituir o rascunho de reconhecimento atual? O stock ainda não foi alterado.'))return;
  this.busy=true;this.abort=new AbortController();const timeout=setTimeout(()=>this.abort.abort(),45000),button=document.querySelector('#photo-analyze'),store=this.getStore();button.disabled=true;
  document.querySelector('#photo-status').textContent='A identificar os alimentos…';
  try{
   const reply=await this.cloud.recognize(this.image,this.abort.signal);if(store!==this.getStore())return;
   const draft=photoDraft(reply.items,(await store.view()).data.products);await store.savePhotoDraft(draft);this.draft=draft;this.render();
   document.querySelector('#photo-status').textContent=draft.items.length?`${draft.items.length} alimento(s) sugerido(s). Revê cada nome e a quantidade total que tens em casa.`:'Não foram identificados alimentos. Podes adicionar linhas manualmente ou tentar outra fotografia.';
   this.panel.scrollIntoView({block:'start',behavior:'instant'});
  }catch(error){document.querySelector('#photo-status').textContent='A análise não foi concluída. Nenhum stock foi alterado.';throw error;}
  finally{clearTimeout(timeout);this.busy=false;button.disabled=!this.image;}
 }
 render(){
  if(!this.draft)return;
  const products=this.view.data.products;
  this.panel.hidden=false;this.panel.innerHTML=`<h3>Rever os alimentos</h3><p class="hint">Uma foto não revela tudo. Confirma a quantidade total de cada alimento que tens em casa. Para um alimento existente, esta contagem substitui o stock anterior; não é uma compra e não cria gastos.</p>
   <form id="photo-review-form">${this.draft.items.map((line,index)=>`<fieldset class="checkout-line" data-photo-line="${index}"><legend>Alimento ${index+1}</legend>
    ${line.visibleCount?`<p class="hint">Embalagens/peças visíveis sugeridas: ${esc(line.visibleCount)}. Confirma o peso ou volume se usares kg ou L.</p>`:''}${line.notes?`<p class="hint">${esc(line.notes)}</p>`:''}
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
 async cancel(){if(!confirm('Cancelar esta revisão? O stock não será alterado.'))return;clearTimeout(this.timer);await this.writes.catch(()=>{});await this.getStore().clearPhotoDraft(this.draft.id);this.reset();}
 async submit(){
  if(this.busy)return;if(this.scope!==this.getStore().key)throw Error('A conta mudou. Abre novamente a revisão.');const form=this.panel.querySelector('form');if(!form.reportValidity())return;
  this.collect();if(!this.draft.items.length)throw Error('Adiciona pelo menos um alimento.');
  this.busy=true;clearTimeout(this.timer);const draft=structuredClone(this.draft),store=this.getStore(),button=form.querySelector('[type=submit]');button.disabled=true;
  try{await this.writes;await store.savePhotoDraft(draft);await store.enqueue('INVENTORY_CAPTURE',draft.id,captureData(draft));if(store!==this.getStore())return;this.reset();await this.reload();this.notify('Contagem guardada. O stock foi atualizado, sem alterar os gastos.',true);}
  finally{button.disabled=false;if(store===this.getStore())this.busy=false;}
 }
}
