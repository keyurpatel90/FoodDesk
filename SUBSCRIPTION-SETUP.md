# FoodDesk subscription payment integration

## What was broken
- Checkout generated mock order/payment IDs and showed success without opening Razorpay.
- Payment verification accepted missing server configuration and returned a fabricated subscription without writing to Supabase.
- Subscription status was hard-coded as active Professional.
- The browser could submit an arbitrary organization ID and there was no owner/admin check.
- A fake Razorpay key and browser-editable key setting gave a false impression of live payment configuration.

## Required setup
1. Set the server environment variables from `.env.subscription.example` in your deployment (Vercel project settings). Do not commit actual secrets.
2. Run `supabase/subscription-billing-upgrade.sql` in Supabase SQL Editor.
3. Populate `organization_members` with each restaurant's owner/admin and their real `organizations.id`. Example:
   `INSERT INTO organization_members (organization_id, user_id, role) VALUES ('<restaurant-uuid>', '<auth.users-uuid>', 'owner');`
   Do not allow a restaurant user to assign themselves membership. Only a trusted onboarding/admin process should populate this table.
4. On successful sign-in / restaurant selection, the app must set `localStorage.fooddesk_organization_id` to the selected restaurant UUID. Supabase JS's standard `sb-<project-ref>-auth-token` session key is read to send the access token.
5. In Razorpay, configure the webhook URL as `https://YOUR_DOMAIN/api/subscription/webhook`, subscribe to `payment.captured`, and set the matching webhook secret in `RAZORPAY_WEBHOOK_SECRET`.
6. Use your own Razorpay test keys for test transactions. Switch to live keys only after completing test payments and configuring the live webhook.

## Flow
The server creates an INR order using server-side plan prices; the restaurant owner/admin must be authenticated and a member of that organization. Razorpay Checkout collects payment. The server verifies the checkout signature, fetches the order and payment directly from Razorpay, checks captured status, amount, plan and organization metadata, then invokes the Supabase activation RPC. The webhook is signature-checked and can apply a captured payment if the browser closes after payment.

## Important scope note
The supplied ZIP contains subscription-related files only, not the complete Next.js application/authentication source. This patch assumes Supabase Auth, the `organizations` table and the `organization_members` table created by the migration. The app's login/onboarding flow must persist the real selected organization ID to `fooddesk_organization_id`. Run a full build and test in the complete repository before deploying.
