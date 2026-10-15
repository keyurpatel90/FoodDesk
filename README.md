# FoodDesk

**POS that just works.**  Fast. Offline. Simple.

FoodDesk is an incremental evolution of the existing Food Event Desk Next.js/Supabase application. The working cashier, kitchen, station, orders, dashboard, authentication and admin screens are preserved rather than replaced.

## What is implemented now

### P0 — event-counter core
- Express POS with large touch-friendly product buttons and a sticky order/payment flow.
- Token number, covers, notes, discounts, cash/change, UPI and card payment controls.
- Multi-station kitchen routing for Waffle, Chole Kulche and Pav Bataka.
- Live kitchen queue with per-item completion and configurable warning/critical delay treatment.
- Runner / pickup screen with a READY → DELIVERED transition.
- Canonical RBAC roles: Owner, Manager, Cashier, Kitchen, Runner, Viewer. Legacy Admin/Treasurer values remain supported for upgrade safety.
- Event Mode configuration: name, dates, location, expected visitors, stalls, cashiers and kitchen stations.
- Offline-first transactional storage in IndexedDB. Each local order carries `localId`, optional `serverId`, `createdAt`, `updatedAt`, `deviceId`, `syncStatus` and `version`.
- Automatic synchronization with retry/backoff and server-side idempotency using `client_order_id`.
- Offline KDS actions are queued instead of pretending the cloud is reachable.
- Global OFFLINE / SYNCING / ALL DATA SYNCED indicator.
- PWA service worker shell caching so the app can be reopened while disconnected after it has been loaded online once.
- Server-side pricing and discount validation remain authoritative.

### P1 — profitability foundation
- Product-level food cost.
- Food cost is snapshotted into order lines, so later cost changes do not rewrite historical profitability.
- Dashboard shows Sales, Food Cost, Estimated Gross Profit and Gross Margin.
- CSV export includes food cost and gross profit.
- Product management shows current gross margin.

## What is intentionally still pending

The large roadmap is not implemented as one uncontrolled rewrite. The next phases should add:

- True per-role configurable permission matrix stored in data rather than only code defaults.
- Separate Event entity/history with open/close/settlement workflow and end-of-event PDF.
- Combo engine and price recommendations based on target margin.
- Full operational inventory, ingredient recipes and low-stock recommendations.
- QR self-ordering and customer order tracking.
- Generic online order-channel adapters for website, WhatsApp, Swiggy and Zomato. No third-party integration is faked without credentials/API access.
- Local Sync Gateway for true multi-device Wi-Fi operation when cloud connectivity is unavailable. The current web app deliberately does not fake peer-to-peer synchronization.
- Thermal/Bluetooth/USB/network printer adapters and cash-drawer adapters.
- Demand forecasting and kitchen bottleneck analytics using real timestamps.
- Subscription entitlements and payments.

## Supabase upgrade

Run the updated **`supabase/schema.sql`** in the Supabase SQL Editor. It is an upgrade-style script and preserves the existing product/order data. It adds:

- canonical role values while keeping legacy role values;
- event-mode settings;
- product `food_cost`;
- order `client_order_id`, `device_id`, `version`;
- order-item `food_cost`;
- delivered status and `deliver_order()`;
- idempotent `place_order()` support;
- additional audit/version updates.

For the first administrator, the existing bootstrap command remains valid:

```sql
select public.bootstrap_admin('your-admin-email@example.com');
```

That legacy `admin` role is treated as the FoodDesk **Owner** role in the application.

## Vercel environment variables

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be prefixed with `NEXT_PUBLIC_`.

## Deploy

The app remains a standard Next.js application and keeps the existing Vercel configuration.

```bash
npm install
npm run build
npm run start
```

Then deploy the repository to Vercel as a Next.js project.

## Offline model

The browser database is IndexedDB, not localStorage. The flow is:

```text
Cashier
  → IndexedDB order
  → UI updates immediately
  → SyncQueue entry
  → online event / automatic retry
  → Supabase place_order(client_order_id)
  → acknowledgement
  → local record marked SYNCED
```

The cloud remains authoritative for final price calculation and server order numbering. An offline order is shown as `LOCAL-<number>` until synchronization succeeds.

Digital payments are intentionally disabled while offline because the application cannot safely verify an external UPI/card payment without connectivity. Cash can be recorded locally and synchronized later.

## Security

- Authentication uses Supabase Auth.
- Important authorization remains server-side in Postgres functions/RLS and the admin API.
- Pricing is recalculated from the database; browser-supplied prices are not trusted.
- Tenant isolation remains a design requirement for the next multi-outlet data-model phase; this current deployment is still single-organization in schema scope.
- Audit records capture important order mutations and delivery actions.

## Validation note

The repository was inspected and modified directly. The environment used for this change could not complete a fresh npm dependency installation within the available runtime, so a full `next build` could not be executed here. The source changes were kept within the existing Next.js/TypeScript dependency set and no new npm package was introduced.


## v4 database upgrade
For an existing v3 database, back up the database, then run `supabase/schema-v4-upgrade.sql` only. The upgrade includes repair steps for tables created by earlier partial attempts. Review any SQL error before continuing; this file has not been executed against your live Supabase project.


## Variable-weight / volume products (V4 update)

Products can now be sold per piece, kilogram, or litre. The configured selling price and food cost are rates per selected unit (for example, ₹600/kg). In the cashier, kg products accept quantity in grams and litre products in millilitres; entering 200 g calculates a ₹120 line total for a ₹600/kg product. Order items store the actual rate, quantity, and unit snapshot, and receipts/order management calculate line totals from those same values.

For an existing V4 Supabase project, run `supabase/schema-v4-upgrade.sql` in the Supabase SQL Editor before deploying this code. Existing products are migrated as `piece` to preserve their current pricing. New installations should use `supabase/schema.sql` or the V4 schema as appropriate for the chosen deployment.
