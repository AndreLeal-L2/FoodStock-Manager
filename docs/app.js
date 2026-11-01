'use strict';
const $ = s => document.querySelector(s);
const currency = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const number = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 3 });
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const money = value => currency.format(value);
const date = value => new Intl.DateTimeFormat('pt-PT').format(new Date(`${value}T12:00:00`));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
let apiUrl = localStorage.getItem('foodstock-api') || 'http://localhost:8080';
let state = { products: [], purchases: [], stats: null };
let refreshing = false;
function notify(text, success = false) { $('#message').hidden = false; $('#message').textContent = text; $('#message').className = success ? 'success' : ''; }
function table(headers, rows, empty) { return rows.length ? `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td data-label="${esc(headers[i])}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="empty">${empty}</p>`; }
function percent(value) { return value == null ? 'Sem base de comparação' : `${value > 0 ? '+' : ''}${number.format(value)}%`; }
async function api(path, method = 'GET', body) {
  const response = await fetch(apiUrl + '/api' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000), credentials: 'omit' });
  if (!response.ok) { let error; try { error = await response.json(); } catch { /* generic message below */ } throw new Error(error?.message || `O pedido falhou (${response.status}).`); }
  return response.status === 204 ? null : response.json();
}
async function refresh() {
  if (refreshing) return;
  refreshing = true; $('#refresh').disabled = true;
  $('#connection').textContent = 'A atualizar dados…';
  try {
    const [products,purchases,stats] = await Promise.all([api('/products'),api('/purchases'),api(`/stats?year=${$('#year').value}`)]);
    state={products,purchases,stats};render();
    $('#connection').textContent=`API ligada a ${apiUrl}. Atualizado às ${new Date().toLocaleTimeString('pt-PT')}.`;
  } catch(error) {
    $('#connection').textContent='API indisponível. Os dados apresentados podem estar desatualizados.';
    notify(`Não foi possível atualizar. ${error.message} Confirma que a API está iniciada e que o navegador permite o acesso a localhost. Configura a ligação em “Ligação e dados”.`);
  } finally { refreshing=false;$('#refresh').disabled=false; }
}
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
  $('#history').innerHTML=table(['Data','Alimento','Quantidade','Total','Preço / unidade','Loja'],purchases.map(p=>[date(p.purchasedOn),esc(p.productName),`${number.format(p.quantity)} ${esc(p.unit)}`,money(p.total),`${money(p.total/p.quantity)} / ${esc(p.unit)}`,esc(p.store)]),'A primeira compra é o início do teu histórico. Regista-a acima.');
  $('#price-list').innerHTML=table(['Alimento','Último preço','Variação','Melhor compra registada'],s.prices.map(p=>[`${esc(p.name)}<br><small>${p.purchaseCount} compra(s)</small>`,`${money(p.latestUnitPrice)} / ${esc(p.unit)}<br><small>${esc(p.latestStore)}<br>${date(p.latestDate)}</small>`,`<span class="${p.changePercent<0?'negative':p.changePercent>0?'positive':''}">${esc(percent(p.changePercent))}</span>`,`${money(p.cheapestUnitPrice)} / ${esc(p.unit)}<br><small>${esc(p.cheapestStore)}<br>${date(p.cheapestDate)}</small>`]),'Regista compras para descobrir o preço por unidade e as melhores oportunidades.');
}
function renderInventory() {
  const term=$('#search').value.toLocaleLowerCase('pt-PT');
  $('#inventory').innerHTML=table(['Alimento','Disponível','Mínimo','Estado'],state.products.filter(p=>p.name.toLocaleLowerCase('pt-PT').includes(term)).map(p=>[esc(p.name),`${number.format(p.stock)} ${esc(p.unit)}`,`${number.format(p.minimumStock)} ${esc(p.unit)}`,`<span class="badge ${p.stock<=p.minimumStock?'warning':''}">${p.stock<=p.minimumStock?'Repor':'Em dia'}</span>`]),'Nenhum alimento encontrado. Adiciona o primeiro produto abaixo.');
}
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
bindForm('#product-form',async data=>{ await api('/products','POST',{...data,initialStock:Number(data.initialStock),minimumStock:Number(data.minimumStock)});$('#product-form').reset();notify('Alimento adicionado.',true);await refresh(); });
bindForm('#purchase-form',async data=>{ await api('/purchases','POST',{...data,quantity:Number(data.quantity),total:Number(data.total)});$('#purchase-form').reset();$('#purchase-form [name=purchasedOn]').value=today();notify('Compra guardada e estoque atualizado.',true);await refresh(); });
bindForm('#consume-form',async data=>{ await api(`/products/${encodeURIComponent(data.productId)}/consume`,'POST',{quantity:Number(data.quantity),reason:data.reason});$('#consume-form').reset();notify('Saída de estoque registada.',true);await refresh(); });
bindForm('#settings-form',async()=>{
  const url=new URL($('#api-url').value);
  if(!['localhost','127.0.0.1'].includes(url.hostname)||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash) throw new Error('Usa apenas um endereço local, por exemplo http://localhost:8080.');
  apiUrl=url.origin;localStorage.setItem('foodstock-api',apiUrl);notify('Endereço guardado.',true);await refresh();
});
$('#export').addEventListener('click',async()=>{
  try { const data=await api('/export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`foodstock-${today()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
  catch(error) { notify(error.message); }
});
function navigate() {
  if ($('#message').classList.contains('success')) $('#message').hidden = true;
  const ids=['overview','stock','purchases','prices','settings'];
  const id=ids.includes(location.hash.slice(1))?location.hash.slice(1):'overview';
  document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==id);
  document.querySelectorAll('nav a').forEach(a=>{ const active=a.hash===`#${id}`;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current'); });
  $('#page-title').textContent=document.querySelector(`nav a[href="#${id}"] span`).textContent;
}
$('#refresh').addEventListener('click',()=>{ $('#message').hidden=true;refresh(); });
$('#year').value=new Date().getFullYear();
$('#year').addEventListener('change',()=>{ if($('#year').checkValidity())refresh(); });
$('#search').addEventListener('input',renderInventory);
$('#api-url').value=apiUrl;
$('#purchase-form [name=purchasedOn]').value=today();$('#purchase-form [name=purchasedOn]').max=today();
window.addEventListener('hashchange',navigate);navigate();refresh();

// The existing sidebar becomes a native disclosure on smaller screens.
const compactNavigation = matchMedia('(max-width: 60rem)');
const navigation = document.querySelector('.navigation');
function fitNavigation() { navigation.open = !compactNavigation.matches; }
compactNavigation.addEventListener('change', fitNavigation);
document.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => { if (compactNavigation.matches) navigation.open = false; }));
fitNavigation();
