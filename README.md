# Veyra

Abandoned checkout recovery and smart discount platform for Shopify.

## Architecture

Veyra is an event-driven modular monolith with clear boundaries between flows, designed for horizontal scaling.

```
┌─────────────────────────────────────────────────────────────┐
│                        HTTP Server                          │
│  (Fastify — Shopify OAuth, Webhooks, Tracking, Dashboard)   │
└──────────────────────────┬──────────────────────────────────┘
                           │ enqueue
                    ┌──────▼──────┐
                    │    Redis    │
                    │  (BullMQ)   │
                    └──────┬──────┘
                           │ dequeue
┌──────────────────────────▼──────────────────────────────────┐
│                     Worker Process(es)                       │
│  Webhook → Normalise → Score → Sequence → Schedule → Send   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  Postgres   │
                    │ (Supabase)  │
                    └─────────────┘
```

**Three process types:**

| Process     | Responsibility                                   | Scales by   |
|-------------|--------------------------------------------------|-------------|
| `server`    | HTTP endpoints (OAuth, webhooks, tracking, API)  | Replicas    |
| `worker`    | Async job processing (all 48 flows)              | Replicas    |
| `scheduler` | Periodic jobs (expiry, billing, health checks)   | Single (leader) |

## Tech Stack

| Component       | Choice           | Rationale                                     |
|-----------------|------------------|-----------------------------------------------|
| Runtime         | Node.js 20+      | Strong Shopify ecosystem, TypeScript native    |
| Language        | TypeScript 5.6   | Type safety, Drizzle/Zod integration           |
| HTTP Framework  | Fastify 5        | Fastest Node framework, schema validation      |
| Queue           | BullMQ + Redis   | Battle-tested, backpressure, rate limiting     |
| ORM             | Drizzle          | Type-safe, migration-friendly, zero overhead   |
| Database        | PostgreSQL 16    | Supabase-hosted, JSONB, strong indexing        |
| State Machine   | Custom (typed)   | Lightweight, no external deps, full control    |
| Email           | Resend           | Developer-friendly, reliable delivery          |
| SMS             | Twilio           | Industry standard, global coverage             |
| WhatsApp        | Twilio WhatsApp  | Same SDK, approved templates                   |
| Billing         | Stripe (metered) | Usage-based billing via subscription items     |
| Validation      | Zod              | Runtime validation, TypeScript inference        |
| Logging         | Pino             | Structured JSON, fast, low overhead            |

## Folder Structure

```
src/
├── config/
│   └── env.ts                    # Zod-validated environment config
├── db/
│   ├── client.ts                 # Postgres connection (Drizzle)
│   └── schema/
│       ├── index.ts              # Schema barrel export
│       ├── stores.ts             # Store (tenant) table
│       ├── customers.ts          # Customer table with scoring fields
│       ├── abandons.ts           # Abandon lifecycle table
│       ├── messages.ts           # Message tracking table
│       ├── coupons.ts            # Dynamic coupon table
│       ├── recovery_ledger.ts    # Financial recovery records
│       ├── events.ts             # Event audit log
│       └── provider_health.ts    # Provider health metrics
├── lib/
│   ├── crypto.ts                 # AES-256-GCM encryption, HMAC
│   ├── errors.ts                 # Error class hierarchy
│   ├── event-bus.ts              # In-process event bus
│   ├── idempotency.ts            # Redis-backed idempotency locks
│   ├── logger.ts                 # Pino structured logging
│   ├── queue.ts                  # BullMQ queue/worker factory
│   ├── redis.ts                  # Redis connection management
│   ├── shopify.ts                # Shopify REST + GraphQL client
│   └── state-machine.ts          # Recovery state machine
├── flows/
│   ├── 01-shopify-oauth/         # Shopify OAuth install
│   ├── 02-webhook-registration/  # Webhook setup + receiver
│   ├── 03-app-uninstall/         # Uninstall handler
│   ├── 04-store-sync/            # Store metadata sync
│   ├── 05-customer-sync/         # Customer data sync
│   ├── 06-checkout-created/      # Checkout created listener
│   ├── 07-checkout-updated/      # Checkout updated listener
│   ├── 08-checkout-abandon-detector/  # Abandon detection
│   ├── 09-cart-abandon-detector/      # Cart abandon detection
│   ├── 10-browse-abandon-detector/    # Browse abandon detection
│   ├── 11-order-created/         # Order created listener
│   ├── 12-order-attribution/     # Order → abandon attribution
│   ├── 13-abandon-normaliser/    # Data normalisation
│   ├── 14-duplicate-resolver/    # Duplicate detection
│   ├── 15-expiry-timer/          # TTL expiry processor
│   ├── 16-recovery-state-machine/ # State persistence layer
│   ├── 17-vip-detection/         # VIP customer classification
│   ├── 18-ltv-calculator/        # Customer LTV calculation
│   ├── 19-recovery-probability-scorer/  # Recovery scoring
│   ├── 20-discount-sensitivity-scorer/  # Discount need scoring
│   ├── 21-channel-preference/    # Channel optimisation
│   ├── 22-margin-safety-check/   # Margin protection
│   ├── 23-discount-eligibility/  # Discount gate logic
│   ├── 24-discount-value-calculator/   # Optimal discount %
│   ├── 25-discount-timing/       # When to introduce discount
│   ├── 26-dynamic-coupon-generator/    # Shopify coupon creation
│   ├── 27-coupon-expiry/         # Coupon cleanup
│   ├── 28-message-sequence-builder/    # Message sequence design
│   ├── 29-send-time-optimiser/   # Quiet hours + timing
│   ├── 30-holdout-group/         # A/B holdout assignment
│   ├── 31-message-queue-manager/ # Message dispatch
│   ├── 32-retry-failover/        # Retry + provider failover
│   ├── 33-email-sender/          # Email delivery (Resend)
│   ├── 34-sms-sender/            # SMS delivery (Twilio)
│   ├── 35-whatsapp-sender/       # WhatsApp delivery (Twilio)
│   ├── 36-provider-health/       # Provider health monitoring
│   ├── 37-open-tracking/         # Open + click tracking
│   ├── 39-conversion-matcher/    # Order → abandon matching
│   ├── 40-confidence-scoring/    # Attribution confidence
│   ├── 41-recovery-ledger/       # Financial ledger
│   ├── 42-fee-calculator/        # Fee aggregation
│   ├── 43-billing-aggregator/    # Monthly billing
│   ├── 44-stripe-usage-reporter/ # Stripe metered billing
│   ├── 45-conflict-detection/    # Safety conflict checks
│   ├── 46-auto-pause/            # Auto-pause protection
│   ├── 47-error-logging/         # Centralised error logging
│   └── 48-dashboard-metrics/     # Dashboard API
├── workers/
│   └── index.ts                  # Worker process entry point
├── scheduler/
│   └── index.ts                  # Scheduler process entry point
└── server.ts                     # HTTP server entry point
```

## Database Schema

8 tables with multi-tenant isolation via `store_id`:

| Table              | Purpose                                    |
|--------------------|--------------------------------------------|
| `stores`           | Tenant configuration, Shopify credentials  |
| `customers`        | Customer profiles with scoring fields      |
| `abandons`         | Abandon lifecycle with state machine       |
| `messages`         | Message tracking per channel               |
| `coupons`          | Dynamic single-use discount codes          |
| `recovery_ledger`  | Financial recovery records for billing     |
| `events`           | Event audit log with idempotency keys      |
| `provider_health`  | Rolling provider success/failure metrics   |

## Recovery State Machine

```
detected → qualified → scoring → sequencing → awaiting_send → sending → engaged → recovered
     │          │                                                              │
     │          └→ holdout (no messages)                                       │
     │                                                                         │
     └──────────── expired (TTL exceeded) ─────────────────────────────────────┘
     └──────────── cancelled (manual or auto-pause) ───────────────────────────┘
```

## Smart Discount Engine

The discount engine is Veyra's core differentiator. Discounts are a **last resort**, not the default.

**Decision flow:**
1. Score recovery probability (will they convert without incentive?)
2. Score discount sensitivity (how price-sensitive is this customer?)
3. Gate: High probability + low sensitivity → **no discount**
4. Gate: Recent discount used → **no discount** (abuse prevention)
5. Gate: First message → **always no discount** (try organic first)
6. Gate: Cart < $25 → **no discount** (margins too thin)
7. If eligible → calculate minimum effective discount (5-20%, capped by store max)
8. Margin safety check → ensure discount doesn't violate merchant's floor
9. Introduce discount on message 2 or 3 (never message 1)

## Quick Start

### Prerequisites

- Node.js 20+
- Redis 7+
- PostgreSQL 16+ (or Supabase project)

### Local Development

```bash
# Clone and install
git clone <repo-url> && cd veyra-backend
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Push database schema
npm run migrate

# Start all processes (3 terminals)
npm run dev          # HTTP server
npm run worker       # Worker process
npm run scheduler    # Scheduler process
```

### Docker Compose

```bash
cp .env.example .env
# Edit .env with your credentials

docker compose up --build
```

This starts:
- HTTP server on port 3000
- 2 worker replicas
- 1 scheduler
- Redis
- PostgreSQL

## Production Deployment

### Recommended: Railway / Render / Fly.io

Deploy three services from the same Docker image:

| Service      | Command                        | Replicas |
|-------------|--------------------------------|----------|
| `server`    | `node dist/server.js`          | 2+       |
| `worker`    | `node dist/workers/index.js`   | 2+       |
| `scheduler` | `node dist/scheduler/index.js` | 1        |

### Infrastructure

| Component  | Recommended                          |
|-----------|---------------------------------------|
| Database  | Supabase (managed Postgres)           |
| Redis     | Upstash (serverless) or Redis Cloud   |
| Hosting   | Railway, Render, or Fly.io            |
| DNS       | Cloudflare                            |
| Monitoring| Datadog, Grafana Cloud, or Axiom      |

### Scaling Strategy

| Load Range      | Architecture                              |
|-----------------|-------------------------------------------|
| 10-100 stores   | Single instance of each process           |
| 100-1,000       | 2-3 server replicas, 2-4 worker replicas  |
| 1,000-10,000    | Dedicated Redis, read replicas, CDN       |
| 10,000+         | Separate queues per flow, sharded Redis   |

## Key Design Decisions

1. **Modular monolith over microservices**: Each flow is a separate module with clear inputs/outputs. Can be extracted to a service later if needed, but avoids premature distributed complexity.

2. **BullMQ over custom queue**: Battle-tested, backpressure-safe, rate limiting built in. Avoids reinventing the wheel.

3. **Custom state machine over XState**: The recovery lifecycle is simple enough that a typed transition table is clearer and has zero dependencies.

4. **Drizzle over Prisma**: Lighter weight, closer to SQL, better for performance-critical queries. Type-safe without code generation.

5. **Idempotency everywhere**: Every webhook, every queue job, every state transition uses idempotency keys. This prevents duplicate messages and double-billing.

6. **Holdout groups**: 10% of abandons receive no messages, measuring Veyra's true incremental impact. This is critical for demonstrating ROI to merchants.

7. **Encrypted tokens**: Shopify access tokens are AES-256-GCM encrypted at rest. Redacted on uninstall.

## Engineering Assumptions

- **No COGS data**: Margin safety is enforced via merchant-configured max discount %. Future: integrate Shopify product metafields.
- **Rule-based scoring**: Recovery probability and discount sensitivity use heuristic scoring. Future: ML models trained on recovery outcome data.
- **Send-time optimization**: Timezone-based quiet hours for MVP. Future: per-customer ML-based send time optimization.
- **Cart abandon detection**: Requires client-side tracking integration (Shopify ScriptTag). Browse abandon requires analytics pixel.
- **Template rendering**: Inline HTML templates for MVP. Future: merchant-customizable template builder.
- **Single currency per store**: Cart values use the store's configured currency. Multi-currency conversion is a future enhancement.

## API Endpoints

| Method | Path                           | Purpose                    |
|--------|--------------------------------|----------------------------|
| GET    | `/health`                      | Health check               |
| GET    | `/auth/shopify`                | Initiate OAuth             |
| GET    | `/auth/shopify/callback`       | OAuth callback             |
| POST   | `/webhooks/shopify/*`          | Shopify webhook receiver   |
| GET    | `/t/open/:trackingId`          | Email open tracking pixel  |
| GET    | `/t/click/:trackingId`         | Click tracking + redirect  |
| GET    | `/api/dashboard/metrics`       | Dashboard metrics API      |
| POST   | `/webhooks/stripe`             | Stripe webhook receiver    |
