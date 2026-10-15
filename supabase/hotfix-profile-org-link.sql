-- Hotfix for 23502: null value in column "organization_id" of relation "outlet_day_counters"
-- Cause: the logged-in user's profile has no organization_id / outlet_id, so place_order() (v4)
-- tries to insert a day counter row with NULLs. Run once in the Supabase SQL editor. Safe to re-run.

-- 1) Make sure a default organization and outlet exist (same logic as the v4 upgrade).
insert into public.organizations(id,name) select gen_random_uuid(),'FoodDesk Default Organization' where not exists(select 1 from public.organizations);
insert into public.outlets(organization_id,name,code) select id,'Main Outlet','MAIN' from public.organizations o where not exists(select 1 from public.outlets where organization_id=o.id);

-- 2) Link every profile (and any org-less rows) to the default organization / outlet.
update public.profiles set organization_id=(select id from public.organizations order by created_at limit 1) where organization_id is null;
update public.profiles p set outlet_id=(select id from public.outlets where organization_id=p.organization_id order by created_at limit 1) where outlet_id is null;
update public.products set organization_id=(select id from public.organizations order by created_at limit 1), outlet_id=coalesce(outlet_id,(select id from public.outlets order by created_at limit 1)) where organization_id is null;
update public.discounts set organization_id=(select id from public.organizations order by created_at limit 1) where organization_id is null;
update public.combos set organization_id=(select id from public.organizations order by created_at limit 1), outlet_id=coalesce(outlet_id,(select id from public.outlets order by created_at limit 1)) where organization_id is null;
update public.inventory_items set organization_id=(select id from public.organizations order by created_at limit 1), outlet_id=coalesce(outlet_id,(select id from public.outlets order by created_at limit 1)) where organization_id is null;
update public.qr_tokens set organization_id=(select id from public.organizations order by created_at limit 1), outlet_id=coalesce(outlet_id,(select id from public.outlets order by created_at limit 1)) where organization_id is null;

-- 3) Re-install the v4 signup trigger function so NEW users get an organization/outlet.
--    (Re-running schema.sql after the v4 upgrade puts the v3 version back, which does not set them.)
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ declare v_org uuid; v_outlet uuid; begin select id into v_org from public.organizations order by created_at limit 1; select id into v_outlet from public.outlets where organization_id=v_org order by created_at limit 1; insert into public.profiles(id,email,display_name,role,active,organization_id,outlet_id) values(new.id,coalesce(new.email,''),coalesce(nullif(new.raw_user_meta_data->>'display_name',''),split_part(coalesce(new.email,''),'@',1)),'cashier',true,v_org,v_outlet) on conflict(id) do update set email=excluded.email; return new; end; $$;

-- 4) Rows inserted from the browser (Admin: add product / discount) do not send organization_id,
--    and the v4 RLS policies require organization_id = current_org(). Default it server-side.
alter table public.products        alter column organization_id set default public.current_org();
alter table public.products        alter column outlet_id       set default public.current_outlet();
alter table public.discounts       alter column organization_id set default public.current_org();
alter table public.combos          alter column organization_id set default public.current_org();
alter table public.combos          alter column outlet_id       set default public.current_outlet();
alter table public.inventory_items alter column organization_id set default public.current_org();
alter table public.inventory_items alter column outlet_id       set default public.current_outlet();
alter table public.qr_tokens       alter column organization_id set default public.current_org();
alter table public.qr_tokens       alter column outlet_id       set default public.current_outlet();

notify pgrst, 'reload schema';

-- 5) Verify: both counts must be 0.
select
  (select count(*) from public.profiles where organization_id is null or outlet_id is null) as profiles_without_org_or_outlet,
  (select count(*) from public.products where organization_id is null)                      as products_without_org;
