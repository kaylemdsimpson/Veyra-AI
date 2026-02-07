/**
 * Worker Process Entry Point
 *
 * Runs all BullMQ workers that process queued jobs.
 * Deployed separately from the HTTP server for independent scaling.
 *
 * Usage:
 *   npm run worker     (development)
 *   npm run worker:prod (production)
 */

import { loadEnv } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { createWorker, QUEUES } from "../lib/queue.js";
import { closeAllQueues } from "../lib/queue.js";
import { closeRedis } from "../lib/redis.js";
import { closeDb } from "../db/client.js";

// Flow imports
import { registerWebhooks } from "../flows/02-webhook-registration/service.js";
import { handleAppUninstall } from "../flows/03-app-uninstall/service.js";
import { syncStore } from "../flows/04-store-sync/service.js";
import { syncAllCustomers } from "../flows/05-customer-sync/service.js";
import { handleCheckoutCreated } from "../flows/06-checkout-created/service.js";
import { handleCheckoutUpdated } from "../flows/07-checkout-updated/service.js";
import { detectCheckoutAbandon } from "../flows/08-checkout-abandon-detector/service.js";
import { handleOrderCreated } from "../flows/11-order-created/service.js";
import { resolveAttribution } from "../flows/12-order-attribution/service.js";
import { normaliseAbandon } from "../flows/13-abandon-normaliser/service.js";
import { scoreRecoveryProbability } from "../flows/19-recovery-probability-scorer/service.js";
import { scoreDiscountSensitivity } from "../flows/20-discount-sensitivity-scorer/service.js";
import { calculateCustomerLtv } from "../flows/18-ltv-calculator/service.js";
import { transitionAbandonState } from "../flows/16-recovery-state-machine/service.js";
import { assignHoldoutGroup } from "../flows/30-holdout-group/service.js";
import { buildMessageSequence } from "../flows/28-message-sequence-builder/service.js";
import { optimiseSendTimes } from "../flows/29-send-time-optimiser/service.js";
import { sendEmail } from "../flows/33-email-sender/service.js";
import { sendSms } from "../flows/34-sms-sender/service.js";
import { sendWhatsApp } from "../flows/35-whatsapp-sender/service.js";
import { calculateDiscountValue } from "../flows/24-discount-value-calculator/service.js";
import { generateCoupon } from "../flows/26-dynamic-coupon-generator/service.js";
import { writeLedgerEntry } from "../flows/41-recovery-ledger/service.js";
import { reportUsageToStripe } from "../flows/44-stripe-usage-reporter/service.js";
import { detectThirdPartyTools, getCoordinationRecommendation } from "../lib/third-party-detector.js";
import { getDb } from "../db/client.js";
import { stores } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

loadEnv();
const log = createLogger("workers");

// ─── Webhook Processing Worker ────────────────────────────────
createWorker({
  queueName: QUEUES.WEBHOOK_PROCESS,
  handler: async (job) => {
    const { type, shop, payload, storeId } = job.data as any;

    // Resolve storeId from shop domain if needed
    let resolvedStoreId = storeId;
    if (!resolvedStoreId && shop) {
      const db = getDb();
      const store = await db.query.stores.findFirst({
        where: eq(stores.shopifyDomain, shop),
      });
      resolvedStoreId = store?.id;
    }

    if (!resolvedStoreId && type !== "app.uninstalled") {
      log.warn({ type, shop }, "Could not resolve store ID");
      return;
    }

    switch (type) {
      case "register_webhooks":
        await registerWebhooks(resolvedStoreId, shop);
        break;
      case "checkout.created":
        await handleCheckoutCreated(resolvedStoreId, payload);
        break;
      case "checkout.updated":
        await handleCheckoutUpdated(resolvedStoreId, payload);
        break;
      case "order.created":
        await handleOrderCreated(resolvedStoreId, payload);
        break;
      case "app.uninstalled":
        await handleAppUninstall(shop);
        break;
      case "customer.updated":
        // Handled by customer sync upsert
        break;
      default:
        log.warn({ type }, "Unknown webhook type");
    }
  },
  concurrency: 10,
});

// ─── Store Sync Worker ────────────────────────────────────────
createWorker({
  queueName: QUEUES.STORE_SYNC,
  handler: async (job) => {
    const { storeId, shop } = job.data as any;
    await syncStore(storeId, shop);
  },
  concurrency: 5,
});

// ─── Customer Sync Worker ─────────────────────────────────────
createWorker({
  queueName: QUEUES.CUSTOMER_SYNC,
  handler: async (job) => {
    const { storeId, shop } = job.data as any;
    await syncAllCustomers(storeId, shop);
  },
  concurrency: 3,
});

// ─── Abandon Detection Worker ─────────────────────────────────
createWorker({
  queueName: QUEUES.ABANDON_DETECT,
  handler: async (job) => {
    const { abandonId, storeId } = job.data as any;
    await detectCheckoutAbandon(abandonId, storeId);
  },
  concurrency: 10,
});

// ─── Abandon Normalisation Worker ─────────────────────────────
createWorker({
  queueName: QUEUES.ABANDON_NORMALISE,
  handler: async (job) => {
    const { abandonId, storeId } = job.data as any;
    await normaliseAbandon(abandonId, storeId);
  },
  concurrency: 10,
});

// ─── Scoring Worker ───────────────────────────────────────────
createWorker({
  queueName: QUEUES.ABANDON_SCORE,
  handler: async (job) => {
    const { abandonId, storeId } = job.data as any;

    // Run all scoring in sequence
    await transitionAbandonState(abandonId, "START_SCORING");

    const score = await scoreRecoveryProbability(abandonId);

    const db = getDb();
    const { abandons: abandonTable } = await import("../db/schema/index.js");
    const abandon = await db.query.abandons.findFirst({
      where: eq(abandonTable.id, abandonId),
    });

    if (abandon?.customerId) {
      await calculateCustomerLtv(abandon.customerId);
      await scoreDiscountSensitivity(abandon.customerId, abandonId);
    }

    await transitionAbandonState(abandonId, "SCORED");

    // Check holdout group
    const isHoldout = await assignHoldoutGroup(abandonId, storeId);
    if (isHoldout) return;

    // Build message sequence
    await buildMessageSequence(abandonId, storeId);
  },
  concurrency: 10,
});

// ─── Message Schedule Worker ──────────────────────────────────
createWorker({
  queueName: QUEUES.MESSAGE_SCHEDULE,
  handler: async (job) => {
    const { abandonId, storeId } = job.data as any;
    await transitionAbandonState(abandonId, "SCHEDULE_SEND");
    await optimiseSendTimes(abandonId, storeId);
  },
  concurrency: 5,
});

// ─── Message Send Worker ──────────────────────────────────────
createWorker({
  queueName: QUEUES.MESSAGE_SEND,
  handler: async (job) => {
    const { messageId, channel } = job.data as any;

    // Check if discount coupon needs to be generated
    const db = getDb();
    const { messages: msgTable, abandons: abanTable } = await import("../db/schema/index.js");
    const msg = await db.query.messages.findFirst({
      where: eq(msgTable.id, messageId),
    });

    if (msg?.includesDiscount === 1 && !msg.couponCode) {
      const discount = await calculateDiscountValue(msg.abandonId, msg.storeId);
      if (discount) {
        const coupon = await generateCoupon({
          abandonId: msg.abandonId,
          storeId: msg.storeId,
          discountPercent: discount.discountPercent,
          discountType: discount.discountType,
          minimumOrderAmount: discount.minimumOrderAmount,
        });
        if (coupon) {
          await db
            .update(msgTable)
            .set({
              couponCode: coupon.code,
              discountPercent: String(discount.discountPercent),
              updatedAt: new Date(),
            })
            .where(eq(msgTable.id, messageId));
        }
      }
    }

    const resolvedChannel = channel ?? msg?.channel;
    switch (resolvedChannel) {
      case "email":
        await sendEmail(messageId);
        break;
      case "sms":
        await sendSms(messageId);
        break;
      case "whatsapp":
        await sendWhatsApp(messageId);
        break;
      default:
        log.warn({ messageId, channel: resolvedChannel }, "Unknown channel");
    }
  },
  concurrency: 20,
  limiter: { max: 50, duration: 1000 }, // 50 messages per second
});

// ─── Message Retry Worker ─────────────────────────────────────
createWorker({
  queueName: QUEUES.MESSAGE_RETRY,
  handler: async (job) => {
    const { messageId, channel } = job.data as any;
    switch (channel) {
      case "email":
        await sendEmail(messageId);
        break;
      case "sms":
        await sendSms(messageId);
        break;
      case "whatsapp":
        await sendWhatsApp(messageId);
        break;
    }
  },
  concurrency: 5,
});

// ─── Discount Workers ─────────────────────────────────────────
createWorker({
  queueName: QUEUES.DISCOUNT_EVALUATE,
  handler: async (job) => {
    const { abandonId, storeId } = job.data as any;
    await calculateDiscountValue(abandonId, storeId);
  },
  concurrency: 5,
});

createWorker({
  queueName: QUEUES.COUPON_CREATE,
  handler: async (job) => {
    const data = job.data as any;
    await generateCoupon(data);
  },
  concurrency: 5,
});

// ─── Attribution Worker ───────────────────────────────────────
createWorker({
  queueName: QUEUES.RECOVERY_ATTRIBUTION,
  handler: async (job) => {
    await resolveAttribution(job.data as any);
  },
  concurrency: 10,
});

// ─── Ledger Worker ────────────────────────────────────────────
createWorker({
  queueName: QUEUES.LEDGER_WRITE,
  handler: async (job) => {
    await writeLedgerEntry(job.data as any);
  },
  concurrency: 5,
});

// ─── Stripe Reporting Worker ──────────────────────────────────
createWorker({
  queueName: QUEUES.STRIPE_REPORT,
  handler: async (job) => {
    await reportUsageToStripe(job.data as any);
  },
  concurrency: 3,
});

// ─── Third-Party Detection Worker ────────────────────────────
createWorker({
  queueName: QUEUES.THIRD_PARTY_DETECT,
  handler: async (job) => {
    const { storeId, shop } = job.data as any;

    const db = getDb();
    const store = await db.query.stores.findFirst({
      where: eq(stores.id, storeId),
      columns: { id: true, shopifyAccessToken: true },
    });

    if (!store) return;

    const tools = await detectThirdPartyTools(shop, store.shopifyAccessToken);
    const recommendation = getCoordinationRecommendation(tools);

    // Persist detected tools and recommendation
    await db
      .update(stores)
      .set({
        detectedTools: tools,
        thirdPartyDetectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(stores.id, storeId));

    log.info(
      {
        storeId,
        shop,
        toolCount: tools.length,
        tools: tools.map((t) => t.name),
        recommendedMode: recommendation.recommendedMode,
      },
      "Third-party detection complete",
    );
  },
  concurrency: 3,
});

// ─── Graceful Shutdown ────────────────────────────────────────
async function shutdown(signal: string) {
  log.info({ signal }, "Worker shutting down");
  await closeAllQueues();
  await closeRedis();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

log.info("All workers started");
