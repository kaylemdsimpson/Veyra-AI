import { getDb } from "../../db/client.js";
import { customers } from "../../db/schema/index.js";
import { eq, and, gt, desc } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("flow:vip-detection");

/**
 * Flow 17: VIP Detection
 *
 * Classifies customers as VIP based on:
 *  - Order count (top 10% of store)
 *  - Total spend (top 10% of store)
 *  - Recency (ordered in last 90 days)
 *
 * VIP customers get:
 *  - Higher priority in message queue
 *  - More aggressive recovery (but still margin-safe)
 *  - Potentially higher discount ceiling
 *
 * Runs per-store on a schedule (daily) or on customer update.
 */

interface VipThresholds {
  minOrders: number;
  minSpend: number;
}

export async function detectVipCustomers(storeId: string): Promise<number> {
  const db = getDb();

  // Get all customers for this store with orders
  const allCustomers = await db.query.customers.findMany({
    where: and(
      eq(customers.storeId, storeId),
      gt(customers.totalOrders, 0),
    ),
    columns: {
      id: true,
      totalOrders: true,
      totalSpent: true,
      lastOrderAt: true,
    },
    orderBy: desc(customers.totalSpent),
  });

  if (allCustomers.length < 5) {
    // Too few customers to determine VIP threshold
    return 0;
  }

  // Calculate top 10% thresholds
  const topIndex = Math.max(1, Math.floor(allCustomers.length * 0.1));
  const topCustomers = allCustomers.slice(0, topIndex);
  const thresholdCustomer = topCustomers[topCustomers.length - 1]!;

  const thresholds: VipThresholds = {
    minOrders: thresholdCustomer.totalOrders ?? 3,
    minSpend: parseFloat(thresholdCustomer.totalSpent ?? "100"),
  };

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  let vipCount = 0;

  for (const customer of allCustomers) {
    const orders = customer.totalOrders ?? 0;
    const spent = parseFloat(customer.totalSpent ?? "0");
    const isRecent = customer.lastOrderAt && customer.lastOrderAt > ninetyDaysAgo;

    // VIP if in top 10% by spend AND has recency
    const isVip =
      spent >= thresholds.minSpend &&
      orders >= Math.max(2, thresholds.minOrders) &&
      isRecent;

    await db
      .update(customers)
      .set({ isVip: !!isVip, updatedAt: new Date() })
      .where(eq(customers.id, customer.id));

    if (isVip) vipCount++;
  }

  log.info(
    { storeId, totalCustomers: allCustomers.length, vipCount, thresholds },
    "VIP detection complete",
  );

  return vipCount;
}

/**
 * Check if a specific customer is VIP.
 */
export async function isCustomerVip(customerId: string): Promise<boolean> {
  const db = getDb();
  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, customerId),
    columns: { isVip: true },
  });
  return customer?.isVip ?? false;
}
