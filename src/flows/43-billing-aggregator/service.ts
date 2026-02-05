import { getDb } from "../../db/client.js";
import { stores, recoveryLedger } from "../../db/schema/index.js";
import { eq, isNull } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { calculateStoreFees } from "../42-fee-calculator/service.js";
import { enqueue, QUEUES } from "../../lib/queue.js";

const log = createLogger("flow:billing-aggregator");

/**
 * Flow 43: Monthly Billing Aggregator
 *
 * Runs on the 1st of each month (scheduled).
 * Aggregates all recoveries from the previous month per store.
 * Triggers Stripe usage reporting for each store.
 */
export async function aggregateMonthlyBilling(): Promise<void> {
  const db = getDb();

  // Previous month's billing period
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const billingPeriod = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;

  // Get all active stores
  const activeStores = await db.query.stores.findMany({
    where: eq(stores.status, "active"),
    columns: { id: true, shopifyDomain: true, stripeCustomerId: true },
  });

  let totalStores = 0;
  let totalFees = 0;

  for (const store of activeStores) {
    const report = await calculateStoreFees(store.id, billingPeriod);

    if (report.totalFees > 0 && store.stripeCustomerId) {
      await enqueue(QUEUES.STRIPE_REPORT, {
        storeId: store.id,
        stripeCustomerId: store.stripeCustomerId,
        billingPeriod,
        totalFees: report.totalFees,
        totalRecoveries: report.totalRecoveries,
        totalNetRevenue: report.totalNetRevenue,
      });
      totalStores++;
      totalFees += report.totalFees;
    }
  }

  log.info(
    { billingPeriod, totalStores, totalFees: totalFees.toFixed(2) },
    "Monthly billing aggregation complete",
  );
}
