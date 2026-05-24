# Allo Inventory — Take-Home Exercise

A Next.js inventory reservation system with race-condition-safe stock management.

## Live Demo

> Deployed at: [your-app.vercel.app] — replace after deployment

---

## Local Setup

### Prerequisites

- Node.js 18+
- A Supabase account (free) — for Postgres
- An Upstash account (free) — for Redis

### 1. Clone and install

```bash
git clone https://github.com/your-username/allo-inventory.git
cd allo-inventory
npm install
```

### 2. Environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres"
UPSTASH_REDIS_REST_URL="https://xxx.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your_token_here"
CRON_SECRET="any-random-secret-string"
```

- **DATABASE_URL**: From Supabase → Settings → Database → Connection string (URI mode)
- **UPSTASH_REDIS_REST_URL/TOKEN**: From Upstash → your Redis database → REST API section

### 3. Run migrations and seed

```bash
npm run db:push     # Push schema to Supabase
npm run db:seed     # Seed with 4 products across 3 warehouses
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How Expiry Works

### In production (Vercel Cron)

`vercel.json` registers a cron job at `* * * * *` (every minute) that calls `GET /api/cron/expire-reservations`. This endpoint:

1. Finds all `PENDING` reservations where `expiresAt < now()`
2. For each expired reservation, inside a transaction:
   - Decrements `Stock.reserved` by the quantity
   - Sets `status = RELEASED` and `releasedAt = now()`

The cron is protected by a `CRON_SECRET` environment variable — Vercel sends it as an `Authorization: Bearer` header automatically.

### Lazy cleanup

As a secondary safety net, the confirm endpoint also checks expiry and auto-releases if the user somehow reaches confirm after the timer runs out.

---

## Concurrency Strategy

The reservation endpoint uses **two layers** of protection:

### Layer 1 — Distributed Redis lock

Before entering the database transaction, we acquire a Redis lock scoped to `productId:warehouseId`. This ensures that for a given product/warehouse pair, only one reservation attempt proceeds at a time.

```
acquireLock("prod_abc:wh_xyz", ttl=15s)
```

If the lock is already held, the request gets a `429 Too Many Requests` immediately, which is friendlier than waiting and failing at the DB level.

### Layer 2 — PostgreSQL `SELECT FOR UPDATE`

Inside a `prisma.$transaction`, we issue:

```sql
SELECT id, total, reserved FROM "Stock"
WHERE "productId" = $1 AND "warehouseId" = $2
FOR UPDATE
```

`FOR UPDATE` acquires a row-level lock. Any concurrent transaction trying to read the same stock row will block until the first commits. This means:

- Two simultaneous requests for the last unit will serialize
- The second will see the updated `reserved` count after the first commits
- It will correctly compute `available = 0` and return a `409`

This is the "correct under concurrency" guarantee the exercise asks for.

---

## Idempotency (Bonus)

Both `POST /api/reservations` and `POST /api/reservations/:id/confirm` support the `Idempotency-Key` header.

- On first request: execute normally, cache `key → reservationId` in Redis (TTL 24h)
- On retry with the same key: look up the cached reservation, return the original response with `Idempotency-Replayed: true` header

This handles the common case of payment clients retrying on network timeout.

---

## API Reference

| Method | Path | Status codes |
|--------|------|-------------|
| GET | `/api/products` | 200 |
| GET | `/api/warehouses` | 200 |
| POST | `/api/reservations` | 201, 400, 404, 409, 429, 500 |
| GET | `/api/reservations/:id` | 200, 404 |
| POST | `/api/reservations/:id/confirm` | 200, 404, 409, 410 |
| POST | `/api/reservations/:id/release` | 200, 404, 409 |
| GET | `/api/cron/expire-reservations` | 200 (cron only) |

---

## Trade-offs & What I'd Do Differently

**What I focused on:**
- Correctness: the `SELECT FOR UPDATE` + Redis lock combination is the core, and it's right
- Clear API with proper HTTP status codes (409 vs 410 distinction)
- Live UI feedback: countdown timer, real-time polling, no silent error swallowing
- Bonus idempotency fully implemented

**Trade-offs made:**
- **No auth**: A real system would tie reservations to user sessions. Right now anyone with a reservation ID can confirm or cancel it.
- **Quantity hardcoded to 1**: The UI always reserves 1 unit. The backend supports any quantity via the API.
- **Polling instead of WebSockets**: The product page polls every 15s for fresh stock. WebSockets or Server-Sent Events would give true real-time updates.
- **Single cron granularity**: Vercel Cron runs at most once per minute. A 10-minute reservation could linger up to 10:59 before cleanup. In production, I'd use a dedicated job queue (BullMQ, Temporal) for second-level precision.

**With more time:**
- User authentication (Clerk or next-auth)
- Quantity selector in the UI
- Order history page
- Webhook integration for payment providers
- E2E tests (Playwright) covering the concurrent reservation race
