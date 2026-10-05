# Food Event Desk — Vercel Edition

A FoodDesk-inspired event POS + Kitchen Display PWA designed for temporary food events. Built with Next.js and Supabase Realtime.

## What it does

- 3+ cashier phones can create orders at the same time.
- Atomic order creation: the kitchen never receives a half-created order.
- Automatic sequential order numbers from Postgres.
- Cash / UPI payment tracking.
- Main kitchen display with All / Waffle / Chole / Pav filters.
- Dedicated station URLs: `?mode=waffle`, `?mode=chole`, `?mode=pav`.
- Station staff can mark individual items READY.
- Order becomes READY only after every line item is complete.
- Dashboard: orders, revenue, average order, ready orders, item sales.
- Admin menu/pricing management.
- Android PWA: open in Chrome → Add to Home screen.

## Your event device setup

- Phone 1: `/?mode=cashier`
- Phone 2: `/?mode=cashier`
- Phone 3: `/?mode=cashier`
- Phone 4: `/?mode=waffle`
- Phone 5: `/?mode=chole` or `/?mode=pav`
- Tablet: `/?mode=kitchen`
- Optional owner device: `/?mode=dashboard`

## Deploy to Vercel + Supabase

### 1. Create Supabase project

Create a free Supabase project. In **SQL Editor**, paste and run:

`supabase/schema.sql`

The script creates the database, RLS policies, atomic `place_order` function, seed products, indexes, and Realtime publication entries.

### 2. Get Supabase credentials

In Supabase Project Settings → API, copy:

- Project URL
- Anon/publishable key

### 3. Deploy

Push this folder to GitHub, then import the repository into Vercel. Vercel will detect Next.js automatically.

Add these Vercel Environment Variables for Production (and Preview if desired):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Then deploy.

### 4. Open on Android

After deployment, open the Vercel URL in Chrome. Use **Add to Home screen** on each device. Save a different mode URL for each device.

## Local development

```bash
npm install
cp .env.example .env.local
# edit .env.local
npm run dev
```

## Important security note

This event MVP intentionally permits anonymous staff access so you can get the event running without an account-management system. It is suitable only for a controlled event environment. For a public/long-term deployment, add Supabase Auth, staff PINs/roles, and tighter RLS policies before exposing Admin or Dashboard data publicly.

## Important operational note

Use a stable Wi-Fi connection at the event. Realtime is used for live updates; the cashier should wait for the confirmation ticket before accepting the next order.
