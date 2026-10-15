-- Hotfix for PGRST203: "Could not choose the best candidate function between public.place_order(...)"
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1) Remove the stale v3 overload (11 args, p_client_order_id uuid).
drop function if exists public.place_order(text,jsonb,integer,text,uuid,text,integer,integer,text,uuid,text);

-- 2) Make sure the v4 function (14 args, p_client_order_id text) stays callable.
grant execute on function public.place_order(text,jsonb,integer,text,text,uuid,text,integer,integer,text,text,text,text,text) to authenticated;

-- 3) Tell PostgREST to reload its schema cache.
notify pgrst, 'reload schema';

-- 4) Verify: this must return exactly ONE row.
select p.oid::regprocedure as signature
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'place_order';
