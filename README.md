# Bottle Buddy HQ – README

Bottle Buddy HQ is a multi-tenant water-can delivery and sales tracker built with React, Supabase, and shadcn-ui. It supports household/shop/function customers, inventory (bottles), counter/shop sales, delivery app workflows, and realtime syncing across devices (desktop and mobile).

This document covers setup, configuration, realtime behavior, data model, security, and troubleshooting.

## Tech Stack

- React 18 + TypeScript (Vite)
- shadcn-ui + Tailwind CSS
- Supabase (Postgres, Auth, RLS, Realtime)
- TanStack Query in places, custom hooks elsewhere

## Quick Start

1) Install dependencies

```bash
npm install
```

2) Configure Supabase (create `.env`)

Create `.env` in the project root with your Supabase credentials:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

3) Run dev server

```bash
npm run dev
```

The app starts on Vite’s default port (e.g. http://localhost:5173).

## Project Scripts

- `npm run dev` – start local dev server
- `npm run build` – production build
- `npm run preview` – preview production build
- `npm run lint` – lint checks

## Supabase Setup

You can initialize the database schema via Supabase Studio SQL editor or Supabase CLI.

Key migrations in `supabase/migrations/`:

- `20250907200918_...sql` – Base schema (tables: customers, bottles, pricing, transactions, routes, staff, function_orders; enums; triggers; RPC `generate_unique_pin`).
- `20250915183126_add_multitenancy.sql` – Adds `owner_user_id` column to core tables and RLS policies to scope data per authenticated user.
- `20250915184819_update_pricing_unique.sql` – Makes pricing uniqueness per owner: unique `(owner_user_id, bottle_type, customer_type)`.
- `20250918185500_update_customers_pin_unique.sql` – Makes customers’ PIN unique per owner: unique `(owner_user_id, pin)`.
- `20250918190500_add_app_pins.sql` – Adds `public.app_pins` to store per-owner app login PIN hashes.
- `20250918193500_fix_bottles_fk_on_delete.sql` – Sets `bottles.current_customer_id` FK `ON DELETE SET NULL` so bottles detach on customer deletion; transactions remain restrictive (cannot delete customers if transactions exist).

Apply with Supabase CLI:

```bash
# From the project root
supabase db push
```

Or paste each migration’s SQL in Supabase Studio > SQL Editor and run in order.

## Environment Variables

Set in `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Never commit secrets. Use environment management for deployments.

## Realtime Behavior (Mobile and Desktop)

All core pages subscribe to Supabase Realtime and update without manual refresh.

- `src/pages/Shop.tsx` – Channels for `bottles`, `customers`, and `transactions`. UI lists like inventory, with-customer bottles, and customers update as soon as changes happen.
- `src/pages/Delivery.tsx` – Channel `realtime-delivery-page`. Reacts to `transactions`, `bottles`, `customers`, and `pricing`. Today’s delivered/skipped markers and available stock update immediately.
- `src/pages/Bottles.tsx` – Channels `realtime-transactions` and `realtime-bottles`. Assign/return, delete, and recent activity per bottle updates live.
- `src/pages/Transactions.tsx` – Channel `realtime-transactions-page`. List updates on insert/update/delete; related lists are debounced-refreshed.
- `src/pages/FunctionOrders.tsx` – Channel `realtime-function-orders-page` plus listeners for mapping table and bottles; editing views update live.
- `src/pages/Dashboard.tsx` – Channel `realtime-dashboard`. KPIs are recalculated with debouncing on core table changes.

Notes:

- Realtime handlers often include fine-grained local state updates plus a debounced full refetch for safety. This ensures both immediate responsiveness and eventual consistency.
- Designed to work well on phones: actions like assigning bottles, marking returned, recording transactions and function orders will reflect instantly on all connected devices.

## Multi-tenancy and RLS

All business tables carry an `owner_user_id` column. RLS policies restrict access to rows for the authenticated user only.

Tables with `owner_user_id` include: `customers`, `bottles`, `routes`, `pricing`, `transactions`, `function_orders`, and `function_order_bottles` (if present), and `app_pins`.

Uniqueness scoped per owner:

- `pricing`: unique `(owner_user_id, bottle_type, customer_type)`
- `customers`: unique `(owner_user_id, pin)`

## PIN Systems

There are two distinct PIN concepts:

1. App Login/Screen‑Lock PIN
   - Stored hashed (SHA-256) in DB table `public.app_pins` keyed by `owner_user_id`.
   - Hook: `src/hooks/usePin.ts`
   - Session unlock flag is stored in localStorage per user (`app.pin.unlocked_at:<uid>`), not globally.
   - Set/verify/clear operates via Supabase with upsert on `owner_user_id`.

2. Customer PIN
   - Stored in `public.customers.pin` and is unique per owner (via migration above).
   - Used for identifying customers (search, labels, etc.).
   - RPC `generate_unique_pin` can generate unique 4-digit PINs.

## Data Model Summary

- `customers` – `id`, `pin`, `name`, `phone`, `address`, `customer_type`, `delivery_type`, `balance`, `deposit_amount`, `owner_user_id`, timestamps.
- `bottles` – `id`, `bottle_number` (unique), `bottle_type`, `current_customer_id` (FK to customers, `ON DELETE SET NULL`), `is_returned`, `owner_user_id`.
- `pricing` – per owner, customer type and bottle type with `price`; unique across `(owner_user_id, bottle_type, customer_type)`.
- `transactions` – delivery/return/payment records; may include `bottle_numbers[]` for traceability.
- `function_orders` – event-based lending with amounts and settlement.
- `app_pins` – per-owner login PIN hash storage.

## Business Rules Enforced

- Delete customer only if they have zero transactions. If bottles are assigned, they are detached on delete.
- On delivery/assign, balances are increased; on payment, balances are decreased.
- Pricing must exist for relevant `customer_type` x `bottle_type` combos prior to delivery.

## Common Errors & Troubleshooting

- Duplicate key on `customers_pin_key` when filling at shop
  - Cause: global unique PIN before multi-tenancy.
  - Fix: apply `20250918185500_update_customers_pin_unique.sql` and use upsert with `onConflict: 'owner_user_id,pin'` (see `Shop.tsx` `ensureGuestCustomer`).

- Deleting a customer fails due to bottles FK
  - Fix: apply `20250918193500_fix_bottles_fk_on_delete.sql` to set `ON DELETE SET NULL` for bottles. UI pre-check blocks delete when transactions exist (see `Customers.tsx`).

- A2 cannot unlock with its PIN, and A2 unlocks with A1’s PIN
  - Cause: legacy global unlocked flag / local hash reuse.
  - Fix: new `usePin` namespaces unlock per user and stores hash in `app_pins`. Log out/in and clear legacy key `app.pin.hash` if needed.

- Realtime updates not showing on phone
  - Ensure you’re logged in to the same Supabase user in all devices.
  - Network restrictions on mobile may block websockets; try cellular vs Wi‑Fi.
  - Reopen the tab to resubscribe.

## Deployment

Any static host works (Netlify, Vercel, Cloudflare Pages, etc.). Provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time.

Steps (generic):

```bash
npm run build
# Upload dist/ to your hosting provider
```

Make sure all database migrations have been applied to your production Supabase project.

## Accessibility & Mobile Considerations

- Buttons and inputs sized for touch on core flows (delivery, shop, bottles).
- Realtime ensures actions reflect immediately without refresh on phones.
- Lists are paginated or capped where needed for performance.

## Contributing

1) Create a feature branch
2) Make changes with appropriate migrations if schema changes
3) Run locally and test on mobile if relevant
4) Open a PR and include notes on migrations and user-facing changes

## License

Proprietary. All rights reserved.

