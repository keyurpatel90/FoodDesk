# FoodDesk Architecture Assessment

## Existing baseline inspected

The supplied application was already a Next.js 15 + React 19 client application using Supabase Auth, Postgres/RLS, Realtime subscriptions and Vercel-compatible deployment. The main application shell was `app/page.tsx`, with working screens for authentication, cashier, kitchen, three station views, orders, dashboard and admin.

## Existing strengths preserved

- Server-side price calculation through the `place_order` Postgres function.
- Per-service-day server order numbering.
- Supabase RLS and security-definer mutation functions.
- Live Realtime refresh for orders, order items, products, discounts and settings.
- Existing token, covers, notes, discounts and cash-change behavior.
- Browser-printable receipts.
- Existing Vercel/Next.js project structure.

## Main gaps found

- Transactional order data lived entirely in the cloud, so the cashier stopped depending on connectivity only indirectly; there was no durable local database or queue.
- The browser had no durable device identity or idempotency key for order retries.
- Kitchen/station screens could not safely continue mutations against cached work while offline.
- Roles were event-specific (`admin`, `manager`, `cashier`, `kitchen`, `treasurer`) rather than the product roles requested for FoodDesk.
- Event configuration was limited to an event name and a few global settings.
- Products had no food-cost snapshot, making profitability reporting impossible to calculate accurately.
- There was no runner handoff transition.
- A true local-network multi-device sync layer did not exist and should not be faked in a browser-only architecture.

## Incremental changes made

### P0

- Added native IndexedDB persistence through `lib/offline.ts`.
- Added local order queueing, retry/backoff and idempotent cloud synchronization.
- Added local/offline reads for the cashier, kitchen, stations, orders, dashboard and runner.
- Added a global synchronization indicator and online retry behavior.
- Added a service-worker shell cache for reopening FoodDesk without a network connection after initial use.
- Added canonical Owner/Manager/Cashier/Kitchen/Runner/Viewer roles while preserving legacy Admin/Treasurer data.
- Added Event Mode fields to `app_settings`.
- Added Runner and `deliver_order()`.

### P1 foundation

- Added `products.food_cost`.
- Added `order_items.food_cost` so historical costs remain stable.
- Added dashboard estimated gross profit and gross margin.

## Deliberate architectural boundary

The current web architecture does not pretend that six browsers can communicate reliably over a local Wi-Fi network without a local service. Unsynced orders are safely local to the originating device until connectivity returns. A future Local Sync Gateway should sit between devices and the cloud:

```text
Cashier devices / KDS / Runner
          |
      Local Sync Gateway
          |
    Cloud Sync + Supabase
```

That boundary is safer than building a fragile browser-to-browser mesh.
