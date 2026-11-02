-- FoodStock: private data per authenticated account; mutations through atomic RPCs only.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.foodstock_spaces (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 instance_id uuid not null unique default gen_random_uuid(),
 template_imported boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.foodstock_products (
 owner_id uuid not null references public.foodstock_spaces(owner_id) on delete cascade,
 id uuid not null,
 name text not null check (length(btrim(name)) between 1 and 120),
 unit text not null check (unit in ('kg','L','un')),
 stock numeric(18,3) not null check (stock>=0),
 minimum_stock numeric(12,3) not null check (minimum_stock>=0),
 category text not null default '' check (length(category)<=80),
 brand text not null default '' check (length(brand)<=120),
 primary key(owner_id,id)
);
create table public.foodstock_purchases (
 owner_id uuid not null,
 id uuid not null,
 product_id uuid not null,
 quantity numeric(12,3) not null check (quantity>0),
 total numeric(11,2) not null check (total>0),
 store text not null check (length(btrim(store)) between 1 and 120),
 purchased_on date not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,id),
 foreign key(owner_id,product_id) references public.foodstock_products(owner_id,id) on delete cascade
);
create table public.foodstock_movements (
 owner_id uuid not null,
 id uuid not null default gen_random_uuid(),
 product_id uuid not null,
 quantity numeric(18,3) not null,
 reason text not null check (length(reason)<=200),
 created_at timestamptz not null default now(),
 primary key(owner_id,id),
 foreign key(owner_id,product_id) references public.foodstock_products(owner_id,id) on delete cascade
);
create table public.foodstock_shopping_items (
 owner_id uuid not null references public.foodstock_spaces(owner_id) on delete cascade,
 id text not null check(length(id) between 1 and 80),
 template_index integer not null check(template_index between 0 and 38),
 name text not null check(length(name) between 1 and 120),
 category text not null check(length(category)<=80),
 category_note text not null default '' check(length(category_note)<=250),
 quantity_text text not null default '' check(length(quantity_text)<=120),
 notes text not null default '' check(length(notes)<=250),
 checked boolean not null default false,
 primary key(owner_id,id),
 unique(owner_id,template_index)
);
create table public.foodstock_receipts (
 owner_id uuid not null references public.foodstock_spaces(owner_id) on delete cascade,
 operation_id uuid not null,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,operation_id)
);
create table public.foodstock_analysis_usage (
 owner_id uuid not null references public.foodstock_spaces(owner_id) on delete cascade,
 day date not null default current_date,
 used integer not null default 0 check(used between 0 and 10),
 primary key(owner_id,day)
);
create index foodstock_purchase_history on public.foodstock_purchases(owner_id,purchased_on desc,created_at desc);
create index foodstock_product_history on public.foodstock_purchases(owner_id,product_id);
create index foodstock_movement_history on public.foodstock_movements(owner_id,product_id);

-- A public key alone never grants access to somebody else's stock or history.
alter table public.foodstock_spaces enable row level security;
alter table public.foodstock_products enable row level security;
alter table public.foodstock_purchases enable row level security;
alter table public.foodstock_movements enable row level security;
alter table public.foodstock_shopping_items enable row level security;
alter table public.foodstock_receipts enable row level security;
alter table public.foodstock_analysis_usage enable row level security;
create policy owner_read on public.foodstock_spaces for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_read on public.foodstock_products for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_read on public.foodstock_purchases for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_read on public.foodstock_movements for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_read on public.foodstock_shopping_items for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_read on public.foodstock_receipts for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_read on public.foodstock_analysis_usage for select to authenticated using ((select auth.uid())=owner_id);
revoke all on public.foodstock_spaces,public.foodstock_products,public.foodstock_purchases,public.foodstock_movements,public.foodstock_shopping_items,public.foodstock_receipts,public.foodstock_analysis_usage from anon, authenticated;
grant select on public.foodstock_spaces,public.foodstock_products,public.foodstock_purchases,public.foodstock_movements,public.foodstock_shopping_items,public.foodstock_receipts,public.foodstock_analysis_usage to authenticated;

create table private.foodstock_template (
 position integer primary key, name text not null,category text not null,category_note text not null,quantity_text text not null,notes text not null
);

create function private.foodstock_owner() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'Inicia sessão para aceder aos teus dados.' using errcode='42501'; end if;
 insert into public.foodstock_spaces(owner_id) values(u) on conflict do nothing;
 -- Serialize snapshots and mutations for this account, including concurrent devices.
 perform 1 from public.foodstock_spaces where owner_id=u for update;
 return u;
end $$;

create function private.foodstock_text(b jsonb,k text,max_length integer,required boolean default false) returns text language plpgsql immutable set search_path='' as $$
declare v text:=b->>k;
begin
 if jsonb_typeof(b->k) is distinct from 'string' or length(v)>max_length or (required and length(btrim(v))=0) then
  raise exception 'Campo de texto inválido: %.',k using errcode='22023';
 end if;
 return btrim(v);
end $$;
create function private.foodstock_number(b jsonb,k text,places integer,positive boolean default false) returns numeric language plpgsql immutable set search_path='' as $$
declare v numeric;
begin
 if jsonb_typeof(b->k) is distinct from 'number' then raise exception 'Quantidade ou valor em falta: %.',k using errcode='22023';end if;
 v:=(b->>k)::numeric;
 if v<0 or v>=1000000000 or (positive and v=0) or v<>round(v,places) then raise exception 'Quantidade ou valor inválido: %.',k using errcode='22023';end if;
 return v;
end $$;
create function private.foodstock_item(u uuid,entity text,b jsonb) returns text language plpgsql stable set search_path='' as $$
declare result text;
begin
 select id into result from public.foodstock_shopping_items where owner_id=u and
  case when b->>'templateIndex' is not null then template_index=(b->>'templateIndex')::integer else id=entity end;
 if result is null then raise exception 'Item da lista não encontrado. Carrega a lista antes de sincronizar.' using errcode='40001';end if;
 return result;
end $$;

create function private.foodstock_mutate(u uuid,kind text,entity text,b jsonb) returns void language plpgsql set search_path='' as $$
declare p public.foodstock_products%rowtype; item public.foodstock_shopping_items%rowtype;
 q numeric; amount numeric; day date; store_name text; name_value text; unit_value text;
 line jsonb; id_value text; seen text[]:='{}'; purchase_ids text[]:='{}';
begin
 if jsonb_typeof(b) is distinct from 'object' then raise exception 'Alteração inválida.' using errcode='22023';end if;
 case kind
 when 'PRODUCT_CREATE' then
  name_value:=private.foodstock_text(b,'name',120,true);unit_value:=private.foodstock_text(b,'unit',2,true);
  if unit_value not in ('kg','L','un') then raise exception 'Unidade inválida.' using errcode='22023';end if;
  insert into public.foodstock_products(owner_id,id,name,unit,stock,minimum_stock,category,brand)
   values(u,entity::uuid,name_value,unit_value,private.foodstock_number(b,'initialStock',3),private.foodstock_number(b,'minimumStock',3),
    private.foodstock_text(b||jsonb_build_object('category',coalesce(b->>'category','')),'category',80),
    private.foodstock_text(b||jsonb_build_object('brand',coalesce(b->>'brand','')),'brand',120));
 when 'PURCHASE_CREATE' then
  select * into p from public.foodstock_products where owner_id=u and id=(b->>'productId')::uuid for update;
  if not found then raise exception 'O alimento desta compra não existe.' using errcode='40001';end if;
  q:=private.foodstock_number(b,'quantity',3,true);amount:=private.foodstock_number(b,'total',2,true);
  store_name:=private.foodstock_text(b,'store',120,true);day:=(b->>'purchasedOn')::date;
  if day is null or day>current_date or day::text<>b->>'purchasedOn' then raise exception 'Data de compra inválida ou futura.' using errcode='22023';end if;
  insert into public.foodstock_purchases(owner_id,id,product_id,quantity,total,store,purchased_on) values(u,entity::uuid,p.id,q,amount,store_name,day);
  update public.foodstock_products set stock=stock+q where owner_id=u and id=p.id;
 when 'CONSUME' then
  select * into p from public.foodstock_products where owner_id=u and id=entity::uuid for update;
  if not found then raise exception 'Alimento não encontrado.' using errcode='40001';end if;
  q:=private.foodstock_number(b,'quantity',3,true);
  if q>p.stock then raise exception 'O consumo excede o stock disponível. A alteração local foi preservada.' using errcode='40001';end if;
  update public.foodstock_products set stock=stock-q where owner_id=u and id=p.id;
  insert into public.foodstock_movements(owner_id,product_id,quantity,reason) values(u,p.id,-q,private.foodstock_text(b,'reason',200,true));
 when 'SHOPPING_IMPORT' then
  if not (select template_imported from public.foodstock_spaces where owner_id=u) then
   insert into public.foodstock_shopping_items(owner_id,id,template_index,name,category,category_note,quantity_text,notes)
    select u,'template-'||position,position,name,category,category_note,quantity_text,notes from private.foodstock_template;
   update public.foodstock_spaces set template_imported=true where owner_id=u;
  end if;
 when 'SHOPPING_CHECK' then
  id_value:=private.foodstock_item(u,entity,b);
  if jsonb_typeof(b->'checked') is distinct from 'boolean' then raise exception 'Marcação inválida.' using errcode='22023';end if;
  update public.foodstock_shopping_items set checked=(b->>'checked')::boolean where owner_id=u and id=id_value;
 when 'SHOPPING_DETAILS' then
  id_value:=private.foodstock_item(u,entity,b);
  select * into item from public.foodstock_shopping_items where owner_id=u and id=id_value;
  name_value:=private.foodstock_text(b,'quantityText',120);store_name:=private.foodstock_text(b,'notes',250);
  if (item.quantity_text,item.notes) is distinct from (name_value,store_name) and
    (item.quantity_text,item.notes) is distinct from (b->>'expectedQuantityText',b->>'expectedNotes') then
   raise exception 'Este item foi alterado noutro dispositivo. Revê a alteração pendente.' using errcode='40001';
  end if;
  update public.foodstock_shopping_items set quantity_text=name_value,notes=store_name where owner_id=u and id=id_value;
 when 'CHECKOUT' then
  if jsonb_typeof(b->'items') is distinct from 'array' or jsonb_array_length(b->'items') not between 1 and 100 then raise exception 'Seleciona entre 1 e 100 itens.' using errcode='22023';end if;
  for line in select value from jsonb_array_elements(b->'items') loop
   id_value:=private.foodstock_item(u,line->>'shoppingId',line);
   if id_value=any(seen) or (line->>'purchaseId')=any(purchase_ids) then raise exception 'Item ou compra repetido.' using errcode='22023';end if;
   seen:=array_append(seen,id_value);purchase_ids:=array_append(purchase_ids,line->>'purchaseId');
   if not (select checked from public.foodstock_shopping_items where owner_id=u and id=id_value) then raise exception 'Um item já foi finalizado ou desmarcado noutro dispositivo.' using errcode='40001';end if;
   if jsonb_typeof(line->'newProduct')='object' then
    perform private.foodstock_mutate(u,'PRODUCT_CREATE',line->>'productId',line->'newProduct'||'{"initialStock":0,"minimumStock":0}'::jsonb);
   end if;
   perform private.foodstock_mutate(u,'PURCHASE_CREATE',line->>'purchaseId',line||jsonb_build_object('store',b->>'store','purchasedOn',b->>'purchasedOn'));
   update public.foodstock_shopping_items set checked=false where owner_id=u and id=id_value;
  end loop;
 when 'INVENTORY_CAPTURE' then
  if jsonb_typeof(b->'items') is distinct from 'array' or jsonb_array_length(b->'items') not between 1 and 60 then raise exception 'Revê entre 1 e 60 alimentos.' using errcode='22023';end if;
  for line in select value from jsonb_array_elements(b->'items') loop
   if (line->>'productId')=any(seen) then raise exception 'Alimento repetido. Agrupa a quantidade numa linha.' using errcode='22023';end if;
   seen:=array_append(seen,line->>'productId');q:=private.foodstock_number(line,'quantity',3);
   if jsonb_typeof(line->'newProduct')='object' then
    perform private.foodstock_mutate(u,'PRODUCT_CREATE',line->>'productId',line->'newProduct'||jsonb_build_object('initialStock',q,'minimumStock',0));
   else
    select * into p from public.foodstock_products where owner_id=u and id=(line->>'productId')::uuid for update;
    if not found then raise exception 'Alimento não encontrado.' using errcode='40001';end if;
    if p.stock<>private.foodstock_number(line,'expectedStock',3) then raise exception 'O stock mudou noutro dispositivo. Revê a contagem antes de substituir.' using errcode='40001';end if;
    update public.foodstock_products set stock=q,category=private.foodstock_text(line,'category',80),brand=private.foodstock_text(line,'brand',120) where owner_id=u and id=p.id;
    insert into public.foodstock_movements(owner_id,product_id,quantity,reason) values(u,p.id,q-p.stock,'Contagem de inventário revista');
   end if;
  end loop;
 else raise exception 'Tipo de alteração desconhecido.' using errcode='22023';
 end case;
end $$;

create function public.foodstock_snapshot(p_expected_instance_id uuid default null,p_pending_ids uuid[] default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.foodstock_owner(); space public.foodstock_spaces%rowtype; result jsonb;
begin
 select * into space from public.foodstock_spaces where owner_id=u;
 if p_expected_instance_id is not null and p_expected_instance_id<>space.instance_id then raise exception 'Esta conta usa uma base diferente. Os dados locais foram preservados.' using errcode='40001';end if;
 if cardinality(p_pending_ids)>1000 then raise exception 'Demasiados recibos.' using errcode='22023';end if;
 result:=jsonb_build_object('schemaVersion',3,
  'products',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'unit',unit,'stock',stock,'minimumStock',minimum_stock,'category',category,'brand',brand) order by name) from public.foodstock_products where owner_id=u),'[]'::jsonb),
  'purchases',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'productId',v.product_id,'productName',p.name,'unit',p.unit,'quantity',v.quantity,'total',v.total,'store',v.store,'purchasedOn',v.purchased_on,'createdAt',v.created_at) order by v.purchased_on desc,v.created_at desc,v.id) from public.foodstock_purchases v join public.foodstock_products p on p.owner_id=v.owner_id and p.id=v.product_id where v.owner_id=u),'[]'::jsonb),
  'movements',coalesce((select jsonb_agg(jsonb_build_object('id',id,'productId',product_id,'quantity',quantity,'reason',reason,'createdAt',created_at) order by created_at) from public.foodstock_movements where owner_id=u),'[]'::jsonb),
  'shoppingList',jsonb_build_object('templateImported',space.template_imported,'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'templateIndex',template_index,'name',name,'category',category,'categoryNote',category_note,'quantityText',quantity_text,'notes',notes,'checked',checked) order by template_index) from public.foodstock_shopping_items where owner_id=u),'[]'::jsonb)));
 return jsonb_build_object('instanceId',space.instance_id,'data',result,'acknowledged',coalesce((select jsonb_agg(operation_id) from public.foodstock_receipts where owner_id=u and operation_id=any(p_pending_ids)),'[]'::jsonb));
end $$;

create function public.foodstock_apply(p_operation jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.foodstock_owner(); op_id uuid:=(p_operation->>'operationId')::uuid; receipt jsonb;
 payload jsonb:=jsonb_build_object('kind',p_operation->>'kind','entityId',p_operation->>'entityId','data',p_operation->'data');
begin
 if op_id is null or (p_operation->>'instanceId')::uuid is distinct from (select instance_id from public.foodstock_spaces where owner_id=u) then raise exception 'Identificação da base inválida. Os dados locais foram preservados.' using errcode='40001';end if;
 select r.payload into receipt from public.foodstock_receipts r where owner_id=u and operation_id=op_id;
 if found then
  if receipt<>payload then raise exception 'Este identificador já foi usado para outra alteração.' using errcode='40001';end if;
  return jsonb_build_object('operationId',op_id,'duplicate',true);
 end if;
 perform private.foodstock_mutate(u,p_operation->>'kind',p_operation->>'entityId',p_operation->'data');
 insert into public.foodstock_receipts(owner_id,operation_id,payload) values(u,op_id,payload);
 return jsonb_build_object('operationId',op_id,'duplicate',false);
exception when unique_violation then raise exception 'Já existe um registo com este identificador.' using errcode='40001';
end $$;

-- Import an existing browser/H2 export ONCE into an empty account. It is a snapshot,
-- so purchase quantities must not be added again to the already-current stock.
create function public.foodstock_import(p_import_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.foodstock_owner(); row_value jsonb; receipt jsonb; stock_value numeric; day_value date; index_value integer; movement_amount jsonb;
begin
 if p_import_id is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Backup inválido.' using errcode='22023';end if;
 select payload into receipt from public.foodstock_receipts where owner_id=u and operation_id=p_import_id;
 if found then
  if receipt<>jsonb_build_object('import',p_data) then raise exception 'Identificador de importação já utilizado.' using errcode='40001';end if;
  return jsonb_build_object('imported',true,'duplicate',true);
 end if;
 if exists(select 1 from public.foodstock_products where owner_id=u) or exists(select 1 from public.foodstock_receipts where owner_id=u) or
  (select template_imported from public.foodstock_spaces where owner_id=u) then raise exception 'A conta já contém dados. A importação só é permitida numa conta vazia; nada foi substituído.' using errcode='40001';end if;
 if coalesce(p_data->>'schemaVersion','') not in ('1','2','3') or
  jsonb_typeof(p_data->'products') is distinct from 'array' or jsonb_typeof(p_data->'purchases') is distinct from 'array' or
  jsonb_typeof(p_data->'movements') is distinct from 'array' then raise exception 'Formato de backup FoodStock inválido.' using errcode='22023';end if;
 if jsonb_array_length(p_data->'products')=0 and jsonb_array_length(p_data->'purchases')=0 and jsonb_array_length(p_data->'movements')=0 and not coalesce((p_data#>>'{shoppingList,templateImported}')::boolean,false) then raise exception 'Não há dados para importar.' using errcode='22023';end if;
 if jsonb_array_length(p_data->'products')>10000 or jsonb_array_length(p_data->'purchases')>50000 or jsonb_array_length(p_data->'movements')>100000 then raise exception 'Backup demasiado grande para esta importação.' using errcode='22023';end if;
 for row_value in select value from jsonb_array_elements(p_data->'products') loop
  stock_value:=private.foodstock_number(row_value,'stock',3);
  perform private.foodstock_mutate(u,'PRODUCT_CREATE',row_value->>'id',row_value||jsonb_build_object('initialStock',stock_value));
 end loop;
 for row_value in select value from jsonb_array_elements(p_data->'purchases') loop
  day_value:=(row_value->>'purchasedOn')::date;
  if day_value is null or day_value>current_date or day_value::text<>row_value->>'purchasedOn' then raise exception 'Data inválida no backup.' using errcode='22023';end if;
  insert into public.foodstock_purchases(owner_id,id,product_id,quantity,total,store,purchased_on,created_at)
   values(u,(row_value->>'id')::uuid,(row_value->>'productId')::uuid,private.foodstock_number(row_value,'quantity',3,true),private.foodstock_number(row_value,'total',2,true),private.foodstock_text(row_value,'store',120,true),day_value,
    coalesce((row_value->>'createdAt')::timestamptz,(row_value->>'localCreatedAt')::timestamptz,now()));
 end loop;
 for row_value in select value from jsonb_array_elements(p_data->'movements') loop
  -- H2's old SELECT * exports have uppercase/snake_case keys.
  movement_amount:=coalesce(row_value->'quantity',row_value->'QUANTITY');
  if jsonb_typeof(movement_amount) is distinct from 'number' then raise exception 'Movimento inválido no backup.' using errcode='22023';end if;
  if abs((movement_amount#>>'{}')::numeric)>=1000000000 or (movement_amount#>>'{}')::numeric<>round((movement_amount#>>'{}')::numeric,3) then raise exception 'Quantidade de movimento inválida.' using errcode='22023';end if;
  insert into public.foodstock_movements(owner_id,id,product_id,quantity,reason,created_at)
   values(u,coalesce(row_value->>'id',row_value->>'ID')::uuid,coalesce(row_value->>'productId',row_value->>'PRODUCT_ID',row_value->>'product_id')::uuid,
    coalesce(row_value->>'quantity',row_value->>'QUANTITY')::numeric,coalesce(row_value->>'reason',row_value->>'REASON','Importado'),
    coalesce(row_value->>'createdAt',row_value->>'CREATED_AT',row_value->>'created_at',now()::text)::timestamptz);
 end loop;
 if p_data->'shoppingList' is not null then
  if jsonb_typeof(p_data#>'{shoppingList,templateImported}') is distinct from 'boolean' or
    jsonb_typeof(p_data#>'{shoppingList,items}') is distinct from 'array' then raise exception 'Lista inválida no backup.' using errcode='22023';end if;
  for row_value in select value from jsonb_array_elements(p_data#>'{shoppingList,items}') loop
   select position into index_value from private.foodstock_template where name=row_value->>'name';
   index_value:=coalesce((row_value->>'templateIndex')::integer,index_value);
   if index_value is null or jsonb_typeof(row_value->'checked') is distinct from 'boolean' then raise exception 'Item da lista inválido.' using errcode='22023';end if;
   insert into public.foodstock_shopping_items(owner_id,id,template_index,name,category,category_note,quantity_text,notes,checked)
    values(u,private.foodstock_text(row_value,'id',80,true),index_value,private.foodstock_text(row_value,'name',120,true),private.foodstock_text(row_value,'category',80,true),
     coalesce(row_value->>'categoryNote',''),private.foodstock_text(row_value,'quantityText',120),private.foodstock_text(row_value,'notes',250),(row_value->>'checked')::boolean);
  end loop;
  update public.foodstock_spaces set template_imported=(p_data#>>'{shoppingList,templateImported}')::boolean where owner_id=u;
 end if;
 insert into public.foodstock_receipts(owner_id,operation_id,payload) values(u,p_import_id,jsonb_build_object('import',p_data));
 return jsonb_build_object('imported',true,'duplicate',false);
end $$;

create function public.foodstock_reserve_analysis() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.foodstock_owner(); count_value integer;
begin
 insert into public.foodstock_analysis_usage(owner_id,day,used) values(u,current_date,1)
 on conflict(owner_id,day) do update set used=foodstock_analysis_usage.used+1 where foodstock_analysis_usage.used<10
 returning used into count_value;
 if count_value is null then raise exception 'Limite diário de 10 análises atingido. Tenta amanhã.' using errcode='P0001';end if;
 return jsonb_build_object('used',count_value,'limit',10);
end $$;

-- New functions otherwise inherit EXECUTE for PUBLIC in PostgreSQL.
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.foodstock_snapshot(uuid,uuid[]),public.foodstock_apply(jsonb),public.foodstock_import(uuid,jsonb),public.foodstock_reserve_analysis() from public, anon;
grant execute on function public.foodstock_snapshot(uuid,uuid[]),public.foodstock_apply(jsonb),public.foodstock_import(uuid,jsonb),public.foodstock_reserve_analysis() to authenticated;

insert into private.foodstock_template(position,name,category,category_note,quantity_text,notes) values
(0,'Frango','Proteínas','','',''),
(1,'Carne picada','Proteínas','','',''),
(2,'Porco','Proteínas','','',''),
(3,'Peixe','Proteínas','','','Filetes de pescada ou outras opções'),
(4,'Atum','Proteínas','','8',''),
(5,'Ovos','Proteínas','','12 ou 24',''),
(6,'Hambúrgueres','Proteínas','','','Por exemplo'),
(7,'Arroz','Hidratos e acompanhamentos','','3',''),
(8,'Massa espiral','Hidratos e acompanhamentos','','1 kg',''),
(9,'Massa diferente','Hidratos e acompanhamentos','','1 ou 2','Aquela diferente'),
(10,'Cuscuz','Hidratos e acompanhamentos','','3 kg',''),
(11,'Puré','Hidratos e acompanhamentos','','1 cx',''),
(12,'Batata','Hidratos e acompanhamentos','','1 saco',''),
(13,'Alho','Legumes','Pode ser o que tiver congelado','1',''),
(14,'Cenoura','Legumes','Pode ser o que tiver congelado','',''),
(15,'Cogumelos','Legumes','Pode ser o que tiver congelado','',''),
(16,'Bananas','Fruta','','6/10',''),
(17,'Maçãs','Fruta','','',''),
(18,'Laranjas ou clementinas','Fruta','','',''),
(19,'Outra fruta para variar','Fruta','','',''),
(20,'Leite','Laticínios','','1 cx',''),
(21,'Iogurte de beber','Laticínios','','','Iogurte de litro'),
(22,'Iogurte de comer','Laticínios','','',''),
(23,'Queijo','Laticínios','','',''),
(24,'Manteiga','Laticínios','','',''),
(25,'Feijão','Conservas e leguminosas','','2 ou 3 sacos',''),
(26,'Polpa de tomate','Conservas e leguminosas','','2',''),
(27,'Milho','Conservas e leguminosas','','',''),
(28,'Azeitonas','Conservas e leguminosas','','',''),
(29,'Azeite','Conservas e leguminosas','','',''),
(30,'Água','Bebidas','','',''),
(31,'Pão','Lanche','','',''),
(32,'Batata palha','Lanche','','',''),
(33,'Doritos','Lanche','','',''),
(34,'Bolacha Oreo','Lanche','','',''),
(35,'Manhasitos','Lanche','','',''),
(36,'Nestum','Lanche','','',''),
(37,'Sal fino','Temperos','','',''),
(38,'Cebola em pó','Temperos','','','');
