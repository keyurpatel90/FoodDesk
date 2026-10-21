# FoodDesk subscriptions: what was wrong and how to switch it on

## Why it "didn't work"
The code *looked* like a Razorpay integration but was a simulation end to end:

| Problem | Where |
|---|---|
| The "Razorpay" popup was a fake form with hard-coded card details. It never loaded Razorpay's `checkout.js` and invented its own payment id and signature. | `RazorpayModal.tsx`, `lib/razorpay.ts` |
| `/create-order` silently returned a made-up order id when keys were missing or the Razorpay call failed, so Razorpay could never match a payment to it. | `create-order/route.ts` |
| `/verify-payment` skipped the signature check if the secret or signature was missing, did not confirm the payment with Razorpay, and never wrote to the database (the SQL was commented out). | `verify-payment/route.ts` |
| The subscription lived in the browser's `localStorage`, and every new browser started with a fake **active Professional plan**. So nothing was ever enforced and nothing was shared between devices. | `lib/subscription.ts` |
| The "Start free trial" button could be clicked again and again. | `SubscriptionCards.tsx` |
| The Razorpay Key ID was editable in the browser; the webhook only logged; `/status` returned hard-coded data. | `BillingSettingsView.tsx`, `webhook`, `status` |
| In the SQL, `activate_organization_subscription` was a `SECURITY DEFINER` function that any logged-in user could call from the browser, i.e. a free Enterprise plan for anyone. It also threw on duplicate payments and ignored renewal dates. | `subscription-billing-upgrade.sql` |

## How it works now
1. Owner clicks a plan -> `POST /api/subscription/create-order`. The server decides the price, creates a **real Razorpay order** and tags it with the restaurant + plan.
2. The modal shows the amount, then opens the **real Razorpay Checkout** (UPI / cards / netbanking / wallets).
3. On success -> `POST /api/subscription/verify-payment`. The server checks the signature, re-fetches the order and payment from Razorpay (captured? same order? same amount?), then calls the database function that activates the plan.
4. If the owner closes the tab right after paying, the **webhook** does the same activation. It is idempotent, so both paths can run safely.
5. The app reads the subscription from `GET /api/subscription/status` (database), not from `localStorage`.

Plan rules (in `lib/server/pricing.ts`, one place to change):
- **New / expired / trial** -> full price, starts today, 30 days.
- **Renew same plan while active** -> full price, 30 days are *added* after the current end date.
- **Upgrade while active** -> price minus credit for unused days (max 30), term restarts today.
- **Downgrade while active** -> blocked until the current period ends (button shows "Switch after 20 Nov").

## Setup (about 15 minutes)
1. **Database.** Paste `supabase/subscription-billing-upgrade.sql` into the Supabase SQL editor and run it. It is safe to run twice.
   *Existing restaurants get a fresh 14-day Professional trial when you run it. After that they must pay.*
2. **Env vars.** Copy `.env.example` into `.env.local` (and into Vercel -> Settings -> Environment Variables). Use Razorpay **test** keys first.
3. **Razorpay webhook.** Dashboard -> Settings -> Webhooks -> Add: URL `https://YOUR-DOMAIN/api/subscription/webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`, events `order.paid`, `payment.captured`, `payment.failed`.
4. **Wire up your page.** See `examples/page-integration.example.tsx` (your `page.tsx` was not in the zip). In short: replace the `localStorage` subscription state with `useSubscription()`, show a loading state until it resolves, and register your Supabase token with `setAccessTokenProvider(...)`.
5. **Tell the server who the user is.** `lib/server/auth.ts -> resolveMembership()` looks for the restaurant in `app_metadata.organization_id`, then in `profiles(id, organization_id, role)`. **If your multi-tenant schema stores this elsewhere, change that one query.**
6. `npm i @supabase/supabase-js` if it is not already installed.

## Testing with Razorpay test mode
- UPI: `success@razorpay` (or `failure@razorpay` to see a failed payment). Card: `4111 1111 1111 1111`, any future expiry, any CVV.
- No login wired up yet? Set `BILLING_DEV_ORG_ID=<an organizations.id>` in `.env.local` to try the full flow locally. It is ignored in production builds.
- The webhook needs a public URL. Locally use a tunnel (e.g. `ngrok http 3000`) and put that URL in the Razorpay dashboard.

## Removed from the old code
`subscriptionService.activateTier / startFreeTrial / saveSubscription / addInvoice / reactivateDefault`, `razorpayService.getKeyId / setKeyId / generateMock*`, the Razorpay-key form, and the "Download ZIP" links. If any file outside this zip calls them, switch it to `refresh()` / `createOrder()` / `verifyPayment()`.

## Before going live
- Switch to live keys (`rzp_live_...`) and a live-mode webhook; complete Razorpay KYC.
- Remove `DemoControlBar` (or leave `NEXT_PUBLIC_DEMO_MODE` off).
- Hiding features in the UI is not security. Enforce limits in the database too (see the commented RLS example at the bottom of the SQL: `is_org_subscription_active()` / `has_org_feature()`).
- Pricing is monthly, one-time payments that the owner renews by hand. If you later want auto-debit, that needs Razorpay *Subscriptions* (plans + mandates), which is a different integration.

## How this was verified
Strict TypeScript, a production `next build`, 11 pricing unit tests, 8 browser-flow tests (the modal against a fake `window.Razorpay`), 15 end-to-end tests (route handlers -> Supabase client -> PostgREST -> Postgres running this migration, against a mock Razorpay that signs payments like the real one), and 10 direct SQL checks including the security ones. **Not tested:** a live payment with *your* Razorpay account and your real login/profile schema. That is why steps 2-5 above matter.
