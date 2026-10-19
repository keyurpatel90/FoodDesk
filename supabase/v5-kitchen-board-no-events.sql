-- FoodDesk v5: stations and event mode are removed.
-- Run ONCE in the Supabase SQL editor, AFTER multitenant-security-upgrade.sql, and BEFORE (or together with)
-- deploying this version of the app. Safe to re-run.
begin;

-- 1) Stations are gone. Products and order lines no longer need one, so drop the NOT NULL and the
--    ('waffle','chole','pav') checks. The old column stays (empty) so existing data and old reports keep working.
do $$
declare t text; c record;
begin
  foreach t in array array['products','order_items'] loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='station') then
      for c in select conname from pg_constraint
               where conrelid = format('public.%I', t)::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%station%' loop
        execute format('alter table public.%I drop constraint %I', t, c.conname);
      end loop;
      execute format('alter table public.%I alter column station drop not null', t);
    end if;
  end loop;
end $$;

-- 2) Events are gone. The event name becomes the business name; the event-only settings are removed.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='app_settings' and column_name='event_name')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='app_settings' and column_name='business_name') then
    alter table public.app_settings rename column event_name to business_name;
  end if;
end $$;
alter table public.app_settings alter column business_name set default 'FoodDesk';
alter table public.app_settings
  drop column if exists event_mode,
  drop column if exists event_start_date,
  drop column if exists event_end_date,
  drop column if exists event_location,
  drop column if exists expected_visitors,
  drop column if exists number_stalls,
  drop column if exists number_cashiers,
  drop column if exists number_kitchen_stations;

-- 3) Every outlet gets its settings row automatically. Outlets created from the Organizations or Outlets
--    screens used to have none, which made first-time setup fail with "no rows returned".
create or replace function public.ensure_outlet_settings() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.app_settings(business_name, organization_id, outlet_id, onboarding_completed)
  select coalesce(nullif(trim(g.name), ''), 'FoodDesk'), new.organization_id, new.id, false
  from public.organizations g
  where g.id = new.organization_id
    and not exists (select 1 from public.app_settings s where s.organization_id = new.organization_id and s.outlet_id = new.id);
  return new;
end $$;
drop trigger if exists outlets_ensure_settings on public.outlets;
create trigger outlets_ensure_settings after insert on public.outlets for each row execute function public.ensure_outlet_settings();

-- Backfill outlets that have no settings row. Outlets that already have products count as set up.
insert into public.app_settings(business_name, organization_id, outlet_id, onboarding_completed)
select coalesce(nullif(trim(g.name), ''), 'FoodDesk'), o.organization_id, o.id,
       exists (select 1 from public.products p where p.outlet_id = o.id)
from public.outlets o
join public.organizations g on g.id = o.organization_id
where not exists (select 1 from public.app_settings s where s.organization_id = o.organization_id and s.outlet_id = o.id);

-- 4) First-time setup: the settings row now comes from the trigger above.
create or replace function public.create_organization_with_outlet(p_organization_name text, p_outlet_name text, p_outlet_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_outlet uuid; v_user public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_user from public.profiles where id = auth.uid() and active = true for update;
  if v_user.id is null then raise exception 'Active profile not found'; end if;
  if v_user.organization_id is not null and v_user.outlet_id is not null then
    return jsonb_build_object('organization_id', v_user.organization_id, 'outlet_id', v_user.outlet_id);
  end if;
  insert into public.organizations(name) values (coalesce(nullif(trim(p_organization_name), ''), 'My Business')) returning id into v_org;
  insert into public.outlets(organization_id, name, code)
    values (v_org, coalesce(nullif(trim(p_outlet_name), ''), 'Main Outlet'), upper(coalesce(nullif(trim(p_outlet_code), ''), 'MAIN'))) returning id into v_outlet;
  update public.profiles set organization_id = v_org, outlet_id = v_outlet, role = 'owner' where id = auth.uid();
  insert into public.user_outlet_access(user_id, organization_id, outlet_id, role) values (auth.uid(), v_org, v_outlet, 'owner') on conflict do nothing;
  return jsonb_build_object('organization_id', v_org, 'outlet_id', v_outlet);
end $$;
revoke all on function public.create_organization_with_outlet(text, text, text) from public, anon;
grant execute on function public.create_organization_with_outlet(text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
