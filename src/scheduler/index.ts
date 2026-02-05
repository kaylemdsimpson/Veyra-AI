/**
 * Scheduler Process Entry Point
 *
 * Runs periodic jobs via setInterval.
 * Deployed as a separate process (or co-located with workers).
 *
 * Jobs:
 *  - Expire abandoned recoveries (every 5 minutes)
 *  - Expire coupons (every 15 minutes)
 *  - Process message queue (every 1 minute)
 *  - Check provider health (every 5 minutes)
 *  - Check auto-pause (every 10 minutes)
 *  - VIP detection (daily)
 *  - LTV recalculation (daily)
 *  - Monthly billing aggregation (1st of month)
 */

import { loadEnv } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { closeRedis } from "../lib/redis.js";
import { closeDb, getDb } from "../db/client.js";
import { stores } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

import { processExpiredAbandons, processExpiredCoupons } from "../flows/15-expiry-timer/service.js";
import { processExpiredCoupons as cleanExpiredCoupons } from "../flows/27-coupon-expiry/service.js";
import { processMessageQueue } from "../flows/31-message-queue-manager/service.js";
import { checkProviderHealth } from "../flows/36-provider-health/service.js";
import { checkAutoPause } from "../flows/46-auto-pause/service.js";
import { detectVipCustomers } from "../flows/17-vip-detection/service.js";
import { recalculateStoreLtv } from "../flows/18-ltv-calculator/service.js";
import { aggregateMonthlyBilling } from "../flows/43-billing-aggregator/service.js";

loadEnv();
const log = createLogger("scheduler");

// ─── Job definitions ──────────────────────────────────────────
const jobs: Array<{
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
  lastRun?: number;
}> = [
  {
    name: "expire-abandons",
    intervalMs: 5 * 60_000, // 5 minutes
    handler: async () => {
      const count = await processExpiredAbandons();
      if (count > 0) log.info({ count }, "Expired abandons processed");
    },
  },
  {
    name: "expire-coupons",
    intervalMs: 15 * 60_000, // 15 minutes
    handler: async () => {
      await processExpiredCoupons();
      await cleanExpiredCoupons();
    },
  },
  {
    name: "message-queue",
    intervalMs: 60_000, // 1 minute
    handler: async () => {
      const count = await processMessageQueue();
      if (count > 0) log.info({ count }, "Messages queued for sending");
    },
  },
  {
    name: "provider-health",
    intervalMs: 5 * 60_000, // 5 minutes
    handler: async () => {
      await checkProviderHealth();
    },
  },
  {
    name: "auto-pause-check",
    intervalMs: 10 * 60_000, // 10 minutes
    handler: async () => {
      const db = getDb();
      const activeStores = await db.query.stores.findMany({
        where: eq(stores.status, "active"),
        columns: { id: true },
      });
      for (const store of activeStores) {
        await checkAutoPause(store.id);
      }
    },
  },
  {
    name: "vip-detection",
    intervalMs: 24 * 60 * 60_000, // 24 hours
    handler: async () => {
      const db = getDb();
      const activeStores = await db.query.stores.findMany({
        where: eq(stores.status, "active"),
        columns: { id: true },
      });
      for (const store of activeStores) {
        await detectVipCustomers(store.id);
      }
      log.info({ storeCount: activeStores.length }, "VIP detection complete");
    },
  },
  {
    name: "ltv-recalculation",
    intervalMs: 24 * 60 * 60_000, // 24 hours
    handler: async () => {
      const db = getDb();
      const activeStores = await db.query.stores.findMany({
        where: eq(stores.status, "active"),
        columns: { id: true },
      });
      for (const store of activeStores) {
        await recalculateStoreLtv(store.id);
      }
      log.info({ storeCount: activeStores.length }, "LTV recalculation complete");
    },
  },
  {
    name: "monthly-billing",
    intervalMs: 60 * 60_000, // Check every hour, but only run on 1st of month
    handler: async () => {
      const now = new Date();
      if (now.getDate() === 1 && now.getHours() === 2) {
        // Run at 2 AM on the 1st
        await aggregateMonthlyBilling();
      }
    },
  },
];

// ─── Scheduler loop ───────────────────────────────────────────
function startScheduler() {
  log.info({ jobCount: jobs.length }, "Scheduler started");

  for (const job of jobs) {
    // Run immediately on startup for short-interval jobs
    if (job.intervalMs <= 5 * 60_000) {
      runJob(job);
    }

    setInterval(() => runJob(job), job.intervalMs);
  }
}

async function runJob(job: (typeof jobs)[number]) {
  try {
    await job.handler();
  } catch (err) {
    log.error({ job: job.name, err }, "Scheduler job failed");
  }
}

// ─── Graceful Shutdown ────────────────────────────────────────
async function shutdown(signal: string) {
  log.info({ signal }, "Scheduler shutting down");
  await closeRedis();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startScheduler();
