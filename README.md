# Food Event Desk v2 — Next.js + Supabase

A secure, phone-first food-event POS and kitchen display system inspired by the open-source FoodDesk feature set.

## Included in this version

- Supabase Auth login with staff profiles and server-side RBAC roles: Admin, Manager, Cashier, Kitchen, Treasurer.
- Admin staff management: create users, assign roles and disable accounts.
- Admin settings with feature flags: enable/disable Cashier, Kitchen, Dashboard, Orders, Menu, Discounts, Staff, Reports, Printing, custom discounts, cash/change and payment methods.
- Cashier order entry with covers, kitchen notes, saved discounts, custom discount limits, cash received and change due.
- Server-validated pricing and discount calculation through secure Postgres functions; the browser cannot tamper with the final price.
- Order correction: cancel an individual line or an entire order with audit records.
- Kitchen KDS with live Supabase Realtime updates, station filtering, elapsed-time alerts and automatic READY status.
- Station views for Waffle, Chole Kulche and Pav Bataka.
- Daily service-day order numbering with configurable cutoff hour.
- Dashboard with revenue, order count, covers, average per cover, payment mix, item sales and CSV export.
- Browser-printable receipts/order sheets.
- PWA support retained from the original project.

FoodDesk's published feature list also includes guest self-ordering/online payments, CUPS printing, multilingual printed documents and a PDF end-of-day report. Those capabilities are not silently faked here; this version focuses on the event-counter workflows that fit the existing Next.js/Supabase architecture. The reference project's feature set is documented in its public README.

## Supabase setup

1. Create a Supabase project.
2. In SQL Editor, run **`supabase/schema.sql`**. It creates the schema, RLS policies, staff profile trigger, secure order RPCs and seed menu/discounts.
3. In Supabase Auth, create the first administrator account with email/password.
4. Promote it once from SQL Editor:

```sql
select public.bootstrap_admin('your-admin-email@example.com');
```

5. Add the following Vercel environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be prefixed with `NEXT_PUBLIC_`.

## Deploy

```bash
npm install
npm run build
npm run start
```

Vercel detects Next.js automatically. The project already contains `vercel.json` and the PWA manifest.

## Role access

- **Admin:** everything, including staff and settings.
- **Manager:** menu, discounts, orders, kitchen and dashboard/reporting; cannot manage staff/settings.
- **Cashier:** cashier + own order management.
- **Kitchen:** KDS/stations.
- **Treasurer:** dashboard/reporting + order visibility.

The UI hides unavailable screens, but the important authorization also lives in Supabase RLS and security-definer database functions.

## Notes about the original data

The schema is written as an upgrade script for the original MVP. It adds the new columns and constraints without deleting existing product/order data. Existing historical order numbers are used to initialise the per-service-day counter before new orders are created.
