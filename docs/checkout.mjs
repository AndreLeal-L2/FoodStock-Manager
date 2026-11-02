import {checkoutDraft,cents} from './model.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'});
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export class Checkout {
 constructor(getStore,notify,reload){
  this.getStore=getStore;this.notify=notify;this.reload=reload;this.draft=null;this.visible=null;this.saving=false;this.writes=Promise.resolve();
  this.button=document.querySelector('#checkout-open');this.panel=document.querySelector('#checkout-panel');
  this.button.addEventListener('click',()=>this.open().catch(e=>notify(e.message)));
  this.panel.addEventListener('input',()=>{if(!this.draft||this.saving)return;this.collect();this.total();clearTimeout(this.timer);this.timer=setTimeout(()=>this.persist().catch(e=>notify(e.message)),250);});
  this.panel.addEventListener('change',event=>{
   if(!this.draft||this.saving)return;
   if(event.target.name==='productId')this.targetChanged(event.target);
   this.collect();this.total();this.persist().catch(e=>notify(e.message));
  });
  this.panel.addEventListener('focusout',()=>{if(this.draft&&!this.saving)this.persist().catch(e=>notify(e.message));});
  this.panel.addEventListener('submit',event=>{event.preventDefault();this.submit().catch(e=>notify(e.message));});
  this.panel.addEventListener('click',event=>{
   if(event.target.closest('[data-checkout-later]'))this.later().catch(e=>notify(e.message));
   if(event.target.closest('[data-checkout-cancel]'))this.cancel().catch(e=>notify(e.message));
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.draft&&!this.saving)this.persist().catch(()=>{});});
 }
 update(view){
  if(this.scope!==view.profile.key){clearTimeout(this.timer);this.scope=view.profile.key;this.draft=null;this.visible=null;this.saving=false;this.panel.innerHTML='';}
  this.view=view;
  if(this.visible===null)this.visible=Boolean(view.profile.checkoutDraft);
  if(!this.draft&&view.profile.checkoutDraft){this.draft=structuredClone(view.profile.checkoutDraft);if(this.visible)this.render();}
  const count=view.data.shoppingList.items.filter(item=>item.checked).length;
  this.button.hidden=!view.data.shoppingList.templateImported&&!this.draft;
  this.button.disabled=this.saving||(!count&&!this.draft);
  this.button.textContent=this.draft?'Continuar finalização':'Finalizar compras';
  this.panel.hidden=!this.visible;
 }
 async open(){
  if(this.scope!==this.getStore().key)throw Error('A carregar os dados desta conta. Tenta novamente.');
  if(!this.draft){
   const draft=checkoutDraft(this.view.data,today());if(!draft.items.length)throw Error('Marca primeiro os alimentos que colocaste no carrinho.');
   const store=this.getStore();await store.saveCheckoutDraft(draft);if(store!==this.getStore())return;this.draft=draft;
  }
  this.visible=true;this.render();this.panel.hidden=false;
  this.panel.scrollIntoView({block:'start',behavior:'instant'});this.panel.querySelector('[name=store]').focus({preventScroll:true});
 }
 render(){
  if(!this.draft)return;
  const draft=this.draft,products=this.view.data.products;
  this.panel.innerHTML=`<h2>Finalizar compras</h2><p class="muted">Confirma os valores reais do talão. Nada entra no stock antes de confirmares.</p>
   <form id="checkout-form"><div class="form-row"><label>Loja<input name="store" maxlength="120" required value="${esc(draft.store)}" placeholder="Ex.: Continente"></label><label>Data da compra<input name="purchasedOn" type="date" required max="${today()}" value="${esc(draft.purchasedOn)}"></label></div>
   <div class="checkout-lines">${draft.items.map((line,index)=>`<fieldset class="checkout-line" data-line="${index}"><legend>${esc(line.name)}</legend><p class="hint">Planeado: ${esc(line.planned||'por definir')}. Usa a quantidade real, na unidade do alimento.</p>
    <label>Alimento na despensa<select name="productId"><option value="">Criar novo alimento</option>${products.map(p=>`<option value="${esc(p.id)}" ${p.id===line.productId?'selected':''}>${esc(p.name)} (${esc(p.unit)})</option>`).join('')}</select></label>
    <label data-new-name ${line.productId?'hidden':''}>Nome do novo alimento<input name="name" maxlength="120" ${line.productId?'disabled':'required'} value="${esc(line.name)}"></label>
    <div class="form-row"><label>Unidade<select name="unit" required ${line.productId?'disabled':''}><option value="">Escolher unidade</option>${['kg','L','un'].map(unit=>`<option value="${unit}" ${unit===line.unit?'selected':''}>${unit==='kg'?'Quilogramas (kg)':unit==='L'?'Litros (L)':'Unidades (un)'}</option>`).join('')}</select></label><label>Quantidade comprada<input name="quantity" type="number" min="0.001" max="999999999" step="0.001" required value="${esc(line.quantity)}"></label></div>
    <label>Total pago por este item (€)<input name="total" type="number" min="0.01" max="999999999" step="0.01" required value="${esc(line.total)}"></label>
   </fieldset>`).join('')}</div><div class="checkout-footer"><p>Total a registar <output id="checkout-total" class="measured" aria-live="polite"></output></p><p class="hint">O total é a soma dos valores preenchidos. Os itens confirmados são desmarcados para a próxima compra. Funciona mesmo sem Internet.</p>
   <div class="checkout-actions"><button type="submit">Confirmar compras</button><button type="button" class="secondary" data-checkout-later>Guardar para depois</button><button type="button" class="secondary" data-checkout-cancel>Cancelar finalização</button></div></div></form>`;
  this.total();
 }
 targetChanged(select){
  const row=select.closest('[data-line]'),product=this.view.data.products.find(p=>p.id===select.value),name=row.querySelector('[name=name]'),unit=row.querySelector('[name=unit]');
  row.querySelector('[data-new-name]').hidden=Boolean(product);name.required=!product;name.disabled=Boolean(product);unit.disabled=Boolean(product);
  if(product){if(unit.value&&unit.value!==product.unit)row.querySelector('[name=quantity]').value='';unit.value=product.unit;}
 }
 collect(){
  const form=this.panel.querySelector('form');if(!form||!this.draft)return;
  this.draft.store=form.elements.store.value;this.draft.purchasedOn=form.elements.purchasedOn.value;
  this.panel.querySelectorAll('[data-line]').forEach(row=>{
   const line=this.draft.items[Number(row.dataset.line)];
   for(const field of ['productId','name','unit','quantity','total'])line[field]=row.querySelector(`[name=${field}]`).value;
  });
 }
 total(){const output=this.panel.querySelector('#checkout-total');if(output&&this.draft)output.textContent=money.format(this.draft.items.reduce((sum,line)=>sum+(Number.isFinite(Number(line.total))?cents(line.total):0),0)/100);}
 persist(){
  clearTimeout(this.timer);if(!this.draft||this.saving)return this.writes;
  this.collect();const copy=structuredClone(this.draft),store=this.getStore();
  this.writes=this.writes.catch(()=>{}).then(()=>store.saveCheckoutDraft(copy));return this.writes;
 }
 async later(){if(this.saving)return;const store=this.getStore();await this.persist();if(store!==this.getStore())return;this.visible=false;this.panel.hidden=true;this.button.textContent='Continuar finalização';}
 async cancel(){
  if(this.saving||!this.draft)return;const store=this.getStore(),id=this.draft.id;
  if(!confirm('Cancelar este rascunho? Nenhuma compra será registada. Os itens continuam marcados na lista.'))return;
  clearTimeout(this.timer);await this.writes.catch(()=>{});await store.clearCheckoutDraft(id);if(store!==this.getStore())return;
  this.draft=null;this.visible=false;this.panel.hidden=true;this.panel.innerHTML='';await this.reload();
 }
 async submit(){
  if(this.saving)return;
  if(this.scope!==this.getStore().key)throw Error('A conta mudou. Abre novamente a lista.');
  const form=this.panel.querySelector('form');if(!form.reportValidity())return;
  this.collect();clearTimeout(this.timer);this.saving=true;const draft=structuredClone(this.draft),store=this.getStore();
  const data={store:draft.store.trim(),purchasedOn:draft.purchasedOn,items:draft.items.map(line=>({shoppingId:line.shoppingId,templateIndex:line.templateIndex,
   productId:line.productId||line.newProductId,newProduct:line.productId?null:{name:line.name.trim(),unit:line.unit},
   purchaseId:line.purchaseId,quantity:Number(line.quantity),total:Number(line.total)}))};
  const button=form.querySelector('button[type=submit]');button.disabled=true;
  try {
   await this.writes;await store.saveCheckoutDraft(draft);
   await store.enqueue('CHECKOUT',draft.id,data);if(store!==this.getStore())return;
   this.draft=null;this.visible=false;this.panel.hidden=true;this.panel.innerHTML='';await this.reload();
   this.notify('Compras guardadas. O stock e os gastos foram atualizados; os itens foram desmarcados. A sincronização com o Supabase é automática.',true);
   document.querySelector('#shopping-status').scrollIntoView({block:'center',behavior:'instant'});
  }finally{button.disabled=false;if(store===this.getStore()){this.saving=false;this.update(await store.view());}}
 }
}
