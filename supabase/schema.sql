create extension if not exists pgcrypto;

-- ============================================================
-- Food Event Desk - secure Supabase schema
-- ============================================================

drop function if exists public.place_order(integer,text,jsonb);
-- Replaced by the version with p_token_no (avoids ambiguous overloads in PostgREST).
drop function if exists public.place_order(text,jsonb,integer,text,uuid,text,integer,integer);

create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'cashier' check(role in ('admin','manager','cashier','kitchen','treasurer')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings(
  id integer primary key default 1 check(id=1),
  event_name text not null default 'Food Event Desk',
  currency_symbol text not null default '₹',
  service_day_cutoff_hour integer not null default 5 check(service_day_cutoff_hour between 0 and 23),
  kitchen_delay_minutes integer not null default 10 check(kitchen_delay_minutes between 1 and 180),
  max_custom_discount_percent integer not null default 20 check(max_custom_discount_percent between 0 and 100),
  require_cash_received boolean not null default true,
  features jsonb not null default '{
    "cashier": true,
    "kitchen": true,
    "dashboard": true,
    "orders": true,
    "menuManagement": true,
    "discounts": true,
    "staffManagement": true,
    "reports": true,
    "printing": true,
    "customDiscount": true,
    "cashChange": true,
    "upiPayment": true,
    "posPayment": true
  }'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.products(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price integer not null default 0 check(price >= 0),
  station text not null check(station in ('waffle','chole','pav')),
  category text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.discounts(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check(type in ('percent','fixed')),
  value integer not null check(value >= 0),
  active boolean not null default true,
  min_order_amount integer not null default 0 check(min_order_amount >= 0),
  max_discount_amount integer check(max_discount_amount is null or max_discount_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.service_day_counters(
  service_day date primary key,
  last_order_no integer not null default 0
);

create table if not exists public.orders(
  id uuid primary key default gen_random_uuid(),
  order_no integer not null,
  service_day date not null default current_date,
  status text not null default 'new' check(status in ('new','preparing','ready','cancelled')),
  subtotal integer not null default 0 check(subtotal >= 0),
  discount_amount integer not null default 0 check(discount_amount >= 0),
  discount_id uuid references public.discounts(id),
  discount_name text,
  discount_type text check(discount_type is null or discount_type in ('percent','fixed')),
  discount_value integer check(discount_value is null or discount_value >= 0),
  total integer not null default 0 check(total >= 0),
  payment_method text not null default 'cash' check(payment_method in ('cash','upi','pos')),
  covers integer not null default 1 check(covers > 0),
  notes text,
  token_no text,
  cash_received integer,
  change_due integer,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(service_day, order_no)
);

create table if not exists public.order_items(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  station text not null check(station in ('waffle','chole','pav')),
  qty integer not null check(qty > 0),
  price integer not null check(price >= 0),
  status text not null default 'new' check(status in ('new','done','cancelled')),
  cancel_reason text
);

create table if not exists public.audit_logs(
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.app_settings(id) values(1) on conflict(id) do nothing;

-- Add missing columns to installations that used the original MVP schema.
alter table public.products add column if not exists category text;
alter table public.products add column if not exists sort_order integer not null default 0;
alter table public.orders add column if not exists subtotal integer not null default 0;
alter table public.orders add column if not exists discount_amount integer not null default 0;
alter table public.orders add column if not exists discount_id uuid references public.discounts(id);
alter table public.orders add column if not exists discount_name text;
alter table public.orders add column if not exists discount_type text;
alter table public.orders add column if not exists discount_value integer;
alter table public.orders add column if not exists covers integer not null default 1;
alter table public.orders add column if not exists notes text;
alter table public.orders add column if not exists token_no text;
alter table public.orders add column if not exists cash_received integer;
alter table public.orders add column if not exists change_due integer;
alter table public.orders add column if not exists created_by uuid references public.profiles(id);
alter table public.orders add column if not exists updated_at timestamptz not null default now();
alter table public.order_items add column if not exists cancel_reason text;
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check(payment_method in ('cash','upi','pos'));

alter table public.order_items drop constraint if exists order_items_status_check;
alter table public.order_items add constraint order_items_status_check check(status in ('new','done','cancelled'));

-- Old global sequence is not used by the secure order RPC anymore.
create index if not exists products_station_sort_idx on public.products(station,sort_order,created_at);
create index if not exists discounts_active_idx on public.discounts(active,created_at);
create index if not exists orders_service_day_created_idx on public.orders(service_day,created_at);
create index if not exists orders_created_by_idx on public.orders(created_by,created_at);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_station_status_idx on public.order_items(station,status);

insert into public.service_day_counters(service_day,last_order_no)
select service_day,max(order_no) from public.orders group by service_day
on conflict(service_day) do update set last_order_no=greatest(public.service_day_counters.last_order_no, excluded.last_order_no);

-- ============================================================
-- Auth/profile bootstrap
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path=public
as $$
begin
  insert into public.profiles(id,email,display_name,role,active)
  values(new.id,coalesce(new.email,''),coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(coalesce(new.email,''),'@',1)), 'cashier', true)
  on conflict(id) do update set email=excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Run this once after creating the first admin in Supabase Auth.
create or replace function public.bootstrap_admin(p_email text)
returns void
language plpgsql
security definer set search_path=public
as $$
begin
  update public.profiles set role='admin', active=true where lower(email)=lower(p_email);
end;
$$;
revoke all on function public.bootstrap_admin(text) from public, anon, authenticated;

-- ============================================================
-- RBAC helpers
-- ============================================================
create or replace function public.current_role()
returns text
language sql
stable
security definer set search_path=public
as $$
  select role from public.profiles where id=auth.uid() and active=true;
$$;

create or replace function public.can_manage_menu()
returns boolean language sql stable security definer set search_path=public as $$
  select public.current_role() in ('admin','manager');
$$;

create or replace function public.can_manage_orders()
returns boolean language sql stable security definer set search_path=public as $$
  select public.current_role() in ('admin','manager','cashier');
$$;

create or replace function public.can_view_reports()
returns boolean language sql stable security definer set search_path=public as $$
  select public.current_role() in ('admin','manager','treasurer');
$$;

create or replace function public.can_manage_settings()
returns boolean language sql stable security definer set search_path=public as $$
  select public.current_role()='admin';
$$;

-- ============================================================
-- Secure order placement. Client prices are ignored and recalculated from DB.
-- ============================================================
create or replace function public.place_order(
  p_payment_method text,
  p_items jsonb,
  p_covers integer default 1,
  p_notes text default null,
  p_discount_id uuid default null,
  p_custom_discount_type text default null,
  p_custom_discount_value integer default null,
  p_cash_received integer default null,
  p_token_no text default null
) returns public.orders
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
  v_discount public.discounts;
  v_qty integer;
  v_product_id uuid;
  v_subtotal integer := 0;
  v_discount_amount integer := 0;
  v_total integer := 0;
  v_discount_name text;
  v_discount_type text;
  v_discount_value integer;
  v_change integer;
  v_service_day date;
  v_next_no integer;
  v_cutoff integer;
  v_features jsonb;
  v_max_custom integer;
  v_require_cash boolean;
  v_token text := nullif(upper(trim(coalesce(p_token_no,''))),'');
begin
  if coalesce(public.current_role(),'') not in ('admin','manager','cashier') then raise exception 'Not allowed to place orders'; end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then raise exception 'Order has no items'; end if;
  if coalesce(p_covers,0) <= 0 then raise exception 'Covers must be at least 1'; end if;
  if v_token is not null and v_token !~ '^[A-Z0-9-]{1,10}$' then raise exception 'Token number may contain only letters, digits and hyphen (max 10 characters)'; end if;

  select service_day_cutoff_hour, max_custom_discount_percent, require_cash_received, features
    into v_cutoff, v_max_custom, v_require_cash, v_features
  from public.app_settings where id=1;

  if p_payment_method not in ('cash','upi','pos') then raise exception 'Invalid payment method'; end if;
  if p_payment_method='upi' and coalesce((v_features->>'upiPayment')::boolean,true) is not true then raise exception 'UPI payments are disabled'; end if;
  if p_payment_method='pos' and coalesce((v_features->>'posPayment')::boolean,true) is not true then raise exception 'POS payments are disabled'; end if;

  if coalesce((v_features->>'cashier')::boolean,true) is not true then raise exception 'Cashier feature is disabled'; end if;
  if p_payment_method='cash' and coalesce((v_features->>'cashChange')::boolean,true) is not true then
    -- Still allow cash if change feature is disabled, but do not accept tender data.
    p_cash_received := null;
  end if;
  if p_discount_id is not null and coalesce((v_features->>'discounts')::boolean,true) is not true then raise exception 'Discounts are disabled'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::integer;
    if v_qty is null or v_qty <= 0 then raise exception 'Invalid quantity'; end if;
    select * into v_product from public.products where id=v_product_id and active=true;
    if not found then raise exception 'Product is unavailable'; end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
  end loop;

  if p_discount_id is not null then
    select * into v_discount from public.discounts where id=p_discount_id and active=true;
    if not found then raise exception 'Discount is unavailable'; end if;
    if v_subtotal < v_discount.min_order_amount then raise exception 'Order does not meet the discount minimum'; end if;
    v_discount_name := v_discount.name;
    v_discount_type := v_discount.type;
    v_discount_value := v_discount.value;
    if v_discount.type='percent' then
      v_discount_amount := round(v_subtotal * v_discount.value / 100.0);
    else
      v_discount_amount := least(v_subtotal, v_discount.value);
    end if;
    if v_discount.max_discount_amount is not null then v_discount_amount := least(v_discount_amount, v_discount.max_discount_amount); end if;
  elsif p_custom_discount_type is not null or p_custom_discount_value is not null then
    if coalesce((v_features->>'discounts')::boolean,true) is not true then raise exception 'Discounts are disabled'; end if;
    if coalesce((v_features->>'customDiscount')::boolean,true) is not true then raise exception 'Custom discounts are disabled'; end if;
    if p_custom_discount_type not in ('percent','fixed') or coalesce(p_custom_discount_value,0) <= 0 then raise exception 'Invalid custom discount'; end if;
    if p_custom_discount_type='percent' and p_custom_discount_value > v_max_custom then raise exception 'Custom discount exceeds the configured limit'; end if;
    v_discount_name := 'Custom discount';
    v_discount_type := p_custom_discount_type;
    v_discount_value := p_custom_discount_value;
    if p_custom_discount_type='percent' then v_discount_amount := round(v_subtotal * p_custom_discount_value / 100.0); else v_discount_amount := least(v_subtotal,p_custom_discount_value); end if;
  end if;

  v_total := greatest(0, v_subtotal - v_discount_amount);

  if p_payment_method='cash' and coalesce((v_features->>'cashChange')::boolean,true) is true and v_require_cash then
    if p_cash_received is null or p_cash_received < v_total then raise exception 'Cash received must cover the total'; end if;
    v_change := p_cash_received - v_total;
  elsif p_cash_received is not null and p_payment_method='cash' then
    v_change := greatest(0,p_cash_received-v_total);
  end if;

  v_service_day := (current_timestamp - make_interval(hours => coalesce(v_cutoff,5)))::date;
  insert into public.service_day_counters(service_day,last_order_no) values(v_service_day,0)
    on conflict(service_day) do nothing;
  update public.service_day_counters set last_order_no=last_order_no+1 where service_day=v_service_day returning last_order_no into v_next_no;

  insert into public.orders(order_no,service_day,status,subtotal,discount_amount,discount_id,discount_name,discount_type,discount_value,total,payment_method,covers,notes,token_no,cash_received,change_due,created_by)
  values(v_next_no,v_service_day,'new',v_subtotal,v_discount_amount,p_discount_id,v_discount_name,v_discount_type,v_discount_value,v_total,p_payment_method,p_covers,nullif(trim(p_notes),''),v_token,p_cash_received,v_change,auth.uid())
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::integer;
    select * into v_product from public.products where id=v_product_id and active=true;
    insert into public.order_items(order_id,product_id,product_name,station,qty,price,status)
    values(v_order.id,v_product.id,v_product.name,v_product.station,v_qty,v_product.price,'new');
  end loop;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),'create','order',v_order.id,jsonb_build_object('total',v_total,'payment_method',p_payment_method,'token_no',v_token));
  return v_order;
end;
$$;

grant execute on function public.place_order(text,jsonb,integer,text,uuid,text,integer,integer,text) to authenticated;

create or replace function public.cancel_order_item(p_item_id uuid, p_reason text default null)
returns public.order_items
language plpgsql
security definer set search_path=public
as $$
declare
  v_item public.order_items;
  v_order public.orders;
  v_subtotal integer;
  v_discount integer;
  v_total integer;
begin
  if coalesce(public.current_role(),'') not in ('admin','manager','cashier') then raise exception 'Not allowed'; end if;
  if coalesce((select features->>'orders' from public.app_settings where id=1)::boolean,true) is not true then raise exception 'Order management feature is disabled'; end if;
  select oi.* into v_item from public.order_items oi join public.orders o on o.id=oi.order_id
    where oi.id=p_item_id and oi.status <> 'cancelled';
  if v_item.id is null then raise exception 'Order line not found or already cancelled'; end if;
  if coalesce(public.current_role(),'')='cashier' and not exists(select 1 from public.orders o where o.id=v_item.order_id and o.created_by=auth.uid()) then raise exception 'Cashiers can only correct their own orders'; end if;

  update public.order_items set status='cancelled', cancel_reason=nullif(trim(p_reason),'') where id=p_item_id returning * into v_item;
  select * into v_order from public.orders where id=v_item.order_id;
  select coalesce(sum(price*qty),0) into v_subtotal from public.order_items where order_id=v_order.id and status <> 'cancelled';
  if v_order.discount_type='percent' then v_discount := round(v_subtotal * coalesce(v_order.discount_value,0) / 100.0); else v_discount := least(v_subtotal,coalesce(v_order.discount_value,0)); end if;
  v_total := greatest(0,v_subtotal-v_discount);
  update public.orders set subtotal=v_subtotal, discount_amount=v_discount, total=v_total, change_due=case when payment_method='cash' and cash_received is not null then greatest(0,cash_received-v_total) else null end, status=case when v_subtotal=0 then 'cancelled' when not exists(select 1 from public.order_items where order_id=v_order.id and status='new') then 'ready' when status='new' then 'new' else 'preparing' end, updated_at=now() where id=v_order.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'cancel_line','order_item',p_item_id,jsonb_build_object('reason',p_reason));
  return v_item;
end;
$$;
grant execute on function public.cancel_order_item(uuid,text) to authenticated;

create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql security definer set search_path=public
as $$
declare v_order public.orders;
begin
  if coalesce(public.current_role(),'') not in ('admin','manager','cashier') then raise exception 'Not allowed'; end if;
  if coalesce((select features->>'orders' from public.app_settings where id=1)::boolean,true) is not true then raise exception 'Order management feature is disabled'; end if;
  if coalesce(public.current_role(),'')='cashier' and not exists(select 1 from public.orders o where o.id=p_order_id and o.created_by=auth.uid()) then raise exception 'Cashiers can only cancel their own orders'; end if;
  update public.orders set status='cancelled', updated_at=now() where id=p_order_id and status<>'cancelled' returning * into v_order;
  if v_order.id is null then raise exception 'Order not found or already cancelled'; end if;
  update public.order_items set status='cancelled', cancel_reason=coalesce(nullif(trim(p_reason),''),'Order cancelled') where order_id=p_order_id and status<>'cancelled';
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'cancel','order',p_order_id,jsonb_build_object('reason',p_reason));
  return v_order;
end;
$$;
grant execute on function public.cancel_order(uuid,text) to authenticated;

-- Kitchen may explicitly move a new order into preparing.
create or replace function public.start_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path=public
as $$
declare v_order public.orders;
begin
  if coalesce(public.current_role(),'') not in ('admin','manager','kitchen') then raise exception 'Not allowed'; end if;
  if coalesce((select features->>'kitchen' from public.app_settings where id=1)::boolean,true) is not true then raise exception 'Kitchen feature is disabled'; end if;
  update public.orders set status='preparing', updated_at=now() where id=p_order_id and status='new' returning * into v_order;
  if v_order.id is null then raise exception 'Order is no longer available'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'start','order',p_order_id,'{}'::jsonb);
  return v_order;
end;
$$;
grant execute on function public.start_order(uuid) to authenticated;

-- Update order and item status when kitchen marks the last item done.
create or replace function public.complete_order_item(p_item_id uuid)
returns public.order_items
language plpgsql security definer set search_path=public
as $$
declare v_item public.order_items; v_left integer;
begin
  if coalesce(public.current_role(),'') not in ('admin','manager','kitchen') then raise exception 'Not allowed'; end if;
  if coalesce((select features->>'kitchen' from public.app_settings where id=1)::boolean,true) is not true then raise exception 'Kitchen feature is disabled'; end if;
  update public.order_items set status='done' where id=p_item_id and status='new' returning * into v_item;
  if v_item.id is null then raise exception 'Item not available'; end if;
  select count(*) into v_left from public.order_items where order_id=v_item.order_id and status='new';
  update public.orders set status=case when v_left=0 then 'ready' else 'preparing' end, updated_at=now() where id=v_item.order_id and status<>'cancelled';
  return v_item;
end;
$$;
grant execute on function public.complete_order_item(uuid) to authenticated;

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.products enable row level security;
alter table public.discounts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.audit_logs enable row level security;
alter table public.service_day_counters enable row level security;

drop policy if exists profiles_self_or_admin on public.profiles;
create policy profiles_self_or_admin on public.profiles for select to authenticated using (id=auth.uid() or public.current_role()='admin');

drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated using (public.current_role() is not null);
drop policy if exists settings_admin_update on public.app_settings;
create policy settings_admin_update on public.app_settings for update to authenticated using (public.current_role()='admin') with check (public.current_role()='admin');

drop policy if exists products_read on public.products;
create policy products_read on public.products for select to authenticated using ((active=true and coalesce((select features->>'cashier' from public.app_settings where id=1)::boolean,true)) or public.current_role() in ('admin','manager'));
drop policy if exists products_manage on public.products;
create policy products_manage on public.products for insert to authenticated with check (public.can_manage_menu() and coalesce((select features->>'menuManagement' from public.app_settings where id=1)::boolean,true));
drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated using (public.can_manage_menu() and coalesce((select features->>'menuManagement' from public.app_settings where id=1)::boolean,true)) with check (public.can_manage_menu() and coalesce((select features->>'menuManagement' from public.app_settings where id=1)::boolean,true));

drop policy if exists discounts_read on public.discounts;
create policy discounts_read on public.discounts for select to authenticated using ((active=true and coalesce((select features->>'discounts' from public.app_settings where id=1)::boolean,true)) or public.current_role() in ('admin','manager'));
drop policy if exists discounts_manage on public.discounts;
create policy discounts_manage on public.discounts for all to authenticated using (public.current_role() in ('admin','manager') and coalesce((select features->>'discounts' from public.app_settings where id=1)::boolean,true)) with check (public.current_role() in ('admin','manager') and coalesce((select features->>'discounts' from public.app_settings where id=1)::boolean,true));

-- Orders are readable by operational/finance roles; cashiers see only the orders they created.
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using (
  public.current_role() in ('admin','manager','kitchen','treasurer') or created_by=auth.uid()
);

drop policy if exists items_read on public.order_items;
create policy items_read on public.order_items for select to authenticated using (
  public.current_role() in ('admin','manager','kitchen','treasurer') or exists(select 1 from public.orders o where o.id=order_id and o.created_by=auth.uid())
);

drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated using (public.current_role()='admin');

-- Counter is server-owned and not directly writable/readable by browser users.
drop policy if exists counters_none on public.service_day_counters;
create policy counters_none on public.service_day_counters for all to authenticated using (false) with check (false);

-- Defaults / seed menu. Existing products are preserved on subsequent runs.
insert into public.products(name,price,station,category,sort_order)
select 'Waffle',50,'waffle','Waffle',1 where not exists(select 1 from public.products where name='Waffle');
insert into public.products(name,price,station,category,sort_order)
select 'Chole Kulche',60,'chole','Chaat',1 where not exists(select 1 from public.products where name='Chole Kulche');
insert into public.products(name,price,station,category,sort_order)
select 'Pav Bataka',40,'pav','Street Food',1 where not exists(select 1 from public.products where name='Pav Bataka');

insert into public.discounts(name,type,value,active,min_order_amount,max_discount_amount)
select '10% Event Offer','percent',10,true,0, null where not exists(select 1 from public.discounts where name='10% Event Offer');
insert into public.discounts(name,type,value,active,min_order_amount,max_discount_amount)
select '₹50 Off','fixed',50,true,300,50 where not exists(select 1 from public.discounts where name='₹50 Off');

-- Realtime
DO $$ BEGIN alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; END $$;
DO $$ BEGIN alter publication supabase_realtime add table public.order_items; exception when duplicate_object then null; END $$;
DO $$ BEGIN alter publication supabase_realtime add table public.products; exception when duplicate_object then null; END $$;
DO $$ BEGIN alter publication supabase_realtime add table public.discounts; exception when duplicate_object then null; END $$;
DO $$ BEGIN alter publication supabase_realtime add table public.app_settings; exception when duplicate_object then null; END $$;
