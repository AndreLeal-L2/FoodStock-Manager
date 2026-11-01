import { LocalStore } from './store.mjs';
import { statistics, quantity } from './model.mjs';
const $ = s => document.querySelector(s);
const currency = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const number = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 3 });
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const money = value => currency.format(value);
const date = value => new Intl.DateTimeFormat('pt-PT').format(new Date(`${value}T12:00:00`));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
let apiUrl = localStorage.getItem('foodstock-api') || 'http://localhost:8080';
let state = { products: [], purchases: [], stats: null, shopping: { templateImported: false, items: [] } };
let localStore;
let localView;
let renderSequence=0;
let lastRendered='';
function notify(text, success = false) { $('#message').hidden=false;$('#message').textContent=text;$('#message').className=success?'success':''; }
function table(headers, rows, empty) { return rows.length ? `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td data-label="${esc(headers[i])}" class="${['Data','Mês','Gasto','Variação mensal','Disponível','Mínimo','Quantidade','Total','Preço / unidade','Último preço','Variação','Melhor compra registada'].includes(headers[i])&&/\d/.test(String(c))?'measured':''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="empty">${empty}</p>`; }
function percent(value) { return value==null?'Sem base de comparação':`${value>0?'+':''}${number.format(value)}%`; }
async function reloadLocal(force=false) {
 const seq=++renderSequence;
 try {
  const view=await localStore.view();if(seq!==renderSequence)return;
  localView=view;
  const serial=JSON.stringify(view.data)+$('#year').value;
  if(force||serial!==lastRendered) {
   lastRendered=serial;
   state={products:view.data.products,purchases:view.data.purchases,shopping:view.data.shoppingList,stats:statistics(view.data,Number($('#year').value))};
   render();
  }
  const pending=view.profile.pending.length;
  const blocked=view.profile.pending.find(op=>op.error);
  $('#connection').textContent=view.syncing?'A sincronizar. Guardado no navegador.':view.connected?(pending?`API ligada. ${pending} por enviar.`:'Tudo sincronizado.'):(pending?`Guardado aqui. ${pending} por enviar.`:'Guardado no navegador.');
  $('#sync-summary').textContent=blocked?'Uma alteração precisa da tua atenção.':pending?`${pending} alteração(ões) aguardam envio automático.`:'Não há alterações locais pendentes.';
  $('#sync-error').textContent=blocked?.error||view.warnings[0]?.message||view.profile.lastError||'';
  $('#sync-last').innerHTML=view.profile.lastSynced?`Última ligação: <time class="measured">${esc(new Date(view.profile.lastSynced).toLocaleString('pt-PT'))}</time>.`:'Ainda não houve ligação à API. Podes começar a registar dados.';
  $('#sync-pending').innerHTML=view.profile.pending.map(op=>`<li><div><strong>${esc(operationLabel(op))}</strong><p class="muted">${esc(op.error||'Guardada, à espera de envio.')}</p></div>${op.error||view.warnings.some(w=>w.id===op.operationId)?`<button class="secondary" type="button" data-discard="${esc(op.operationId)}">Descartar</button>`:''}</li>`).join('');
  $('#refresh').disabled=false;
 } catch(error) { notify('Não foi possível ler ou guardar dados neste navegador. '+error.message); }
}
function operationLabel(op) {
 return ({PRODUCT_CREATE:'Alimento: '+(op.data.name||''),PURCHASE_CREATE:'Compra: '+(op.data.store||''),CONSUME:'Saída de estoque',SHOPPING_IMPORT:'Carregar lista de compras',SHOPPING_CHECK:'Marcação da lista',SHOPPING_DETAILS:'Quantidade e notas da lista'})[op.kind]||'Alteração pendente';
}
async function refresh() { await localStore.sync();await reloadLocal(); }
async function save(kind,entityId,data) { await localStore.enqueue(kind,entityId,data);await reloadLocal(); }
function render() {
  const {products,purchases,stats:s}=state;
  const low=products.filter(p=>p.stock<=p.minimumStock);
  $('#metrics').innerHTML=`<article class="metric"><p>Total de ${s.year}</p><strong>${money(s.total)}</strong><small>${esc(percent(s.yearChangePercent))} face a ${s.year-1} (totais registados)</small></article><article class="metric"><p>Alimentos na despensa</p><strong>${products.length}</strong><small>Produtos acompanhados, incluindo estoque zero</small></article><article class="metric"><p>Precisa de reposição</p><strong>${low.length}</strong><small>No mínimo definido ou abaixo</small></article>`;
  const max=Math.max(...s.months.map(m=>m.total),1);
  $('#chart').innerHTML=s.months.map(m=>`<div class="bar-column" title="${esc(m.month)}: ${money(m.total)}"><div class="bar" style="height:${Math.max(0,m.total/max*85)}%"></div><span>${new Date(m.month+'-15T12:00:00').toLocaleDateString('pt-PT',{month:'short'})}</span></div>`).join('')+(s.total===0?'<p class="chart-empty">Ainda não há compras neste ano.</p>':'');
  $('#monthly-table').innerHTML=table(['Mês','Gasto','Variação mensal'],s.months.map(m=>[esc(m.month),money(m.total),esc(percent(m.previousMonthChangePercent))]),'');
  $('#low-stock').innerHTML=low.length?low.map(p=>`<div class="stock-row"><div>${esc(p.name)}<small>Mínimo: ${number.format(p.minimumStock)} ${esc(p.unit)}</small></div><span class="badge warning">${number.format(p.stock)} ${esc(p.unit)}</span></div>`).join(''):'<p class="empty">Tudo em dia. Adiciona alimentos e define o mínimo desejado para acompanhar a reposição.</p>';
  $('#stores').innerHTML=Object.entries(s.stores).map(([store,total])=>`<div class="stock-row"><span>${esc(store)}</span><strong>${money(total)}</strong></div>`).join('')||'<p class="empty">Ainda não há compras neste ano.</p>';
  document.querySelectorAll('.product-options').forEach(select=>{ const value=select.value;select.innerHTML='<option value="">Escolher alimento…</option>'+products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.unit)})</option>`).join('');select.value=value; });
  $('#store-options').innerHTML=[...new Set(purchases.map(p=>p.store))].map(s=>`<option value="${esc(s)}"></option>`).join('');
  renderInventory();
  renderShopping();
  $('#history').innerHTML=table(['Data','Alimento','Quantidade','Total','Preço / unidade','Loja'],purchases.map(p=>[date(p.purchasedOn),esc(p.productName),`${number.format(p.quantity)} ${esc(p.unit)}`,money(p.total),`${money(p.total/p.quantity)} / ${esc(p.unit)}`,esc(p.store)]),'A primeira compra é o início do teu histórico. Regista-a acima.');
  $('#price-list').innerHTML=table(['Alimento','Último preço','Variação','Melhor compra registada'],s.prices.map(p=>[`${esc(p.name)}<br><small>${p.purchaseCount} compra(s)</small>`,`${money(p.latestUnitPrice)} / ${esc(p.unit)}<br><small>${esc(p.latestStore)}<br><time class="measured">${date(p.latestDate)}</time></small>`,`<span class="${p.changePercent<0?'negative':p.changePercent>0?'positive':''}">${esc(percent(p.changePercent))}</span>`,`${money(p.cheapestUnitPrice)} / ${esc(p.unit)}<br><small>${esc(p.cheapestStore)}<br><time class="measured">${date(p.cheapestDate)}</time></small>`]),'Regista compras para descobrir o preço por unidade e as melhores oportunidades.');
}
function renderInventory() {
  const term=$('#search').value.toLocaleLowerCase('pt-PT');
  $('#inventory').innerHTML=table(['Alimento','Disponível','Mínimo','Estado'],state.products.filter(p=>p.name.toLocaleLowerCase('pt-PT').includes(term)).map(p=>[esc(p.name),`${number.format(p.stock)} ${esc(p.unit)}`,`${number.format(p.minimumStock)} ${esc(p.unit)}`,`<span class="badge ${p.stock<=p.minimumStock?'warning':''}">${p.stock<=p.minimumStock?'Repor':'Em dia'}</span>`]),'Nenhum alimento encontrado. Adiciona o primeiro produto abaixo.');
}
function renderShopping() {
  const focused=document.activeElement;
  const drafts=[...document.querySelectorAll('.shopping-edit[open] form:not([data-saved])')].map(form=>({id:form.dataset.shoppingForm,index:form.dataset.shoppingIndex,data:Object.fromEntries(new FormData(form)),focus:form.contains(focused)?{name:focused.name,start:focused.selectionStart,end:focused.selectionEnd}:null}));
  const {items,templateImported}=state.shopping;
  $('#import-shopping').hidden=templateImported;
  const checked=items.filter(item=>item.checked).length;
  $('#shopping-status').textContent=items.length ? `${items.length-checked} por colocar no carrinho. ${checked} de ${items.length} no carrinho.` : '';
  if(!items.length) {
    $('#shopping-items').innerHTML='<p class="empty">Carrega a lista que enviaste para começar. Os itens sem quantidade vão continuar por definir.</p>';
    return;
  }
  const groups=new Map();
  items.forEach(item=>{if(!groups.has(item.category))groups.set(item.category,[]);groups.get(item.category).push(item);});
  $('#shopping-items').innerHTML=[...groups].map(([category,entries])=>`<section class="shopping-category"><h2>${esc(category)}</h2>${entries[0].categoryNote?`<p class="muted">${esc(entries[0].categoryNote)}</p>`:''}<ul class="shopping-list">${entries.map(item=>`<li class="shopping-item ${item.checked?'is-checked':''}">
    <div class="shopping-line"><label class="shopping-check"><input type="checkbox" data-shopping-id="${esc(item.id)}" aria-label="${esc(item.name)} no carrinho" ${item.checked?'checked':''}><span class="shopping-name">${esc(item.name)}</span></label><span class="shopping-quantity ${/\d/.test(item.quantityText)?'measured':''}">${esc(item.quantityText||'Por definir')}</span></div>
    ${item.notes?`<p class="shopping-notes">${esc(item.notes)}</p>`:''}
    <details class="shopping-edit"><summary>Editar</summary><form data-shopping-form="${esc(item.id)}" data-shopping-index="${esc(item.templateIndex)}"><label>Quantidade planeada<input name="quantityText" maxlength="120" value="${esc(item.quantityText)}" placeholder="Por definir"></label><label>Notas<input name="notes" maxlength="250" value="${esc(item.notes)}"></label><p class="hint">Podes manter intervalos e embalagens, como “12 ou 24” ou “1 saco”.</p><button type="submit" class="secondary">Guardar alterações</button></form></details>
    </li>`).join('')}</ul></section>`).join('');
  for(const draft of drafts){const form=[...document.querySelectorAll('form[data-shopping-form]')].find(f=>draft.index!=null?f.dataset.shoppingIndex===draft.index:f.dataset.shoppingForm===draft.id);if(form){form.closest('details').open=true;for(const [name,value] of Object.entries(draft.data))form.elements[name].value=value;if(draft.focus?.name){const field=form.elements[draft.focus.name];field?.focus({preventScroll:true});if(field?.setSelectionRange&&draft.focus.start!=null)field.setSelectionRange(draft.focus.start,draft.focus.end);}}}
}
$('#import-shopping').addEventListener('click',async()=>{
 const button=$('#import-shopping');button.disabled=true;
 try {await save('SHOPPING_IMPORT',null,{});}catch(error){notify(error.message);}finally{button.disabled=false;}
});
$('#shopping-items').addEventListener('change',async event=>{
 const checkbox=event.target.closest('input[data-shopping-id]');if(!checkbox)return;
 const item=state.shopping.items.find(item=>item.id===checkbox.dataset.shoppingId);const selected=checkbox.checked;
 try {await save('SHOPPING_CHECK',item.id,{checked:selected,templateIndex:item.templateIndex});}
 catch(error){checkbox.checked=item.checked;notify(error.message);}
});
$('#shopping-items').addEventListener('submit',async event=>{
 const form=event.target.closest('form[data-shopping-form]');if(!form)return;
 event.preventDefault();if(form.dataset.busy)return;
 form.dataset.busy='true';const button=form.querySelector('button');button.disabled=true;
 const data=Object.fromEntries(new FormData(form)),item=state.shopping.items.find(item=>item.id===form.dataset.shoppingForm);
 try {form.dataset.saved='true';await save('SHOPPING_DETAILS',item.id,{...data,expectedQuantityText:item.quantityText,expectedNotes:item.notes,templateIndex:item.templateIndex});}
 catch(error){delete form.dataset.saved;notify(error.message);}
 finally{delete form.dataset.busy;button.disabled=false;}
});
function bindForm(id, handler) {
  const form=$(id);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(form.dataset.busy) return;
    form.dataset.busy='true';const button=form.querySelector('button');button.disabled=true;
    try { await handler(Object.fromEntries(new FormData(form))); }
    catch(error) { notify(error.message); }
    finally { delete form.dataset.busy;button.disabled=false; }
  });
}
bindForm('#product-form',async data=>{
 await save('PRODUCT_CREATE',crypto.randomUUID(),{...data,name:data.name.trim(),initialStock:Number(data.initialStock),minimumStock:Number(data.minimumStock)});
 $('#product-form').reset();notify('Alimento guardado neste navegador.',true);
});
bindForm('#purchase-form',async data=>{
 await save('PURCHASE_CREATE',crypto.randomUUID(),{...data,store:data.store.trim(),quantity:Number(data.quantity),total:Number(data.total)});
 $('#purchase-form').reset();$('#purchase-form [name=purchasedOn]').value=today();notify('Compra guardada neste navegador.',true);
});
bindForm('#consume-form',async data=>{
 const product=state.products.find(p=>p.id===data.productId);
 if(!product||quantity(data.quantity)>quantity(product.stock))throw Error('Quantidade superior ao estoque disponível.');
 await save('CONSUME',data.productId,{quantity:Number(data.quantity),reason:data.reason});$('#consume-form').reset();notify('Saída guardada neste navegador.',true);
});
bindForm('#settings-form',async()=>{
 const url=new URL($('#api-url').value);
 const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if((url.protocol!=='https:'&&!(loopback&&url.protocol==='http:'))||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Usa HTTPS para um endereço acessível ao telemóvel, ou HTTP com localhost no próprio computador.');
 apiUrl=url.origin;localStorage.setItem('foodstock-api',apiUrl);localStore?.close();startStore();
 notify('Endereço guardado. Os teus dados locais foram mantidos.',true);await reloadLocal(true);await refresh();
});
$('#export').addEventListener('click',async()=>{
 try {const data=await localStore.backup();const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`foodstock-${today()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 catch(error){notify(error.message);}
});
$('#sync-retry').addEventListener('click',()=>localStore.retry().catch(error=>notify(error.message)));
$('#sync-pending').addEventListener('click',async event=>{
 const button=event.target.closest('button[data-discard]');if(!button)return;
 if(confirm('Descartar apenas esta alteração local? O registo não será enviado. Alterações posteriores que dependam dele podem precisar de ser resolvidas. Exporta uma cópia se quiseres guardar o conteúdo.'))await localStore.discard(button.dataset.discard);
});
function startStore(){localStore=new LocalStore(apiUrl);localStore.addEventListener('change',()=>reloadLocal());}
function navigate() {
  if ($('#message').classList.contains('success')) $('#message').hidden = true;
  const ids=['overview','stock','shopping','purchases','prices','settings'];
  const id=ids.includes(location.hash.slice(1))?location.hash.slice(1):'overview';
  document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==id);
  document.querySelectorAll('nav a').forEach(a=>{ const active=a.hash===`#${id}`;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current'); });
  $('#page-title').textContent=document.querySelector(`nav a[href="#${id}"]`).dataset.title;
  requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'}));
}
$('#refresh').addEventListener('click',()=>{ $('#message').hidden=true;refresh(); });
$('#year').value=new Date().getFullYear();
$('#year').addEventListener('change',()=>{if($('#year').checkValidity())reloadLocal(true);});
$('#search').addEventListener('input',renderInventory);
$('#api-url').value=apiUrl;
$('#purchase-form [name=purchasedOn]').value=today();$('#purchase-form [name=purchasedOn]').max=today();
window.addEventListener('hashchange',navigate);navigate();startStore();await reloadLocal(true);refresh().catch(error=>notify(error.message));
setInterval(()=>{if(!document.hidden)refresh().catch(()=>{});},15000);
window.addEventListener('online',()=>refresh().catch(()=>{}));
window.addEventListener('focus',()=>refresh().catch(()=>{}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh().catch(()=>{});});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{ $('#offline-cache-note').textContent='Os dados ficam guardados, mas este navegador não conseguiu preparar a interface para abrir sem Internet.'; });

// The existing sidebar becomes a native disclosure on smaller screens.
const compactNavigation = matchMedia('(max-width: 60rem)');
const navigation = document.querySelector('.navigation');
function fitNavigation() { navigation.open=true; }
compactNavigation.addEventListener('change', fitNavigation);

fitNavigation();
window.addEventListener('load',()=>requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'})),{once:true});
