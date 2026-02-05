import { getDb } from "../../db/client.js";
import { abandons, customers } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { checkMarginSafety } from "../22-margin-safety-check/service.js";

const log = createLogger("flow:discount-value-calculator");

/**
 * Flow 24: Discount Value Calculator
 *
 * Determines the optimal discount amount.
 *
 * Strategy: Use the MINIMUM effective discount.
 *
 * Tiered approach:
 *  - Low sensitivity (0.3-0.5): 5% discount
 *  - Medium sensitivity (0.5-0.7): 10% discount
 *  - High sensitivity (0.7-0.9): 15% discount (capped by store max)
 *  - Very high sensitivity (0.9+): Store max
 *
 * Adjusted by:
 *  - VIP status: +2% (we want to win them back)
 *  - Cart value > $200: -2% (higher absolute discount at lower %)
 *  - Cart value < $50: +2% (need stronger incentive for low carts)
 */

export interface DiscountCalculation {
  discountPercent: number;
  discountType: "percentage" | "fixed";
  discountValue: number; // Absolute $ value
  minimumOrderAmount: number;
}

export async function calculateDiscountValue(
  abandonId: string,
  storeId: string,
): Promise<DiscountCalculation | null> {
  const db = getDb();

  const abandon = await db.query.abandons.findFirst({
    where: eq(abandons.id, abandonId),
  });
  if (!abandon) return null;

  const cartTotal = parseFloat(abandon.cartTotal ?? "0");
  if (cartTotal <= 0) return null;

  // Get discount sensitivity
  let sensitivity = 0.5;
  let isVip = false;
  if (abandon.customerId) {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, abandon.customerId),
    });
    if (customer) {
      sensitivity = parseFloat(customer.discountSensitivity ?? "0.5");
      isVip = customer.isVip ?? false;
    }
  }

  // ─── Base discount from sensitivity tier ────────────────────
  let basePercent: number;
  if (sensitivity < 0.3) {
    basePercent = 0; // Shouldn't reach here (eligibility would block)
  } else if (sensitivity < 0.5) {
    basePercent = 5;
  } else if (sensitivity < 0.7) {
    basePercent = 10;
  } else if (sensitivity < 0.9) {
    basePercent = 15;
  } else {
    basePercent = 20; // Will be capped by margin safety
  }

  // ─── Adjustments ────────────────────────────────────────────
  if (isVip) basePercent += 2;
  if (cartTotal > 200) basePercent -= 2;
  if (cartTotal < 50 && cartTotal >= 25) basePercent += 2;

  basePercent = Math.max(5, basePercent); // Minimum 5% if discount is offered at all

  // ─── Margin safety check ────────────────────────────────────
  const marginCheck = await checkMarginSafety({
    storeId,
    cartTotal,
    proposedDiscountPercent: basePercent,
  });

  if (!marginCheck.approved) return null;

  const finalPercent = marginCheck.adjustedPercent;
  const discountValue = parseFloat((cartTotal * (finalPercent / 100)).toFixed(2));

  // Set minimum order at 80% of cart value to prevent cart manipulation
  const minimumOrderAmount = parseFloat((cartTotal * 0.8).toFixed(2));

  // Persist to abandon record
  await db
    .update(abandons)
    .set({
      discountOffered: finalPercent.toFixed(2),
      discountType: "percentage",
      updatedAt: new Date(),
    })
    .where(eq(abandons.id, abandonId));

  log.info(
    { abandonId, sensitivity, basePercent, finalPercent, discountValue },
    "Discount calculated",
  );

  return {
    discountPercent: finalPercent,
    discountType: "percentage",
    discountValue,
    minimumOrderAmount,
  };
}
