# FoodDesk V4 multi-tenant upgrade

## What this patch changes
- Organization creation and first-outlet setup are performed atomically by `create_organization_with_outlet`.
- New users are no longer silently attached to the first organization.
- Products and settings are stored against the signed-in user's organization and active outlet.
- Outlet memberships are represented in `user_outlet_access`; outlet switching only works for assigned outlets.
- RLS policies isolate organization data and scope operational product/order/report data to the active outlet.
- A super-admin flag (`profiles.is_super_admin`) provides cross-organization access, and the app includes an Organizations screen for global organization/outlet administration.

## Apply to Supabase
1. Back up the project database first.
2. Open Supabase Dashboard → SQL Editor.
3. Run `supabase/multitenant-security-upgrade.sql` after the existing V4 schema/upgrade scripts.
4. In SQL Editor, promote exactly one trusted account to super admin by replacing the email below with that account's verified login email:

```sql
update public.profiles
set is_super_admin = true
where lower(email) = lower('your-admin@example.com');
```

5. Ensure the Vercel project has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` configured. Never expose the service-role key in a `NEXT_PUBLIC_` variable.
6. Deploy the updated source. Sign in with the super-admin account and open **Organizations**. Existing tenant users should sign in and complete onboarding if their organization/outlet/settings are not yet assigned.

## Important validation notes
- This source bundle was statically reviewed, but a full Next.js build and live Supabase migration test could not be completed in this environment because the dependency install did not complete and no database credentials were provided. Apply to a staging Supabase project first and verify onboarding, product creation, outlet switching, user assignments, and cross-organization read/write denial before production.
- Existing legacy records are not automatically redistributed among outlets; review legacy data ownership before enabling the upgrade on production.
