create extension if not exists pgcrypto;

create table if not exists products(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price integer not null default 0 check(price >= 0),
  station text not null check(station in ('waffle','chole','pav')),
  active boolean not null default true,
  created_at timestamptz default now()
);

create sequence if not exists event_order_no_seq start 1;

create table if not exists orders(
  id uuid primary key default gen_random_uuid(),
  order_no integer not null default nextval('event_order_no_seq'),
  service_day date not null default current_date,
  status text not null default 'new' check(status in ('new','preparing','ready','cancelled')),
  total integer not null default 0 check(total >= 0),
  payment_method text not null default 'cash' check(payment_method in ('cash','upi')),
  created_at timestamptz default now()
);

create table if not exists order_items(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  product_name text not null,
  station text not null check(station in ('waffle','chole','pav')),
  qty integer not null check(qty > 0),
  price integer not null check(price >= 0),
  status text not null default 'new' check(status in ('new','done'))
);

create index if not exists orders_service_day_idx on orders(service_day,created_at);
create index if not exists order_items_order_idx on order_items(order_id);
create index if not exists order_items_station_idx on order_items(station,status);

alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

drop policy if exists "public products read" on products;
drop policy if exists "public products insert" on products;
drop policy if exists "public products update" on products;
drop policy if exists "public orders read" on orders;
drop policy if exists "public orders insert" on orders;
drop policy if exists "public orders update" on orders;
drop policy if exists "public items read" on order_items;
drop policy if exists "public items insert" on order_items;
drop policy if exists "public items update" on order_items;

create policy "public products read" on products for select using (true);
create policy "public products insert" on products for insert with check (true);
create policy "public products update" on products for update using (true);
create policy "public orders read" on orders for select using (true);
create policy "public orders update" on orders for update using (true);
create policy "public items read" on order_items for select using (true);
create policy "public items update" on order_items for update using (true);

-- The cashier submits the entire order atomically. This prevents the kitchen from
-- seeing an empty order between creation of the order header and its line items.
create or replace function place_order(
  p_total integer,
  p_payment_method text,
  p_items jsonb
) returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
  v_item jsonb;
  v_product products;
  v_qty integer;
  v_product_id uuid;
begin
  if p_total < 0 then raise exception 'Invalid total'; end if;
  if p_payment_method not in ('cash','upi') then raise exception 'Invalid payment method'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Order has no items'; end if;

  insert into orders(total,payment_method) values(p_total,p_payment_method) returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::integer;
    if v_qty is null or v_qty <= 0 then raise exception 'Invalid quantity'; end if;

    select * into v_product from products where id = v_product_id and active = true;
    if not found then raise exception 'Product is unavailable'; end if;

    insert into order_items(order_id,product_id,product_name,station,qty,price,status)
    values(v_order.id,v_product.id,v_product.name,v_product.station,v_qty,v_product.price,'new');
  end loop;

  return v_order;
end;
$$;

grant execute on function place_order(integer,text,jsonb) to anon,authenticated;

insert into products(name,price,station)
select * from (values
  ('Waffle',50,'waffle'),
  ('Chole Kulche',60,'chole'),
  ('Pav Bataka',40,'pav')
) v(name,price,station)
where not exists(select 1 from products);

do $$ begin alter publication supabase_realtime add table orders; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table order_items; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table products; exception when duplicate_object then null; end $$;
