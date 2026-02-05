import { getDb } from "../../db/client.js";
import { customers } from "../../db/schema/index.js";
import { eq, and, gt } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("flow:ltv-calculator");

/**
 * Flow 18: LTV Calculator
 *
 * Calculates customer lifetime value using a simplified model:
 *   LTV = AOV × Purchase Frequency × Projected Lifespan
 *
 * Where:
 *   AOV = Total Spent / Order Count
 *   Purchase Frequency = Orders per year
 *   Projected Lifespan = Based on recency decay (1-3 years)
 *
 * Engineering assumption: We use historical data only.
 * Predictive LTV (ML-based) is a future enhancement.
 */
export async function calculateCustomerLtv(customerId: string): Promise<number> {
  const db = getDb();

  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, customerId),
  });

  if (!customer) return 0;

  const totalOrders = customer.totalOrders ?? 0;
  const totalSpent = parseFloat(customer.totalSpent ?? "0");

  if (totalOrders === 0 || totalSpent === 0) {
    await db
      .update(customers)
      .set({ ltv: "0", updatedAt: new Date() })
      .where(eq(customers.id, customerId));
    return 0;
  }

  // AOV
  const aov = totalSpent / totalOrders;

  // Purchase frequency (annualised)
  const firstOrderDate = customer.createdAt;
  const lastOrderDate = customer.lastOrderAt ?? new Date();
  const daysSinceFirst = Math.max(
    1,
    (lastOrderDate.getTime() - firstOrderDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const annualFrequency = totalOrders > 1
    ? (totalOrders / daysSinceFirst) * 365
    : 1; // Single-purchase customer assumed 1/year

  // Projected lifespan based on recency
  const daysSinceLastOrder = customer.lastOrderAt
    ? (Date.now() - customer.lastOrderAt.getTime()) / (1000 * 60 * 60 * 24)
    : 365;

  let projectedYears: number;
  if (daysSinceLastOrder < 90) {
    projectedYears = 3;
  } else if (daysSinceLastOrder < 180) {
    projectedYears = 2;
  } else if (daysSinceLastOrder < 365) {
    projectedYears = 1.5;
  } else {
    projectedYears = 1;
  }

  const ltv = aov * annualFrequency * projectedYears;

  await db
    .update(customers)
    .set({ ltv: ltv.toFixed(2), updatedAt: new Date() })
    .where(eq(customers.id, customerId));

  log.debug(
    { customerId, aov, annualFrequency, projectedYears, ltv },
    "LTV calculated",
  );

  return ltv;
}

/**
 * Batch recalculate LTV for all customers of a store.
 */
export async function recalculateStoreLtv(storeId: string): Promise<void> {
  const db = getDb();

  const storeCustomers = await db.query.customers.findMany({
    where: and(
      eq(customers.storeId, storeId),
      gt(customers.totalOrders, 0),
    ),
    columns: { id: true },
  });

  for (const customer of storeCustomers) {
    await calculateCustomerLtv(customer.id);
  }

  log.info({ storeId, count: storeCustomers.length }, "Store LTV recalculation complete");
}
