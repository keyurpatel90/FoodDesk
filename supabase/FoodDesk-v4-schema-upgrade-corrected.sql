-- FoodDesk v4 additive upgrade layer.
-- Apply supabase/schema.sql (v3 baseline) first, then this file.
-- This file is kept separate to preserve the complete, readable v3 schema.

create extension if not exists pgcrypto;
drop function if exists public.place_order(text,jsonb,integer,text,uuid,text,integer,integer);
drop function if exists public.place_order(integer,text,jsonb);

-- IMPORTANT: this upgrade is ordered for an existing v3 database. Existing tables are altered
-- explicitly because CREATE TABLE IF NOT EXISTS does not add columns to existing tables.

-- FoodDesk v4: P0 completion + onboarding + combos + reports + inventory + settlement + QR + intelligence + multi-outlet foundations.

create table if not exists public.organizations(id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table if not exists public.outlets(id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, name text not null, code text not null, active boolean not null default true, created_at timestamptz not null default now(), unique(organization_id,code));

create table if not exists public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null, display_name text not null,
 role text not null default 'cashier',
 active boolean not null default true,
 organization_id uuid references public.organizations(id), outlet_id uuid references public.outlets(id),
 created_at timestamptz not null default now()
);

create table if not exists public.app_settings(
 id integer primary key default 1 check(id=1), event_name text not null default 'FoodDesk Event', currency_symbol text not null default '₹',
 service_day_cutoff_hour integer not null default 5 check(service_day_cutoff_hour between 0 and 23), kitchen_delay_minutes integer not null default 10 check(kitchen_delay_minutes between 1 and 180),
 max_custom_discount_percent integer not null default 20 check(max_custom_discount_percent between 0 and 100), require_cash_received boolean not null default true,
 features jsonb not null default '{}'::jsonb, event_start_date date, event_end_date date, event_location text, expected_visitors integer default 0, number_stalls integer default 1, number_cashiers integer default 1, number_kitchen_stations integer default 3,
 event_mode boolean not null default true, onboarding_completed boolean not null default false, organization_id uuid references public.organizations(id), outlet_id uuid references public.outlets(id), updated_at timestamptz not null default now()
);

create table if not exists public.products(
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), outlet_id uuid references public.outlets(id), name text not null, price integer not null default 0 check(price>=0), food_cost integer not null default 0 check(food_cost>=0), station text not null check(station in ('waffle','chole','pav')), category text, active boolean not null default true, sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.discounts(id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), name text not null, type text not null check(type in ('percent','fixed')), value integer not null check(value>=0), active boolean not null default true, min_order_amount integer not null default 0, max_discount_amount integer, created_at timestamptz not null default now());
create table if not exists public.combos(id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), outlet_id uuid references public.outlets(id), name text not null, description text, price integer not null check(price>=0), active boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.combo_items(id uuid primary key default gen_random_uuid(), combo_id uuid not null references public.combos(id) on delete cascade, product_id uuid not null references public.products(id), qty integer not null check(qty>0), unique(combo_id,product_id));

create table if not exists public.service_day_counters(service_day date primary key,last_order_no integer not null default 0);
create table if not exists public.outlet_day_counters(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,outlet_id uuid not null references public.outlets(id) on delete cascade,service_day date not null,last_order_no integer not null default 0,unique(organization_id,outlet_id,service_day));
create table if not exists public.orders(
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), outlet_id uuid references public.outlets(id),
 order_no integer not null, service_day date not null default current_date,
 status text not null default 'new', subtotal integer not null default 0, discount_amount integer not null default 0, discount_id uuid references public.discounts(id), discount_name text, discount_type text, discount_value integer, total integer not null default 0,
 payment_method text not null default 'cash', covers integer not null default 1, token_no text, notes text, cash_received integer, change_due integer,
 order_type text not null default 'counter', customer_name text, customer_phone text, client_order_id text, device_id text, version integer not null default 1,
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(service_day,order_no), unique(organization_id,client_order_id)
);
create table if not exists public.order_items(
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, product_id uuid references public.products(id), combo_id uuid references public.combos(id), product_name text not null, station text not null check(station in ('waffle','chole','pav')), qty integer not null check(qty>0), price integer not null default 0, food_cost integer not null default 0, status text not null default 'new', cancel_reason text, line_type text not null default 'product'
);
create table if not exists public.order_status_history(id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, from_status text, to_status text not null, actor_id uuid references public.profiles(id), note text, created_at timestamptz not null default now());
create table if not exists public.refunds(id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id), amount integer not null check(amount>0), reason text not null, payment_method text not null, created_by uuid references public.profiles(id), created_at timestamptz not null default now());
create table if not exists public.audit_logs(id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id), organization_id uuid references public.organizations(id), action text not null, entity_type text not null, entity_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now());

create table if not exists public.inventory_items(id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), outlet_id uuid references public.outlets(id), name text not null, unit text not null default 'unit', current_qty numeric not null default 0, reorder_level numeric not null default 0, unit_cost numeric not null default 0, active boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.recipes(id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade, inventory_item_id uuid not null references public.inventory_items(id) on delete cascade, qty_per_unit numeric not null check(qty_per_unit>0), unique(product_id,inventory_item_id));
create table if not exists public.stock_movements(id uuid primary key default gen_random_uuid(), inventory_item_id uuid not null references public.inventory_items(id), type text not null check(type in ('purchase','adjustment','sale','waste','return')), qty numeric not null, reference_id uuid, note text, created_by uuid references public.profiles(id), created_at timestamptz not null default now());

create table if not exists public.settlements(id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), outlet_id uuid references public.outlets(id), service_day date not null, cash_total integer not null default 0, upi_total integer not null default 0, pos_total integer not null default 0, gross_sales integer not null default 0, discounts integer not null default 0, refunds integer not null default 0, expected_cash integer not null default 0, actual_cash integer, variance integer, status text not null default 'open', closed_by uuid references public.profiles(id), notes text, created_at timestamptz not null default now(), closed_at timestamptz);
create table if not exists public.qr_tokens(id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), outlet_id uuid references public.outlets(id), token text unique not null, label text, active boolean not null default true, created_at timestamptz not null default now());



-- 1) Add all columns needed by later constraints, indexes, backfills, policies and RPCs.
-- Repair tables left behind by earlier partial attempts: CREATE TABLE IF NOT EXISTS
-- does not retrofit columns into a table that already exists.
alter table public.outlets add column if not exists organization_id uuid;
alter table public.combos add column if not exists organization_id uuid references public.organizations(id);
alter table public.inventory_items add column if not exists organization_id uuid references public.organizations(id);
alter table public.settlements add column if not exists organization_id uuid references public.organizations(id);
alter table public.qr_tokens add column if not exists organization_id uuid references public.organizations(id);
alter table public.audit_logs add column if not exists organization_id uuid references public.organizations(id);
alter table public.outlet_day_counters add column if not exists organization_id uuid references public.organizations(id);
alter table public.profiles add column if not exists organization_id uuid references public.organizations(id);
alter table public.profiles add column if not exists outlet_id uuid references public.outlets(id);
alter table public.products add column if not exists organization_id uuid references public.organizations(id);
alter table public.products add column if not exists outlet_id uuid references public.outlets(id);
alter table public.products add column if not exists food_cost integer not null default 0;
alter table public.discounts add column if not exists organization_id uuid references public.organizations(id);
alter table public.app_settings add column if not exists event_start_date date;
alter table public.app_settings add column if not exists event_end_date date;
alter table public.app_settings add column if not exists event_location text;
alter table public.app_settings add column if not exists expected_visitors integer default 0;
alter table public.app_settings add column if not exists number_stalls integer default 1;
alter table public.app_settings add column if not exists number_cashiers integer default 1;
alter table public.app_settings add column if not exists number_kitchen_stations integer default 3;
alter table public.app_settings add column if not exists event_mode boolean default true;
alter table public.app_settings add column if not exists onboarding_completed boolean default false;
alter table public.app_settings add column if not exists organization_id uuid references public.organizations(id);
alter table public.app_settings add column if not exists outlet_id uuid references public.outlets(id);
alter table public.orders add column if not exists organization_id uuid references public.organizations(id);
alter table public.orders add column if not exists outlet_id uuid references public.outlets(id);
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists client_order_id text;
alter table public.orders add column if not exists device_id text;
alter table public.orders add column if not exists version integer not null default 1;
alter table public.order_items add column if not exists combo_id uuid references public.combos(id);
alter table public.order_items add column if not exists food_cost integer not null default 0;
alter table public.order_items add column if not exists line_type text not null default 'product';
alter table public.order_items alter column product_id drop not null;
alter table public.products add column if not exists unit_type text not null default 'piece';
alter table public.products drop constraint if exists products_unit_type_check;
alter table public.products add constraint products_unit_type_check check(unit_type in ('piece','kg','litre'));
alter table public.order_items add column if not exists unit_type text not null default 'piece';
alter table public.order_items drop constraint if exists order_items_unit_type_check;
alter table public.order_items add constraint order_items_unit_type_check check(unit_type in ('piece','kg','litre'));
alter table public.order_items alter column qty type numeric(12,3) using qty::numeric;
alter table public.order_items drop constraint if exists order_items_qty_check;
alter table public.order_items add constraint order_items_qty_check check(qty > 0);

alter table public.orders add column if not exists order_type text not null default 'counter';
alter table public.orders alter column client_order_id type text using client_order_id::text;

-- 2) Ensure a default organization/outlet exists before assigning existing records.
insert into public.organizations(id,name) select gen_random_uuid(),'FoodDesk Default Organization' where not exists(select 1 from public.organizations);
update public.outlets set organization_id=(select id from public.organizations order by created_at limit 1) where organization_id is null;
insert into public.outlets(organization_id,name,code) select id,'Main Outlet','MAIN' from public.organizations o where not exists(select 1 from public.outlets where organization_id=o.id);
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.outlets'::regclass and conname='outlets_organization_id_fkey') then
    alter table public.outlets add constraint outlets_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
  end if;
end $$;
create unique index if not exists outlets_organization_code_idx on public.outlets(organization_id,code);
insert into public.app_settings(id,features) values(1,'{}') on conflict(id) do nothing;

-- 3) Backfill legacy records before creating organization/outlet indexes and counters.
update public.profiles set organization_id=(select id from public.organizations order by created_at limit 1) where organization_id is null;
update public.profiles p set outlet_id=(select id from public.outlets where organization_id=p.organization_id order by created_at limit 1) where outlet_id is null;
update public.app_settings set organization_id=(select id from public.organizations order by created_at limit 1),outlet_id=(select id from public.outlets order by created_at limit 1) where organization_id is null;
update public.products set organization_id=(select id from public.organizations order by created_at limit 1),outlet_id=(select id from public.outlets order by created_at limit 1) where organization_id is null;
update public.discounts set organization_id=(select id from public.organizations order by created_at limit 1) where organization_id is null;
update public.orders set organization_id=(select id from public.organizations order by created_at limit 1),outlet_id=(select id from public.outlets order by created_at limit 1) where organization_id is null;

-- 4) Add constraints/indexes and migrate existing order counters.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('admin','owner','manager','cashier','kitchen','runner','viewer','treasurer'));
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check(status in ('new','preparing','ready','delivered','completed','cancelled'));
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check(payment_method in ('cash','upi','pos'));
alter table public.orders add column if not exists order_type text default 'counter';
alter table public.orders drop constraint if exists orders_order_type_check;
alter table public.orders add constraint orders_order_type_check check(order_type in ('counter','takeaway','dine_in','qr','online','event'));
alter table public.order_items drop constraint if exists order_items_status_check;
alter table public.order_items add constraint order_items_status_check check(status in ('new','done','cancelled'));
alter table public.order_items drop constraint if exists order_items_station_check;
alter table public.order_items add constraint order_items_station_check check(station in ('waffle','chole','pav'));
alter table public.orders drop constraint if exists orders_service_day_order_no_key;
create unique index if not exists orders_org_outlet_day_no_idx on public.orders(organization_id,outlet_id,service_day,order_no);
insert into public.outlet_day_counters(organization_id,outlet_id,service_day,last_order_no)
select organization_id,outlet_id,service_day,max(order_no) from public.orders where organization_id is not null and outlet_id is not null group by organization_id,outlet_id,service_day
on conflict(organization_id,outlet_id,service_day) do update set last_order_no=greatest(public.outlet_day_counters.last_order_no,excluded.last_order_no);

create index if not exists products_station_idx on public.products(station,sort_order);
create index if not exists orders_day_idx on public.orders(service_day,created_at);
create index if not exists orders_status_idx on public.orders(status,created_at);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists stock_low_idx on public.inventory_items(current_qty,reorder_level);

-- 5) Install v4 functions, policies, seed rows and realtime publication entries.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ declare v_org uuid; v_outlet uuid; begin select id into v_org from public.organizations order by created_at limit 1; select id into v_outlet from public.outlets where organization_id=v_org order by created_at limit 1; insert into public.profiles(id,email,display_name,role,active,organization_id,outlet_id) values(new.id,coalesce(new.email,''),coalesce(nullif(new.raw_user_meta_data->>'display_name',''),split_part(coalesce(new.email,''),'@',1)),'cashier',true,v_org,v_outlet) on conflict(id) do update set email=excluded.email; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users; create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() and active=true; $$;
create or replace function public.current_org() returns uuid language sql stable security definer set search_path=public as $$ select organization_id from public.profiles where id=auth.uid() and active=true; $$;
create or replace function public.current_outlet() returns uuid language sql stable security definer set search_path=public as $$ select outlet_id from public.profiles where id=auth.uid() and active=true; $$;
create or replace function public.is_manager() returns boolean language sql stable security definer set search_path=public as $$ select coalesce(public.current_role(),'') in ('admin','owner','manager'); $$;

create or replace function public.bootstrap_admin(p_email text) returns void language plpgsql security definer set search_path=public as $$ begin update public.profiles set role='owner',active=true where lower(email)=lower(p_email); end; $$;
revoke all on function public.bootstrap_admin(text) from public,anon,authenticated;

-- Secure order placement: server calculates every price, discount and combo.
create or replace function public.place_order(p_payment_method text,p_items jsonb,p_covers integer default 1,p_notes text default null,p_token_no text default null,p_discount_id uuid default null,p_custom_discount_type text default null,p_custom_discount_value integer default null,p_cash_received integer default null,p_order_type text default 'counter',p_customer_name text default null,p_customer_phone text default null,p_client_order_id text default null,p_device_id text default null)
returns public.orders language plpgsql security definer set search_path=public as $$
declare v_org uuid:=public.current_org(); v_outlet uuid:=public.current_outlet(); v_day date:=case when extract(hour from now()) < coalesce((select service_day_cutoff_hour from public.app_settings where id=1),5) then current_date-1 else current_date end; v_no integer; v_order public.orders; v_sub integer:=0; v_discount integer:=0; v_item jsonb; v_product public.products; v_combo public.combos; v_ci record; v_base integer; v_alloc integer; v_combo_total integer; v_added integer;
begin
 if coalesce(public.current_role(),'') not in ('admin','owner','manager','cashier') then raise exception 'Not allowed'; end if;
 if p_payment_method not in ('cash','upi','pos') then raise exception 'Invalid payment method'; end if;
 if p_order_type not in ('counter','takeaway','dine_in','qr','online','event') then raise exception 'Invalid order type'; end if;
 if p_client_order_id is not null then select * into v_order from public.orders where organization_id=v_org and client_order_id=p_client_order_id limit 1; if v_order.id is not null then return v_order; end if; end if;
 insert into public.outlet_day_counters(organization_id,outlet_id,service_day,last_order_no) values(v_org,v_outlet,v_day,0) on conflict(organization_id,outlet_id,service_day) do nothing;
 update public.outlet_day_counters set last_order_no=last_order_no+1 where organization_id=v_org and outlet_id=v_outlet and service_day=v_day returning last_order_no into v_no;
 insert into public.orders(organization_id,outlet_id,order_no,service_day,status,payment_method,covers,notes,token_no,cash_received,order_type,customer_name,customer_phone,created_by,client_order_id,device_id) values(v_org,v_outlet,v_no,v_day,'new',p_payment_method,greatest(1,p_covers),nullif(trim(p_notes),''),nullif(trim(p_token_no),''),p_cash_received, p_order_type,nullif(trim(p_customer_name),''),nullif(trim(p_customer_phone),''),auth.uid(),p_client_order_id,p_device_id) returning * into v_order;
 for v_item in select * from jsonb_array_elements(p_items) loop
   if (v_item ? 'combo_id') and nullif(v_item->>'combo_id','') is not null then
     select * into v_combo from public.combos where id=(v_item->>'combo_id')::uuid and active=true and organization_id=v_org;
     if v_combo.id is null then raise exception 'Combo not found'; end if;
     v_combo_total:=0; v_added:=0; select coalesce(sum(p.price*ci.qty),0) into v_base from public.combo_items ci join public.products p on p.id=ci.product_id where ci.combo_id=v_combo.id;
     for v_ci in select ci.*,p.name,p.price,p.food_cost,p.station from public.combo_items ci join public.products p on p.id=ci.product_id where ci.combo_id=v_combo.id loop
       v_alloc:=case when v_base>0 then round(v_combo.price*v_ci.price*v_ci.qty/v_base) else 0 end; v_added:=v_added+v_alloc;
       insert into public.order_items(order_id,product_id,combo_id,product_name,station,qty,price,food_cost,status,line_type) values(v_order.id,v_ci.product_id,v_combo.id,v_ci.name,v_ci.station,v_ci.qty*(v_item->>'qty')::integer,v_alloc,v_ci.food_cost,'new','combo');
       v_sub:=v_sub+v_alloc*(v_item->>'qty')::integer;
     end loop;
   else
     select * into v_product from public.products where id=(v_item->>'product_id')::uuid and active=true and organization_id=v_org;
     if v_product.id is null then raise exception 'Product not found or inactive'; end if;
     insert into public.order_items(order_id,product_id,product_name,station,qty,price,food_cost,unit_type,status,line_type) values(v_order.id,v_product.id,v_product.name,v_product.station,(v_item->>'qty')::numeric,v_product.price,v_product.food_cost,v_product.unit_type,'new','product');
     v_sub:=v_sub+round(v_product.price*(v_item->>'qty')::numeric);
   end if;
 end loop;
 update public.inventory_items i set current_qty=i.current_qty-r.used_qty from (select r.inventory_item_id,sum(r.qty_per_unit*oi.qty) used_qty from public.order_items oi join public.recipes r on r.product_id=oi.product_id where oi.order_id=v_order.id and oi.status='new' group by r.inventory_item_id) r where i.id=r.inventory_item_id;
 if v_sub<=0 then raise exception 'Order has no valid items'; end if;
 if p_discount_id is not null then
   select case when type='percent' then least(coalesce(max_discount_amount,100000000),round(v_sub*value/100.0)) else least(v_sub,value) end into v_discount from public.discounts where id=p_discount_id and active=true and organization_id=v_org and v_sub>=min_order_amount;
   if v_discount is null then raise exception 'Discount is invalid or minimum order is not met'; end if;
 elsif p_custom_discount_value is not null then
   if p_custom_discount_type='percent' then if p_custom_discount_value>(select max_custom_discount_percent from public.app_settings where id=1) then raise exception 'Custom discount exceeds limit'; end if; v_discount:=round(v_sub*p_custom_discount_value/100.0); else v_discount:=least(v_sub,p_custom_discount_value); end if;
 end if;
 update public.orders set subtotal=v_sub,discount_amount=greatest(0,v_discount),discount_id=p_discount_id,discount_name=(select name from public.discounts where id=p_discount_id),discount_type=(select type from public.discounts where id=p_discount_id),discount_value=(select value from public.discounts where id=p_discount_id),total=greatest(0,v_sub-v_discount),change_due=case when p_payment_method='cash' and p_cash_received is not null then greatest(0,p_cash_received-greatest(0,v_sub-v_discount)) else null end,updated_at=now() where id=v_order.id returning * into v_order;
 insert into public.order_status_history(order_id,to_status,actor_id) values(v_order.id,'new',auth.uid());
 insert into public.audit_logs(actor_id,organization_id,action,entity_type,entity_id,details) values(auth.uid(),v_org,'create','order',v_order.id,jsonb_build_object('client_order_id',p_client_order_id));
 return v_order;
end; $$;
grant execute on function public.place_order(text,jsonb,integer,text,text,uuid,text,integer,integer,text,text,text,text,text) to authenticated;
drop function if exists public.qr_menu(text);
create or replace function public.qr_menu(p_token text) returns table(id uuid,name text,price integer,station text,category text,unit_type text) language sql security definer set search_path=public as $$ select p.id,p.name,p.price,p.station,p.category,p.unit_type from public.products p join public.qr_tokens q on q.organization_id=p.organization_id where q.token=p_token and q.active=true and p.active=true; $$;
grant execute on function public.qr_menu(text) to anon,authenticated;
create or replace function public.place_qr_order(p_token text,p_items jsonb,p_customer_name text default null,p_customer_phone text default null,p_notes text default null) returns public.orders language plpgsql security definer set search_path=public as $$ declare v_qr public.qr_tokens; v_org uuid; v_outlet uuid; v_day date:=current_date; v_no integer; v_order public.orders; v_item jsonb; v_product public.products; v_sub integer:=0; begin select * into v_qr from public.qr_tokens where token=p_token and active=true; if v_qr.id is null then raise exception 'QR code is invalid or inactive'; end if; v_org:=v_qr.organization_id;v_outlet:=v_qr.outlet_id; insert into public.outlet_day_counters(organization_id,outlet_id,service_day,last_order_no) values(v_org,v_outlet,v_day,0) on conflict(organization_id,outlet_id,service_day) do nothing;update public.outlet_day_counters set last_order_no=last_order_no+1 where organization_id=v_org and outlet_id=v_outlet and service_day=v_day returning last_order_no into v_no;insert into public.orders(organization_id,outlet_id,order_no,service_day,status,payment_method,covers,notes,order_type,customer_name,customer_phone) values(v_org,v_outlet,v_no,v_day,'new','cash',1,nullif(trim(p_notes),''),'qr',nullif(trim(p_customer_name),''),nullif(trim(p_customer_phone),'')) returning * into v_order;for v_item in select * from jsonb_array_elements(p_items) loop select * into v_product from public.products where id=(v_item->>'product_id')::uuid and active=true and organization_id=v_org;if v_product.id is null then raise exception 'Product unavailable';end if;insert into public.order_items(order_id,product_id,product_name,station,qty,price,food_cost,unit_type,status) values(v_order.id,v_product.id,v_product.name,v_product.station,(v_item->>'qty')::numeric,v_product.price,v_product.food_cost,v_product.unit_type,'new');v_sub:=v_sub+round(v_product.price*(v_item->>'qty')::numeric);end loop;update public.inventory_items i set current_qty=i.current_qty-r.used_qty from (select r.inventory_item_id,sum(r.qty_per_unit*oi.qty) used_qty from public.order_items oi join public.recipes r on r.product_id=oi.product_id where oi.order_id=v_order.id group by r.inventory_item_id) r where i.id=r.inventory_item_id;if v_sub<=0 then raise exception 'Cart is empty';end if;update public.orders set subtotal=v_sub,total=v_sub where id=v_order.id;return (select o from public.orders o where o.id=v_order.id);end;$$;
grant execute on function public.place_qr_order(text,jsonb,text,text,text) to anon,authenticated;


create or replace function public.modify_order(p_order_id uuid,p_items jsonb,p_covers integer,p_notes text,p_order_type text,p_customer_name text,p_customer_phone text) returns public.orders language plpgsql security definer set search_path=public as $$
declare v_old public.orders; v_new public.orders; v_item jsonb; v_product public.products; v_sub integer:=0;
begin
 select * into v_old from public.orders where id=p_order_id and organization_id=public.current_org(); if v_old.id is null then raise exception 'Order not found'; end if;
 if v_old.status in ('ready','delivered','completed','cancelled') then raise exception 'This order can no longer be modified'; end if;
 if public.current_role()='cashier' and v_old.created_by<>auth.uid() then raise exception 'Cashiers can only modify their own orders'; end if;
 update public.order_items set status='cancelled',cancel_reason='Replaced by order modification' where order_id=p_order_id and status<>'cancelled';
 for v_item in select * from jsonb_array_elements(p_items) loop
   select * into v_product from public.products where id=(v_item->>'product_id')::uuid and active=true and organization_id=public.current_org(); if v_product.id is null then raise exception 'Invalid product'; end if;
   insert into public.order_items(order_id,product_id,product_name,station,qty,price,food_cost,unit_type,status,line_type) values(p_order_id,v_product.id,v_product.name,v_product.station,(v_item->>'qty')::numeric,v_product.price,v_product.food_cost,v_product.unit_type,'new','product'); v_sub:=v_sub+round(v_product.price*(v_item->>'qty')::numeric);
 end loop;
 update public.orders set subtotal=v_sub,discount_amount=0,discount_id=null,discount_name=null,discount_type=null,discount_value=null,total=v_sub,covers=greatest(1,p_covers),notes=nullif(trim(p_notes),''),order_type=p_order_type,customer_name=nullif(trim(p_customer_name),''),customer_phone=nullif(trim(p_customer_phone),''),status='preparing',version=version+1,updated_at=now() where id=p_order_id returning * into v_new;
 insert into public.order_status_history(order_id,from_status,to_status,actor_id,note) values(p_order_id,v_old.status,'preparing',auth.uid(),'Order modified');
 insert into public.audit_logs(actor_id,organization_id,action,entity_type,entity_id,details) values(auth.uid(),public.current_org(),'modify','order',p_order_id,jsonb_build_object('previous_total',v_old.total,'new_total',v_new.total));
 return v_new;
end; $$;
grant execute on function public.modify_order(uuid,jsonb,integer,text,text,text,text) to authenticated;

create or replace function public.cancel_order(p_order_id uuid,p_reason text default null) returns public.orders language plpgsql security definer set search_path=public as $$ declare v public.orders; begin select * into v from public.orders where id=p_order_id and organization_id=public.current_org(); if v.id is null then raise exception 'Order not found'; end if; if public.current_role()='cashier' and v.created_by<>auth.uid() then raise exception 'Not allowed'; end if; update public.orders set status='cancelled',updated_at=now() where id=p_order_id returning * into v; update public.order_items set status='cancelled',cancel_reason=coalesce(nullif(trim(p_reason),''),'Order cancelled') where order_id=p_order_id and status<>'cancelled'; insert into public.order_status_history(order_id,from_status,to_status,actor_id,note) values(p_order_id,v.status,'cancelled',auth.uid(),p_reason); return v; end; $$;
grant execute on function public.cancel_order(uuid,text) to authenticated;
create or replace function public.cancel_order_item(p_item_id uuid,p_reason text default null) returns public.order_items language plpgsql security definer set search_path=public as $$ declare v public.order_items; begin select oi.* into v from public.order_items oi join public.orders o on o.id=oi.order_id where oi.id=p_item_id and o.organization_id=public.current_org(); if v.id is null then raise exception 'Item not found'; end if; update public.order_items set status='cancelled',cancel_reason=coalesce(nullif(trim(p_reason),''),'Cancelled') where id=p_item_id returning * into v; return v; end; $$;
grant execute on function public.cancel_order_item(uuid,text) to authenticated;

create or replace function public.start_order(p_order_id uuid) returns public.orders language plpgsql security definer set search_path=public as $$ declare v public.orders; begin if public.current_role() not in ('admin','owner','manager','kitchen') then raise exception 'Not allowed'; end if; update public.orders set status='preparing',updated_at=now() where id=p_order_id and organization_id=public.current_org() and status='new' returning * into v; if v.id is null then raise exception 'Order unavailable'; end if; insert into public.order_status_history(order_id,from_status,to_status,actor_id) values(v.id,'new','preparing',auth.uid()); return v; end; $$;
grant execute on function public.start_order(uuid) to authenticated;
create or replace function public.complete_order_item(p_item_id uuid) returns public.order_items language plpgsql security definer set search_path=public as $$ declare v public.order_items; v_left int; v_from text; begin if public.current_role() not in ('admin','owner','manager','kitchen') then raise exception 'Not allowed'; end if; select status into v_from from public.order_items where id=p_item_id; update public.order_items set status='done' where id=p_item_id and status='new' returning * into v; if v.id is null then raise exception 'Item unavailable'; end if; select count(*) into v_left from public.order_items where order_id=v.order_id and status='new'; update public.orders set status=case when v_left=0 then 'ready' else 'preparing' end,updated_at=now() where id=v.order_id; return v; end; $$;
grant execute on function public.complete_order_item(uuid) to authenticated;
create or replace function public.deliver_order(p_order_id uuid) returns public.orders language plpgsql security definer set search_path=public as $$ declare v public.orders; begin if public.current_role() not in ('admin','owner','manager','runner','kitchen') then raise exception 'Not allowed'; end if; update public.orders set status='delivered',updated_at=now() where id=p_order_id and organization_id=public.current_org() and status='ready' returning * into v; if v.id is null then raise exception 'Order is not ready'; end if; insert into public.order_status_history(order_id,from_status,to_status,actor_id) values(v.id,'ready','delivered',auth.uid()); return v; end; $$;
grant execute on function public.deliver_order(uuid) to authenticated;
create or replace function public.complete_order(p_order_id uuid) returns public.orders language plpgsql security definer set search_path=public as $$ declare v public.orders; begin if public.current_role() not in ('admin','owner','manager','runner','kitchen') then raise exception 'Not allowed'; end if; update public.orders set status='completed',updated_at=now() where id=p_order_id and organization_id=public.current_org() and status in ('ready','delivered') returning * into v; if v.id is null then raise exception 'Order cannot be completed'; end if; insert into public.order_status_history(order_id,from_status,to_status,actor_id) values(v.id,'delivered','completed',auth.uid()); return v; end; $$;
grant execute on function public.complete_order(uuid) to authenticated;
create or replace function public.switch_outlet(p_outlet_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin if not exists(select 1 from public.outlets where id=p_outlet_id and organization_id=public.current_org() and active=true) then raise exception 'Outlet is not available'; end if; update public.profiles set outlet_id=p_outlet_id where id=auth.uid(); end; $$;
grant execute on function public.switch_outlet(uuid) to authenticated;



create or replace function public.refund_order(p_order_id uuid,p_amount integer,p_reason text) returns public.refunds language plpgsql security definer set search_path=public as $$ declare v public.orders; r public.refunds; v_ref int; begin if public.current_role() not in ('admin','owner','manager','treasurer') then raise exception 'Not allowed'; end if; select * into v from public.orders where id=p_order_id and organization_id=public.current_org(); if v.id is null then raise exception 'Order not found'; end if; select coalesce(sum(amount),0) into v_ref from public.refunds where order_id=p_order_id; if p_amount<=0 or v_ref+p_amount>v.total then raise exception 'Refund exceeds refundable amount'; end if; insert into public.refunds(order_id,amount,reason,payment_method,created_by) values(p_order_id,p_amount,p_reason,v.payment_method,auth.uid()) returning * into r; insert into public.audit_logs(actor_id,organization_id,action,entity_type,entity_id,details) values(auth.uid(),public.current_org(),'refund','order',p_order_id,jsonb_build_object('amount',p_amount,'reason',p_reason)); return r; end; $$;
grant execute on function public.refund_order(uuid,integer,text) to authenticated;

create or replace function public.close_settlement(p_service_day date,p_actual_cash integer,p_notes text) returns public.settlements language plpgsql security definer set search_path=public as $$ declare r public.settlements; v_cash int; v_upi int; v_pos int; v_gross int; v_disc int; v_ref int; begin if public.current_role() not in ('admin','owner','manager','treasurer') then raise exception 'Not allowed'; end if; select coalesce(sum(total) filter(where payment_method='cash' and status<>'cancelled'),0),coalesce(sum(total) filter(where payment_method='upi' and status<>'cancelled'),0),coalesce(sum(total) filter(where payment_method='pos' and status<>'cancelled'),0),coalesce(sum(total) filter(where status<>'cancelled'),0),coalesce(sum(discount_amount) filter(where status<>'cancelled'),0) into v_cash,v_upi,v_pos,v_gross,v_disc from public.orders where organization_id=public.current_org() and service_day=p_service_day; select coalesce(sum(amount),0) into v_ref from public.refunds r join public.orders o on o.id=r.order_id where o.organization_id=public.current_org() and o.service_day=p_service_day; insert into public.settlements(organization_id,outlet_id,service_day,cash_total,upi_total,pos_total,gross_sales,discounts,refunds,expected_cash,actual_cash,variance,status,closed_by,notes,closed_at) values(public.current_org(),public.current_outlet(),p_service_day,v_cash,v_upi,v_pos,v_gross,v_disc,v_ref,v_cash,p_actual_cash,p_actual_cash-v_cash,'closed',auth.uid(),p_notes,now()) returning * into r; return r; end; $$;
grant execute on function public.close_settlement(date,integer,text) to authenticated;

-- RLS
alter table public.organizations enable row level security; alter table public.outlets enable row level security; alter table public.profiles enable row level security; alter table public.app_settings enable row level security; alter table public.products enable row level security; alter table public.discounts enable row level security; alter table public.combos enable row level security; alter table public.combo_items enable row level security; alter table public.orders enable row level security; alter table public.order_items enable row level security; alter table public.order_status_history enable row level security; alter table public.refunds enable row level security; alter table public.audit_logs enable row level security; alter table public.inventory_items enable row level security; alter table public.recipes enable row level security; alter table public.stock_movements enable row level security; alter table public.settlements enable row level security; alter table public.qr_tokens enable row level security;

drop policy if exists products_all on public.products; drop policy if exists products_write on public.products; drop policy if exists discounts_all on public.discounts; drop policy if exists discounts_write on public.discounts; drop policy if exists combos_write on public.combos; drop policy if exists combo_items_all on public.combo_items; drop policy if exists orders_all on public.orders; drop policy if exists items_all on public.order_items; drop policy if exists history_all on public.order_status_history; drop policy if exists refund_read on public.refunds; drop policy if exists audit_read on public.audit_logs; drop policy if exists inventory_all on public.inventory_items; drop policy if exists recipes_all on public.recipes; drop policy if exists stock_all on public.stock_movements; drop policy if exists settlement_all on public.settlements; drop policy if exists qr_all on public.qr_tokens;
drop policy if exists org_read on public.organizations; drop policy if exists outlet_read on public.outlets; drop policy if exists profiles_read on public.profiles; drop policy if exists settings_all on public.app_settings; create policy org_read on public.organizations for select to authenticated using(id=public.current_org());
drop policy if exists outlet_read on public.outlets; create policy outlet_read on public.outlets for select to authenticated using(organization_id=public.current_org());
drop policy if exists profiles_read on public.profiles; create policy profiles_read on public.profiles for select to authenticated using(organization_id=public.current_org() and (id=auth.uid() or public.current_role() in ('admin','owner','manager')));
drop policy if exists settings_all on public.app_settings; create policy settings_all on public.app_settings for all to authenticated using(organization_id=public.current_org() or organization_id is null) with check(public.current_role() in ('admin','owner','manager'));
drop policy if exists products_all on public.products; create policy products_all on public.products for select to authenticated using(organization_id=public.current_org()); create policy products_write on public.products for all to authenticated using(public.current_role() in ('admin','owner','manager') and organization_id=public.current_org()) with check(public.current_role() in ('admin','owner','manager') and organization_id=public.current_org());
drop policy if exists discounts_all on public.discounts; create policy discounts_all on public.discounts for select to authenticated using(organization_id=public.current_org()); create policy discounts_write on public.discounts for all to authenticated using(public.current_role() in ('admin','owner','manager') and organization_id=public.current_org()) with check(public.current_role() in ('admin','owner','manager') and organization_id=public.current_org());
drop policy if exists combos_read on public.combos; create policy combos_read on public.combos for select to authenticated using(organization_id=public.current_org()); create policy combos_write on public.combos for all to authenticated using(public.current_role() in ('admin','owner','manager') and organization_id=public.current_org()) with check(public.current_role() in ('admin','owner','manager') and organization_id=public.current_org());
drop policy if exists combo_items_all on public.combo_items; create policy combo_items_all on public.combo_items for all to authenticated using(exists(select 1 from public.combos c where c.id=combo_id and c.organization_id=public.current_org())) with check(exists(select 1 from public.combos c where c.id=combo_id and c.organization_id=public.current_org()));
drop policy if exists orders_all on public.orders; create policy orders_all on public.orders for select to authenticated using(organization_id=public.current_org() and (public.current_role() in ('admin','owner','manager','kitchen','runner','treasurer','viewer') or created_by=auth.uid()));
drop policy if exists items_all on public.order_items; create policy items_all on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.organization_id=public.current_org()));
drop policy if exists history_all on public.order_status_history; create policy history_all on public.order_status_history for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.organization_id=public.current_org()));
drop policy if exists refund_read on public.refunds; create policy refund_read on public.refunds for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.organization_id=public.current_org()));
drop policy if exists audit_read on public.audit_logs; create policy audit_read on public.audit_logs for select to authenticated using(organization_id=public.current_org() and public.current_role() in ('admin','owner','manager'));
drop policy if exists inventory_all on public.inventory_items; create policy inventory_all on public.inventory_items for all to authenticated using(organization_id=public.current_org()) with check(organization_id=public.current_org());
drop policy if exists recipes_all on public.recipes; create policy recipes_all on public.recipes for all to authenticated using(exists(select 1 from public.products p where p.id=product_id and p.organization_id=public.current_org())) with check(exists(select 1 from public.products p where p.id=product_id and p.organization_id=public.current_org()));
drop policy if exists stock_all on public.stock_movements; create policy stock_all on public.stock_movements for all to authenticated using(exists(select 1 from public.inventory_items i where i.id=inventory_item_id and i.organization_id=public.current_org())) with check(exists(select 1 from public.inventory_items i where i.id=inventory_item_id and i.organization_id=public.current_org()));
drop policy if exists settlement_all on public.settlements; create policy settlement_all on public.settlements for select to authenticated using(organization_id=public.current_org());
drop policy if exists qr_all on public.qr_tokens; create policy qr_all on public.qr_tokens for all to authenticated using(organization_id=public.current_org()) with check(organization_id=public.current_org());

-- Seed default menu if empty.
insert into public.products(organization_id,outlet_id,name,price,food_cost,station,category,sort_order) select (select id from public.organizations limit 1),(select id from public.outlets limit 1),'Waffle',100,30,'waffle','Waffle',1 where not exists(select 1 from public.products);
insert into public.products(organization_id,outlet_id,name,price,food_cost,station,category,sort_order) select (select id from public.organizations limit 1),(select id from public.outlets limit 1),'Chole Kulche',120,40,'chole','Chaat',2 where not exists(select 1 from public.products where name='Chole Kulche');
insert into public.products(organization_id,outlet_id,name,price,food_cost,station,category,sort_order) select (select id from public.organizations limit 1),(select id from public.outlets limit 1),'Pav Bataka',60,20,'pav','Street Food',3 where not exists(select 1 from public.products where name='Pav Bataka');

-- Realtime
DO $$ BEGIN alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; END $$;
DO $$ BEGIN alter publication supabase_realtime add table public.order_items; exception when duplicate_object then null; END $$;
DO $$ BEGIN alter publication supabase_realtime add table public.products; exception when duplicate_object then null; END $$;
DO $$ BEGIN alter publication supabase_realtime add table public.combos; exception when duplicate_object then null; END $$;
DO $$ BEGIN alter publication supabase_realtime add table public.inventory_items; exception when duplicate_object then null; END $$;
