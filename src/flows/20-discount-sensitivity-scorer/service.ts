import { getDb } from "../../db/client.js";
import { customers, abandons, coupons } from "../../db/schema/index.js";
import { eq, and, desc } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("flow:discount-sensitivity-scorer");

/**
 * Flow 20: Discount Sensitivity Scorer
 *
 * Scores how likely a customer is to need a discount to convert (0.0 – 1.0).
 *
 * High sensitivity (close to 1.0) = likely needs a discount
 * Low sensitivity (close to 0.0) = will probably convert without incentive
 *
 * Factors:
 *  - Previous purchase history with discounts
 *  - Number of previous abandons that recovered vs expired
 *  - VIP status (VIPs are less discount-sensitive)
 *  - Cart value relative to historical AOV
 *
 * The Smart Discount Engine uses this to decide IF and HOW MUCH to discount.
 */
export async function scoreDiscountSensitivity(
  customerId: string | null,
  abandonId: string,
): Promise<number> {
  const db = getDb();

  let sensitivity = 0.5; // Baseline: 50/50

  if (!customerId) {
    // Unknown customer — assume moderate sensitivity
    const abandon = await db.query.abandons.findFirst({
      where: eq(abandons.id, abandonId),
    });
    if (abandon) {
      const cartTotal = parseFloat(abandon.cartTotal ?? "0");
      if (cartTotal > 150) sensitivity = 0.6; // Higher cart = more hesitant
      if (cartTotal < 30) sensitivity = 0.3; // Impulse range
    }
    return sensitivity;
  }

  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, customerId),
  });

  if (!customer) return sensitivity;

  // ─── VIP factor ─────────────────────────────────────────────
  if (customer.isVip) sensitivity -= 0.15;

  // ─── Previous discount usage ────────────────────────────────
  const previousCoupons = await db.query.coupons.findMany({
    where: and(
      eq(coupons.storeId, customer.storeId),
      eq(coupons.status, "used"),
    ),
    columns: { id: true },
    limit: 20,
  });

  if (previousCoupons.length > 3) {
    sensitivity += 0.2; // Discount-habituated
  } else if (previousCoupons.length === 0) {
    sensitivity -= 0.1; // Never needed a discount
  }

  // ─── Previous recovery history ──────────────────────────────
  const previousAbandons = await db.query.abandons.findMany({
    where: and(
      eq(abandons.customerId, customerId),
    ),
    columns: { state: true, discountOffered: true },
    orderBy: desc(abandons.createdAt),
    limit: 10,
  });

  const recoveredWithDiscount = previousAbandons.filter(
    (a) => a.state === "recovered" && parseFloat(a.discountOffered ?? "0") > 0,
  ).length;

  const recoveredWithout = previousAbandons.filter(
    (a) => a.state === "recovered" && parseFloat(a.discountOffered ?? "0") === 0,
  ).length;

  if (recoveredWithout > recoveredWithDiscount) {
    sensitivity -= 0.15; // Tends to convert without incentive
  } else if (recoveredWithDiscount > recoveredWithout) {
    sensitivity += 0.15; // Needs incentive
  }

  // ─── LTV factor ─────────────────────────────────────────────
  const ltv = parseFloat(customer.ltv ?? "0");
  if (ltv > 500) sensitivity -= 0.1; // High-value customers convert more easily

  // Clamp
  sensitivity = Math.max(0.01, Math.min(0.99, sensitivity));

  // Persist
  await db
    .update(customers)
    .set({ discountSensitivity: sensitivity.toFixed(4), updatedAt: new Date() })
    .where(eq(customers.id, customerId));

  log.debug({ customerId, sensitivity }, "Discount sensitivity scored");
  return sensitivity;
}
