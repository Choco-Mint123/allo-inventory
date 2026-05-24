# Allo Inventory — Take-Home Exercise

A Next.js app for inventory reservations. Built for the Allo engineering take-home.

## Live Demo

> [your-app.vercel.app] — update this after deploying

---

## Stack

- Next.js 14 (App Router) + TypeScript
- Neon (hosted Postgres) + Prisma
- Upstash Redis (for locking)
- Tailwind CSS

---

## Running locally

Clone and install:

```bash
git clone https://github.com/your-username/allo-inventory.git
cd allo-inventory
npm install
```

Create a `.env` file:

```env
DATABASE_URL="your neon connection string here"
UPSTASH_REDIS_REST_URL="your upstash url"
UPSTASH_REDIS_REST_TOKEN="your upstash token"
CRON_SECRET="anything random"
```

Push the schema and seed the db:

```bash
npm run db:push
npm run db:seed
```

Start dev server:

```bash
npm run dev
```

---

## How expiry works

There's a Vercel Cron job (`vercel.json`) that hits `/api/cron/expire-reservations` every minute. It finds any PENDING reservations past their `expiresAt` and releases them — meaning the reserved units go back to available stock.

Also added lazy cleanup as a fallback — if someone somehow hits confirm after expiry, the confirm endpoint catches it and returns 410.

---

## Concurrency

This was the main thing I had to think about. Two layers:

**Redis lock** — before touching the db, we grab a lock scoped to `productId:warehouseId`. So two requests for the same product/warehouse can't both proceed at the same time. The second one gets a 429.

**SELECT FOR UPDATE** — inside the Prisma transaction, we do a raw SQL query with `FOR UPDATE` on the stock row. This means even if two requests somehow get past the Redis lock, the DB serializes them. The second transaction waits for the first to commit, then sees the updated reserved count and correctly returns 409.

---

## Bonus — Idempotency

The reserve and confirm endpoints accept an `Idempotency-Key` header. First request executes normally and caches the result in Redis. If the same key comes in again, returns the original response without repeating the side effect. Added a `Idempotency-Replayed: true` header so clients can tell.

---

## API

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/products` | 200 |
| GET | `/api/warehouses` | 200 |
| POST | `/api/reservations` | 201, 400, 404, 409, 429 |
| GET | `/api/reservations/:id` | 200, 404 |
| POST | `/api/reservations/:id/confirm` | 200, 404, 409, 410 |
| POST | `/api/reservations/:id/release` | 200, 404, 409 |

---

## Trade-offs / things I'd fix with more time

- No auth — anyone with a reservation ID can confirm/cancel it. Would add Clerk or next-auth.
- UI only lets you reserve 1 unit. Backend supports any quantity though.
- Polling every 15s for stock updates instead of websockets. Works fine but not ideal.
- Cron runs once a minute so an expired reservation could stay PENDING for up to ~1 min before cleanup. Would use a proper job queue (BullMQ) in production.
