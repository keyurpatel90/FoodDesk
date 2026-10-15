-- Fractional qty + sell unit (piece / kg / litre).
-- Required so 200 g of a ₹600/kg product stores as qty 0.200 and prices as ₹120.

alter table public.products add column if not exists unit_type text not null default 'piece';
alter table public.products drop constraint if exists products_unit_type_check;
alter table public.products add constraint products_unit_type_check check(unit_type in ('piece','kg','litre'));

alter table public.order_items add column if not exists unit_type text not null default 'piece';
alter table public.order_items drop constraint if exists order_items_unit_type_check;
alter table public.order_items add constraint order_items_unit_type_check check(unit_type in ('piece','kg','litre'));

alter table public.order_items alter column qty type numeric(12,3) using qty::numeric;
alter table public.order_items drop constraint if exists order_items_qty_check;
alter table public.order_items add constraint order_items_qty_check check(qty > 0);

drop function if exists public.qr_menu(text);
create or replace function public.qr_menu(p_token text)
returns table(id uuid, name text, price integer, station text, category text, unit_type text)
language sql security definer set search_path=public as $$
  select p.id, p.name, p.price, p.station, p.category, p.unit_type
  from public.products p
  join public.qr_tokens q on q.organization_id = p.organization_id
  where q.token = p_token and q.active = true and p.active = true;
$$;
grant execute on function public.qr_menu(text) to anon, authenticated;
