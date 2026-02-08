# Veyra — Investor Brief

## What Veyra Does

Veyra is an abandoned checkout recovery and smart discount platform for Shopify merchants. It automatically detects when a shopper abandons a checkout, cart, or browsing session and recovers the sale through intelligently timed, multi-channel messages (email, SMS, WhatsApp) with optional dynamic discounting.

Merchants install a single JavaScript snippet into their Shopify store. From that point forward, every recovery flow runs automatically on Veyra's infrastructure. Merchants never write logic, configure workflows, or manage campaigns. Veyra handles detection, scoring, messaging, attribution, and billing autonomously.

---

## The Problem

Shopify stores lose an estimated 70% of carts to abandonment. Existing solutions (Klaviyo, Omnisend, Mailchimp) require merchants to build and maintain recovery workflows manually — setting up triggers, writing email templates, configuring timing, and guessing at discount strategy. Most merchants either never finish setup or run a single generic "You left something behind" email.

The result: merchants leave recoverable revenue on the table because the tools demand too much operational effort.

---

## How Veyra Solves It

### Zero-Configuration Recovery

Veyra runs 48 coordinated backend flows that cover the entire recovery lifecycle. There is no visual workflow builder, no drag-and-drop editor, and no manual campaign setup. The system activates flows automatically based on each store's settings and detected environment.

### The 48-Flow Architecture

Every abandon goes through a deterministic pipeline:

| Phase | Flows | What Happens |
|-------|-------|--------------|
| **Detection** | 1-10 | Shopify OAuth, webhook registration, checkout/cart/browse abandon detection, customer sync |
| **Normalization** | 11-15 | Order creation tracking, attribution matching, abandon deduplication, expiry timers |
| **State Machine** | 16 | Deterministic lifecycle: detected -> qualified -> scoring -> sequencing -> awaiting_send -> sending -> engaged -> recovered |
| **Scoring** | 17-21 | VIP detection, LTV calculation, recovery probability scoring, discount sensitivity scoring, channel preference |
| **Smart Discounting** | 22-27 | Margin safety checks, discount eligibility, value calculation, timing optimization, dynamic coupon generation, coupon expiry |
| **Messaging** | 28-32 | Sequence building, send-time optimization, holdout groups, message queue management, retry/failover |
| **Delivery** | 33-36 | Email (Resend), SMS (Twilio), WhatsApp (Twilio), provider health monitoring |
| **Tracking** | 37-40 | Open tracking, click tracking, conversion matching, confidence scoring |
| **Billing** | 41-44 | Recovery ledger, fee calculation, billing aggregation, Stripe usage reporting |
| **Operations** | 45-48 | Third-party conflict detection, auto-pause, error logging, dashboard metrics |

### State Machine

Every abandon transitions through a typed state machine with explicit guards:

```
detected -> qualified -> scoring -> sequencing -> awaiting_send -> sending -> engaged -> recovered
                                                                                          |
Terminal states: recovered, expired, cancelled, holdout
```

No abandon can skip states. Every transition is validated, persisted, and logged. This guarantees auditability and prevents double-sends or orphaned messages.

### Scoring Engines

**Recovery Probability Scorer** — Estimates likelihood of recovery (0.01-0.99) using:
- Abandon type (checkout: +0.15, cart: +0.05, browse: -0.10)
- Cart value sweet spot ($50-$200: +0.05)
- Customer loyalty (3+ orders: +0.15, returning: +0.08)
- Recency (under 1 hour: +0.10, over 48 hours: -0.20)
- Channel availability (email + SMS: +0.05)
- VIP status (+0.10)

**Discount Sensitivity Scorer** — Determines if/how much discount is needed (0.01-0.99) using:
- Previous discount usage patterns
- Recovery history (converted with vs. without incentives)
- VIP status (VIPs need fewer discounts)
- Cart value relative to AOV
- Lifetime value

These are rule-based scoring models for launch, designed to be replaced with trained ML models once sufficient recovery data is collected.

### Order Attribution

Veyra uses multi-signal attribution with confidence scoring:

| Signal | Confidence |
|--------|-----------|
| Checkout token match | 0.95 |
| Cart token match | 0.85 |
| Click within 24h | +0.15 boost |
| Veyra coupon used | +0.20 boost |
| Email match only | 0.40 baseline |

Only recoveries with confidence >= 0.50 are billed. This protects merchants from paying for coincidental conversions.

---

## Installation Experience

Merchants paste a single `<script>` tag into their Shopify theme:

```html
<script src="https://api.veyra.io/snippet/v.js"
  data-token="veyra_<token>_<storeId>"
  async></script>
```

The snippet (~60 lines) is a minimal IIFE that:
1. Intercepts Shopify cart API calls (fetch/XHR to `/cart/add.js`, `/cart/update.js`, `/cart/change.js`)
2. Detects browse abandons via `ShopifyAnalytics.meta`
3. Sends events to Veyra's ingest endpoint with the domain-bound token

All heavy logic runs server-side. The snippet contains zero business logic.

### Domain-Bound Security

Tokens are HMAC-SHA256 signed over `storeId:domain` using the app secret. Every ingest request validates the token against the `Origin` or `Referer` header. If a merchant shares their snippet with another store on a different domain, the token is rejected with a 403.

---

## Third-Party Coordination

Veyra automatically detects 12 competing tools already installed on a merchant's store:

Klaviyo, Omnisend, Postscript, Mailchimp, Drip, Attentive, Yotpo/SMSBump, Privy, Recart, Shopify built-in recovery, Sendlane, Retention.com

Detection runs via the Shopify ScriptTag API immediately after install.

### Three Coordination Modes

| Mode | Behavior |
|------|----------|
| **Complement** (default) | Veyra fills gaps — sends on channels the third-party tool doesn't cover, delays messages to avoid overlap, reduces volume on shared channels |
| **Replace** | Veyra handles all recovery; third-party tools ignored |
| **Monitor** | Veyra tracks everything but sends no messages; used for A/B comparison |

In complement mode, Veyra applies smart delays based on known third-party timing:
- Klaviyo detected on email: Veyra delays +5 hours
- Omnisend detected on email: Veyra delays +3 hours
- Shopify built-in: Veyra delays +1 hour

This means merchants can install Veyra alongside their existing tools and immediately see incremental recovered revenue.

---

## Revenue Model

### Usage-Based Pricing via Stripe Metered Billing

Veyra charges a percentage of recovered revenue (net of discounts). Merchants only pay when Veyra recovers a sale.

**How it works:**

1. An order comes in that matches an active abandon (Flow 11-12)
2. Attribution confidence is calculated (checkout token, cart token, click, coupon signals)
3. Only recoveries with confidence >= 0.50 are billable
4. The fee is calculated as a percentage of net revenue (order total minus discount given)
5. Fees are written to a recovery ledger with full audit trail
6. At period end, aggregated fees are reported to Stripe as metered usage
7. Stripe generates the invoice automatically

**Key properties of this model:**
- Zero upfront cost for merchants
- Perfect alignment of incentives (Veyra only earns when merchants earn)
- Transparent attribution with confidence scoring
- Full ledger audit trail for every charged recovery

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+, TypeScript (strict) |
| API Server | Fastify 5 with helmet, CORS, rate limiting |
| Database | PostgreSQL via Drizzle ORM |
| Queue | BullMQ on Redis (ioredis) |
| Email | Resend |
| SMS/WhatsApp | Twilio |
| Billing | Stripe (metered billing) |
| Error Tracking | Sentry |
| Logging | Pino (structured JSON) |
| Dashboard | Next.js (React), Tailwind CSS, shadcn/ui |
| Validation | Zod (env, inputs, schemas) |
| Testing | Vitest |
| Migrations | Drizzle Kit with auto-migration on boot |

---

## Dashboard

The merchant dashboard provides:

- **Overview** — recovered revenue, active abandons, recovery rate, fee summary
- **Campaigns** — per-flow performance metrics
- **Settings** — install snippet with copy-to-clipboard, flow status (active/inactive per flow), detected third-party tools with coordination mode selection
- **Onboarding** — Shopify OAuth connection flow

The dashboard runs in demo mode when no backend is connected, allowing investors and prospects to experience the full UI without a live Shopify store.

---

## Competitive Positioning

| | Klaviyo / Omnisend | Shopify Built-in | Veyra |
|---|---|---|---|
| Setup time | Hours-days (build flows) | Automatic (1 email) | Automatic (48 flows) |
| Channels | Email + SMS (manual) | Email only | Email + SMS + WhatsApp |
| Discounting | Manual rules | None | Dynamic per-customer scoring |
| Attribution | Basic | Basic | Multi-signal with confidence scoring |
| Pricing | Monthly subscription | Free (limited) | Usage-based (pay on recovery) |
| Third-party aware | No | No | Yes (12 tools detected, 3 coordination modes) |

### Defensibility

1. **48-flow pipeline** — Not a single feature; it's an integrated system. Reproducing the full pipeline (detection, scoring, discounting, messaging, attribution, billing) requires significant engineering investment.

2. **Scoring models improve with data** — Rule-based at launch, designed for ML model training as recovery data accumulates. Each merchant's data improves scoring for all merchants.

3. **Third-party coordination** — Veyra is the only tool that detects competing tools and adjusts behavior. This makes it safe to install alongside existing stacks, lowering the adoption barrier.

4. **Usage-based moat** — Merchants who see recovered revenue have no reason to churn. The cost scales with value delivered.

---

## Anticipated Investor Questions

### "How big is the market?"

Shopify has 4.6M+ active stores. Cart abandonment averages 70%. Even conservative estimates of recoverable revenue per store ($500-$5,000/month for mid-market merchants) put the addressable market in the billions.

### "Why wouldn't Shopify just build this?"

Shopify's built-in recovery sends a single generic email. Building a 48-flow scoring and discounting engine is not aligned with Shopify's platform strategy — they build primitives, not vertical SaaS. Shopify's app ecosystem exists precisely because they rely on third parties for specialized functionality.

### "Why wouldn't Klaviyo add this?"

Klaviyo's business model is selling a general-purpose marketing automation platform. Their value proposition is flexibility — letting merchants build any workflow. Veyra's value proposition is the opposite: merchants build nothing. These are fundamentally different product philosophies. Klaviyo adding a "zero-config" mode would undermine their core positioning.

### "What if a merchant already uses Klaviyo?"

Veyra detects Klaviyo (and 11 other tools) on install and defaults to "complement" mode — filling channel gaps and timing gaps rather than competing. The merchant sees incremental recovered revenue from day one without disrupting their existing setup.

### "How do you prevent merchants from gaming attribution?"

Attribution requires confidence >= 0.50 to be billable. Confidence is calculated from server-side signals (checkout tokens, cart tokens, click tracking, coupon usage) that merchants cannot fabricate. The recovery ledger provides a full audit trail.

### "What's your unit economics?"

- **CAC**: Low. One-click Shopify app install + single snippet paste. No sales team required for SMB.
- **LTV**: Usage-based, so LTV scales with merchant GMV. A store recovering $5,000/month at a 10% fee generates $500/month.
- **Gross margin**: High. Infrastructure costs (compute, email/SMS delivery) are a fraction of recovered revenue.
- **Churn risk**: Low. Merchants see direct revenue attribution. Removing Veyra means losing measurable recovered revenue.

### "What's the go-to-market strategy?"

1. **Shopify App Store** — organic discovery, reviews-driven growth
2. **Content marketing** — abandoned cart recovery benchmarks, case studies
3. **Partner channel** — Shopify agencies who manage multiple stores
4. **Complement positioning** — "Install alongside Klaviyo" removes the switching cost objection

### "What's your current traction?"

[Insert current metrics: stores installed, recoveries processed, revenue recovered, MRR]

### "What are you raising and what will you use it for?"

[Insert raise amount and allocation: engineering, infrastructure, go-to-market, etc.]

---

## Technical Architecture Diagram

```
Shopify Store
    |
    | (v.js snippet — cart/browse events)
    v
Veyra Ingest API (Fastify)
    |
    | Domain-bound HMAC token validation
    v
BullMQ Job Queue (Redis)
    |
    |---> Detection Workers (Flows 6-10)
    |---> Normalization Workers (Flows 11-15)
    |---> State Machine (Flow 16)
    |---> Scoring Workers (Flows 17-21)
    |---> Discount Engine (Flows 22-27)
    |---> Message Pipeline (Flows 28-32)
    |---> Delivery (Flows 33-36: Resend, Twilio)
    |---> Tracking (Flows 37-40)
    |---> Billing Pipeline (Flows 41-44 -> Stripe)
    |---> Operations (Flows 45-48)
    v
PostgreSQL (Drizzle ORM)
    |
    v
Merchant Dashboard (Next.js)
```

---

## Summary

Veyra replaces manual recovery campaign management with a fully automated, 48-flow pipeline that scores, discounts, messages, attributes, and bills — all from a single script tag install. Usage-based pricing aligns incentives. Third-party coordination removes adoption friction. The architecture is built for scale: typed state machines, structured logging, queue-based processing, and metered billing via Stripe.

**Contact:** [Insert contact information]
