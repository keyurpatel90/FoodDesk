-- FoodDesk multi-tenant hardening (apply AFTER schema-v4-upgrade.sql)
-- Adds organization bootstrap, outlet memberships, tenant-scoped settings and RLS.
begin;

alter table public.profiles add column if not exists is_super_admin boolean not null default false;
create unique index if not exists outlets_id_org_unique_idx on public.outlets(id,organization_id);
create table if not exists public.user_outlet_access (
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  role text not null default 'cashier' check(role in ('owner','manager','cashier','kitchen','runner','viewer','admin','treasurer')),
  created_at timestamptz not null default now(),
  primary key(user_id,outlet_id),
  constraint user_outlet_access_org_outlet_fk foreign key(outlet_id,organization_id) references public.outlets(id,organization_id) on delete cascade
);

-- V4 used a singleton app_settings row (id=1); multi-tenant requires one row per outlet.
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.app_settings'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%id%1%' loop
    execute format('alter table public.app_settings drop constraint %I',c.conname);
  end loop;
end $$;
create sequence if not exists public.app_settings_id_seq;
select setval('public.app_settings_id_seq', greatest(coalesce((select max(id) from public.app_settings),0),1));
alter table public.app_settings alter column id set default nextval('public.app_settings_id_seq');
create unique index if not exists app_settings_org_outlet_unique_idx on public.app_settings(organization_id,outlet_id) where organization_id is not null and outlet_id is not null;
insert into public.app_settings(event_name,organization_id,outlet_id,onboarding_completed) select o.name,o.organization_id,o.id,false from public.outlets o where not exists(select 1 from public.app_settings s where s.organization_id=o.organization_id and s.outlet_id=o.id);

-- New auth users start unassigned; never silently attach a user to the first tenant.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,display_name,role,active,organization_id,outlet_id)
  values(new.id,coalesce(new.email,''),coalesce(nullif(new.raw_user_meta_data->>'display_name',''),split_part(coalesce(new.email,''),'@',1)),'cashier',true,null,null)
  on conflict(id) do update set email=excluded.email;
  return new;
end $$;

create or replace function public.is_super_admin() returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select is_super_admin or role='super_admin' from public.profiles where id=auth.uid() and active=true),false)
$$;
create or replace function public.current_org() returns uuid language sql stable security definer set search_path=public as $$
  select organization_id from public.profiles where id=auth.uid() and active=true
$$;
create or replace function public.current_outlet() returns uuid language sql stable security definer set search_path=public as $$
  select outlet_id from public.profiles where id=auth.uid() and active=true
$$;

-- First-user setup is atomic. It creates the organization, first outlet, profile assignment,
-- membership, and outlet-specific settings in one transaction.
create or replace function public.create_organization_with_outlet(p_organization_name text,p_outlet_name text,p_outlet_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_outlet uuid; v_user public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_user from public.profiles where id=auth.uid() and active=true for update;
  if v_user.id is null then raise exception 'Active profile not found'; end if;
  if v_user.organization_id is not null and v_user.outlet_id is not null then
    return jsonb_build_object('organization_id',v_user.organization_id,'outlet_id',v_user.outlet_id);
  end if;
  insert into public.organizations(name) values(coalesce(nullif(trim(p_organization_name),''),'My Organization')) returning id into v_org;
  insert into public.outlets(organization_id,name,code) values(v_org,coalesce(nullif(trim(p_outlet_name),''),'Main Outlet'),upper(coalesce(nullif(trim(p_outlet_code),''),'MAIN'))) returning id into v_outlet;
  update public.profiles set organization_id=v_org,outlet_id=v_outlet,role='owner' where id=auth.uid();
  insert into public.user_outlet_access(user_id,organization_id,outlet_id,role) values(auth.uid(),v_org,v_outlet,'owner') on conflict do nothing;
  insert into public.app_settings(event_name,organization_id,outlet_id,onboarding_completed) values(coalesce(nullif(trim(p_organization_name),''),'FoodDesk Event'),v_org,v_outlet,false);
  return jsonb_build_object('organization_id',v_org,'outlet_id',v_outlet);
end $$;
revoke all on function public.create_organization_with_outlet(text,text,text) from public,anon;
grant execute on function public.create_organization_with_outlet(text,text,text) to authenticated;

-- Backfill existing users and their current outlet membership without moving tenant data.
insert into public.user_outlet_access(user_id,organization_id,outlet_id,role)
select p.id,p.organization_id,p.outlet_id,p.role from public.profiles p
where p.organization_id is not null and p.outlet_id is not null
on conflict(user_id,outlet_id) do update set organization_id=excluded.organization_id,role=excluded.role;

-- Every outlet-scoped row must have a valid outlet from the same organization.
do $$ begin
  if not exists(select 1 from pg_constraint where conname='products_outlet_org_fk') then
    alter table public.products add constraint products_outlet_org_fk foreign key(outlet_id,organization_id) references public.outlets(id,organization_id) not valid;
  end if;
end $$;

alter table public.user_outlet_access enable row level security;
drop policy if exists user_outlet_access_read on public.user_outlet_access;
create policy user_outlet_access_read on public.user_outlet_access for select to authenticated using(public.is_super_admin() or (organization_id=public.current_org() and (user_id=auth.uid() or public.current_role() in ('owner','admin','manager'))));
drop policy if exists user_outlet_access_owner_write on public.user_outlet_access;
create policy user_outlet_access_owner_write on public.user_outlet_access for all to authenticated using(public.is_super_admin() or (organization_id=public.current_org() and public.current_role() in ('owner','admin'))) with check(public.is_super_admin() or (organization_id=public.current_org() and public.current_role() in ('owner','admin')));

-- Restrict tenant access. Super admins can see/manage all tenants; normal users require membership.
drop policy if exists org_read on public.organizations;
create policy org_read on public.organizations for select to authenticated using(public.is_super_admin() or id=public.current_org());
drop policy if exists org_super_write on public.organizations; create policy org_super_write on public.organizations for all to authenticated using(public.is_super_admin()) with check(public.is_super_admin());
drop policy if exists outlet_read on public.outlets;
create policy outlet_read on public.outlets for select to authenticated using(public.is_super_admin() or (organization_id=public.current_org() and exists(select 1 from public.user_outlet_access a where a.user_id=auth.uid() and a.outlet_id=outlets.id)));
drop policy if exists outlet_super_write on public.outlets; create policy outlet_super_write on public.outlets for all to authenticated using(public.is_super_admin()) with check(public.is_super_admin());
drop policy if exists outlet_owner_write on public.outlets; create policy outlet_owner_write on public.outlets for insert to authenticated with check(organization_id=public.current_org() and public.current_role() in ('owner','admin'));
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using(public.is_super_admin() or id=auth.uid() or (organization_id=public.current_org() and public.current_role() in ('admin','owner','manager')));
drop policy if exists products_all on public.products; drop policy if exists products_write on public.products;
drop policy if exists products_read_tenant on public.products;
create policy products_read_tenant on public.products for select to authenticated using(public.is_super_admin() or (organization_id=public.current_org() and outlet_id=public.current_outlet()));
drop policy if exists products_write_tenant on public.products;
create policy products_write_tenant on public.products for all to authenticated using(public.is_super_admin() or (organization_id=public.current_org() and outlet_id=public.current_outlet() and public.current_role() in ('admin','owner','manager'))) with check(public.is_super_admin() or (organization_id=public.current_org() and outlet_id=public.current_outlet() and public.current_role() in ('admin','owner','manager')));
drop policy if exists settings_all on public.app_settings;
drop policy if exists settings_tenant on public.app_settings;
create policy settings_tenant on public.app_settings for all to authenticated using(public.is_super_admin() or (organization_id=public.current_org() and exists(select 1 from public.user_outlet_access a where a.user_id=auth.uid() and a.outlet_id=app_settings.outlet_id))) with check(public.is_super_admin() or (organization_id=public.current_org() and outlet_id=public.current_outlet() and public.current_role() in ('admin','owner','manager')));
drop policy if exists inventory_all on public.inventory_items;
drop policy if exists inventory_tenant on public.inventory_items;
create policy inventory_tenant on public.inventory_items for all to authenticated using(public.is_super_admin() or (organization_id=public.current_org() and outlet_id=public.current_outlet())) with check(public.is_super_admin() or (organization_id=public.current_org() and outlet_id=public.current_outlet()));
drop policy if exists discounts_all on public.discounts; drop policy if exists discounts_write on public.discounts;
drop policy if exists discounts_read_tenant on public.discounts;
create policy discounts_read_tenant on public.discounts for select to authenticated using(public.is_super_admin() or organization_id=public.current_org());
drop policy if exists discounts_write_tenant on public.discounts;
create policy discounts_write_tenant on public.discounts for all to authenticated using(public.is_super_admin() or (organization_id=public.current_org() and public.current_role() in ('admin','owner','manager'))) with check(public.is_super_admin() or (organization_id=public.current_org() and public.current_role() in ('admin','owner','manager')));
drop policy if exists combos_read on public.combos; drop policy if exists combos_write on public.combos;
drop policy if exists combos_read_tenant on public.combos;
create policy combos_read_tenant on public.combos for select to authenticated using(public.is_super_admin() or (organization_id=public.current_org() and outlet_id=public.current_outlet()));
drop policy if exists combos_write_tenant on public.combos;
create policy combos_write_tenant on public.combos for all to authenticated using(public.is_super_admin() or (organization_id=public.current_org() and outlet_id=public.current_outlet() and public.current_role() in ('admin','owner','manager'))) with check(public.is_super_admin() or (organization_id=public.current_org() and outlet_id=public.current_outlet() and public.current_role() in ('admin','owner','manager')));

-- Outlet-scope operational data so users do not see another outlet's orders/reports.
drop policy if exists orders_all on public.orders;
drop policy if exists orders_outlet_read on public.orders;
create policy orders_outlet_read on public.orders for select to authenticated using(public.is_super_admin() or (organization_id=public.current_org() and outlet_id=public.current_outlet() and (public.current_role() in ('admin','owner','manager','kitchen','runner','treasurer','viewer') or created_by=auth.uid())));
drop policy if exists items_all on public.order_items;
drop policy if exists items_outlet_read on public.order_items;
create policy items_outlet_read on public.order_items for select to authenticated using(public.is_super_admin() or exists(select 1 from public.orders o where o.id=order_items.order_id and o.organization_id=public.current_org() and o.outlet_id=public.current_outlet()));
drop policy if exists history_all on public.order_status_history;
drop policy if exists history_outlet_read on public.order_status_history;
create policy history_outlet_read on public.order_status_history for select to authenticated using(public.is_super_admin() or exists(select 1 from public.orders o where o.id=order_status_history.order_id and o.organization_id=public.current_org() and o.outlet_id=public.current_outlet()));
drop policy if exists refund_read on public.refunds;
drop policy if exists refund_outlet_read on public.refunds;
create policy refund_outlet_read on public.refunds for select to authenticated using(public.is_super_admin() or exists(select 1 from public.orders o where o.id=refunds.order_id and o.organization_id=public.current_org() and o.outlet_id=public.current_outlet()));
drop policy if exists settlement_all on public.settlements;
drop policy if exists settlement_outlet_read on public.settlements;
create policy settlement_outlet_read on public.settlements for select to authenticated using(public.is_super_admin() or (organization_id=public.current_org() and outlet_id=public.current_outlet()));
drop policy if exists qr_all on public.qr_tokens;
drop policy if exists qr_outlet_all on public.qr_tokens;
create policy qr_outlet_all on public.qr_tokens for all to authenticated using(public.is_super_admin() or (organization_id=public.current_org() and outlet_id=public.current_outlet())) with check(public.is_super_admin() or (organization_id=public.current_org() and outlet_id=public.current_outlet()));

-- Explicit super-admin policies across the remaining tenant-owned tables.
do $$ declare t text; begin
  foreach t in array array['orders','order_items','order_status_history','refunds','audit_logs','stock_movements','recipes','settlements','qr_tokens','outlet_day_counters','combos','combo_items'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists super_admin_all_%I on public.%I',t,t);
      execute format('create policy super_admin_all_%I on public.%I for all to authenticated using(public.is_super_admin()) with check(public.is_super_admin())',t,t);
    end if;
  end loop;
end $$;

-- Outlet switch is permitted only for explicitly assigned outlets.
create or replace function public.switch_outlet(p_outlet_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.user_outlet_access a join public.outlets o on o.id=a.outlet_id where a.user_id=auth.uid() and a.outlet_id=p_outlet_id and o.active=true and (public.is_super_admin() or a.organization_id=public.current_org())) then raise exception 'Outlet is not assigned to this user'; end if;
 update public.profiles set outlet_id=p_outlet_id where id=auth.uid();
end $$;
grant execute on function public.switch_outlet(uuid) to authenticated;
commit;
