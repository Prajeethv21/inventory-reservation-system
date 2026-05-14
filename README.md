# Allo Inventory Reservations

A Next.js App Router implementation of an inventory reservation flow for multi-warehouse checkout.

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create your environment file:
   ```bash
   copy .env.example .env
   ```
   Update `DATABASE_URL` to a hosted Postgres instance (Supabase, Neon, Railway, etc.).
3. Apply schema + generate client:
   ```bash
   npm run db:push
   ```
4. Apply database integrity constraints:
   ```bash
   npm run db:constraints
   ```
5. Seed demo data:
   ```bash
   npm run db:seed
   ```
6. Start the dev server:
   ```bash
   npm run dev
   ```

## API overview

- `GET /api/products` - list products with per-warehouse available stock.
- `GET /api/warehouses` - list warehouses.
- `POST /api/reservations` - reserve stock (409 if insufficient).
- `POST /api/reservations/:id/confirm` - confirm reservation (410 if expired).
- `POST /api/reservations/:id/release` - release reservation.
- `GET /api/reservations/:id` - read reservation details (used by UI).

## Concurrency correctness

Stock is reserved using a single atomic SQL update:

```
UPDATE "Stock"
SET "reserved" = "reserved" + $quantity
WHERE "id" = $stockId AND ("total" - "reserved") >= $quantity
RETURNING *;
```

Only one concurrent caller can update the last available unit because the row update is atomic in Postgres. The reservation record is created in the same transaction, ensuring a consistent outcome.

Confirm and release are also concurrency-safe by using conditional updates on the reservation row (`status = 'PENDING'`) and updating stock counts in the same transaction. Only one request can transition a reservation from `PENDING` and decrement stock. Concurrent requests will see no rows updated and return the correct 409/410/404 responses.

## Reservation expiry

Expired reservations are released by `releaseExpiredReservations`, which runs on every API call. A Vercel cron endpoint also triggers the same cleanup.

- Cron route: `GET /api/cron/expire` (protected)
- Schedule: every 5 minutes (configured in `vercel.json`)

Set `CRON_SECRET` in the environment and configure the cron to send `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret`) for access.

This keeps the demo consistent and shows the production-style automation path.

## Idempotency (bonus)

The reserve and confirm endpoints support `Idempotency-Key`. If the same key is replayed with the same request payload, the original response is returned and no side effect is repeated. If the payload differs, the server returns a 409.

## Trade-offs / next steps

- The expiry cleanup is synchronous to keep the demo simple; a background job is preferred for production scale.
- UI is intentionally minimal (white/black) to focus on flow and correctness.
- No authentication/authorization is included; it would be required for real customers.

## Concurrency test

There is a stress test that forces two simultaneous reservations against a stock row set to 1.

1. Start the dev server (`npm run dev`).
2. Run the test:
   ```bash
   npm run test:concurrency
   ```

The script expects exactly one `201` success and one `409` conflict.
