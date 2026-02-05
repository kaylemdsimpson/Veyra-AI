import Stripe from "stripe";
import { getDb } from "../../db/client.js";
import { recoveryLedger } from "../../db/schema/index.js";
import { eq, and, isNull } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { env } from "../../config/env.js";

const log = createLogger("flow:stripe-usage-reporter");

/**
 * Flow 44: Stripe Usage Reporter
 *
 * Reports recovered revenue to Stripe for usage-based billing.
 *
 * Uses Stripe Metered Billing:
 *  - Reports usage (fee amount in cents) to the subscription item
 *  - Stripe generates the invoice at period end
 *
 * Engineering assumption: Each store has a Stripe subscription with
 * a single metered price for recovery fees.
 */

export interface UsageReportInput {
  storeId: string;
  stripeCustomerId: string;
  billingPeriod: string;
  totalFees: number;
  totalRecoveries: number;
  totalNetRevenue: number;
}

export async function reportUsageToStripe(input: UsageReportInput): Promise<void> {
  const config = env();
  const stripe = new Stripe(config.STRIPE_SECRET_KEY);

  try {
    // Find the subscription for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: input.stripeCustomerId,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      log.warn(
        { storeId: input.storeId, stripeCustomerId: input.stripeCustomerId },
        "No active Stripe subscription found",
      );
      return;
    }

    const subscription = subscriptions.data[0]!;
    const meteredItem = subscription.items.data.find(
      (item) => item.price.id === config.STRIPE_PRICE_ID,
    );

    if (!meteredItem) {
      log.error(
        { storeId: input.storeId, subscriptionId: subscription.id },
        "No metered price item found on subscription",
      );
      return;
    }

    // Report usage in cents
    const feeCents = Math.round(input.totalFees * 100);

    await stripe.subscriptionItems.createUsageRecord(meteredItem.id, {
      quantity: feeCents,
      timestamp: Math.floor(Date.now() / 1000),
      action: "set",
    });

    // Mark ledger entries as reported
    const db = getDb();
    const unreported = await db.query.recoveryLedger.findMany({
      where: and(
        eq(recoveryLedger.storeId, input.storeId),
        eq(recoveryLedger.billingPeriod, input.billingPeriod),
        isNull(recoveryLedger.reportedToStripe),
      ),
    });

    for (const entry of unreported) {
      await db
        .update(recoveryLedger)
        .set({ reportedToStripe: new Date() })
        .where(eq(recoveryLedger.id, entry.id));
    }

    log.info(
      {
        storeId: input.storeId,
        billingPeriod: input.billingPeriod,
        feeCents,
        recoveries: input.totalRecoveries,
      },
      "Usage reported to Stripe",
    );
  } catch (err) {
    log.error(
      { storeId: input.storeId, err },
      "Failed to report usage to Stripe",
    );
    throw err; // Let BullMQ retry
  }
}
