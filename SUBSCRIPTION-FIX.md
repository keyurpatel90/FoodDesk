# FoodDesk subscriptions with Razorpay

## What was wrong
- The downloaded subscription code was a **demo**: a fake Razorpay popup, fake order ids, no signature check, and the plan stored in the browser's `localStorage`. Nothing was ever charged or saved.
- It was **never connected to your real `app/page.tsx`**. The "Access Paused · Role: Waiter" screen came from the demo's own role switcher, which doesn't exist in your app (your roles come from `profiles.role`).
- The demo components were styled with Tailwind, but your app uses its own CSS, so they rendered unstyled.
- The old SQL let any logged-in user call `activate_organization_subscription` from the browser (a free Enterprise plan for anyone).

## How it works now
- **Every restaurant (organization) needs an active plan.** After login, `page.tsx` asks the server (`/api/subscription/status`, read from the database).
  - **Active or trial:** the app runs as before. **Owners** also see a slim strip ("Professional plan · active until 20 Nov") with *Manage plan* -> plan cards (Renew / Upgrade) and payment history.
  - **Expired:** staff see "Access Paused" and are told to contact the owner. The **owner** sees the plan cards and can pay immediately.
  - **Platform super-admins** (`profiles.is_super_admin`) are exempt.
- **Paying:** owner picks a plan -> server prices it and creates a real Razorpay order -> real Razorpay Checkout (UPI / cards / netbanking / wallets) -> server verifies the signature and re-checks the payment with Razorpay -> plan activated in Postgres. If the owner closes the tab right after paying, the **webhook** activates it. Both paths are idempotent.
- **Plan rules** (`lib/server/pricing.ts`): new / expired / trial = full price, starts today, 30 days. Renew the same plan while active = 30 days *added* after the current end date. Upgrade while active = price minus credit for unused days. Downgrade while active = blocked until the plan ends.
- **Offline-safe:** if the internet drops, a restaurant whose last confirmed plan is still valid keeps working (the expiry date is still enforced). Locked-out/401/403 results are never bypassed by this cache.
- **New restaurants get a 14-day Professional trial** from the database default.

## Setup: do these IN THIS ORDER
1. **Run the SQL** `supabase/subscription-billing-upgrade.sql` in the Supabase SQL editor (safe to run twice).
   *Every existing restaurant gets a fresh 14-day trial at that moment; after it ends they must pay.*
2. **Add env vars in Vercel** (Settings -> Environment Variables), from `.env.example`: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (+ your existing `NEXT_PUBLIC_SUPABASE_*`). Start with Razorpay **test** keys.
3. **Razorpay webhook:** Dashboard -> Settings -> Webhooks -> URL `https://YOUR-DOMAIN/api/subscription/webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`, events `order.paid`, `payment.captured`, `payment.failed`.
4. **Copy the files** from this zip into your repo (same paths): `app/api/subscription/**`, `lib/subscription*.ts`, `lib/razorpay.ts`, `lib/billing-auth.ts`, `lib/server/**`, `hooks/useSubscription.ts`, `styles/fd-billing.css`, `components/{SubscriptionLockout,SubscriptionCards,SubscriptionBanner,BillingDrawer,BillingSettingsView,RazorpayModal,PricingModal}.tsx`, and **`app/page.tsx`**.
   Only 2 of your original `page.tsx` lines changed (the sign-out handlers); everything else there is added.
5. **Redeploy** (the `NEXT_PUBLIC_` variables are baked in at build time).
   *Deploying before steps 1-2 would show everyone "couldn't check your subscription". To ship the code first, set `NEXT_PUBLIC_BILLING_ENFORCED=false`, finish setup, then remove it.*
6. Make sure the owner's `profiles.role` is `owner` (or `admin`). Change who may pay with `BILLING_ADMIN_ROLES`.

You can delete these demo-only files; your real app never uses them: `components/{OrdersView,CashierView,KDSView,LoyaltyView,AnalyticsView,MultiOutletView,CustomerQRView,Navbar,DemoControlBar}.tsx`.

## Test in Razorpay test mode
Log in as the owner, open *Manage plan* (or the expired screen), pick a plan. UPI `success@razorpay` (or `failure@razorpay`), or card `4111 1111 1111 1111` with any future expiry and any CVV. To force the expired screen: `update organizations set subscription_status='inactive', subscription_end_date=now()-interval '1 day' where id='...';`

## Assumptions to check
- `profiles` has `id, organization_id, role, active, is_super_admin` (all used by your `page.tsx`) and `organizations.id` is a uuid. If membership lives elsewhere, edit the single query in `lib/server/auth.ts -> resolveMembership()`.
- **Not enforced yet:** plan *limits and features* (tables, staff accounts, WhatsApp invoices, multi-branch). The app currently enforces **active vs expired** only. Mapping tiers to your `settings.features` flags is a next step.
- Renewal is a one-time monthly payment done by hand, not auto-debit (that needs Razorpay *Subscriptions*, a different integration).
- Before going live: switch to live keys and a live webhook, and complete Razorpay KYC.

## Styling
`styles/fd-billing.css` is a compiled, **scoped** stylesheet (everything lives under `.fd-billing`), so it can't change the rest of your UI. If you edit the billing components' classes, regenerate it: `npx tailwindcss@3 -c tailwind.fd-billing.config.js -i styles/fd-billing.src.css -o styles/fd-billing.css --minify`.

## What was verified
Strict TypeScript and a production `next build` of your real `page.tsx`; 12 tests of your page's gating (cashier vs owner, expired vs active, trial, offline, errors, super-admin, sign-out, kill switch); 15 end-to-end payment tests and 6 real-login/role tests (routes -> Supabase client -> PostgREST -> Postgres, against a mock Razorpay that signs payments like the real one); 8 checkout-UI tests; 11 pricing tests; direct SQL checks including security. **Not tested:** a live payment on your Razorpay account, your real Supabase project, and how the screens look inside your actual CSS. Please send a screenshot if anything looks off.
