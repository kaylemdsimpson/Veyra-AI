import { getDb } from "../../db/client.js";
import { abandons, customers, coupons, stores } from "../../db/schema/index.js";
import { eq, and, gt, desc } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import type { StoreSettings } from "../../db/schema/stores.js";

const log = createLogger("flow:discount-eligibility");

/**
 * Flow 23: Discount Eligibility Engine
 *
 * CORE PRINCIPLE: Discounts are a LAST RESORT, not the default.
 *
 * Decision tree:
 *  1. Is the customer likely to convert WITHOUT a discount?
 *     → If recovery probability > 0.7 AND discount sensitivity < 0.3 → NO DISCOUNT
 *  2. Has the customer received a discount recently?
 *     → If discount used in last 30 days → NO DISCOUNT (abuse prevention)
 *  3. Is this a first-time abandon?
 *     → First touch is always NO DISCOUNT (try organic first)
 *  4. Is the cart value high enough to justify a discount?
 *     → Cart under $25 → NO DISCOUNT (margins too thin)
 *  5. Pass all gates → ELIGIBLE for discount (calculated in Flow 24)
 */

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
  sequenceStepForDiscount: number; // Which message in the sequence should include the discount
}

export async function checkDiscountEligibility(
  abandonId: string,
  storeId: string,
): Promise<EligibilityResult> {
  const db = getDb();

  const abandon = await db.query.abandons.findFirst({
    where: eq(abandons.id, abandonId),
  });

  if (!abandon) {
    return { eligible: false, reason: "Abandon not found", sequenceStepForDiscount: 0 };
  }

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  });
  const settings = store?.settings as StoreSettings | undefined;

  // ─── Gate 1: Recovery probability check ─────────────────────
  const recoveryScore = parseFloat(abandon.recoveryScore ?? "0.5");
  let discountSensitivity = 0.5;

  if (abandon.customerId) {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, abandon.customerId),
    });
    discountSensitivity = parseFloat(customer?.discountSensitivity ?? "0.5");

    // High probability + low sensitivity → likely converts without incentive
    if (recoveryScore > 0.7 && discountSensitivity < 0.3) {
      log.info({ abandonId }, "High recovery probability, no discount needed");
      return {
        eligible: false,
        reason: "High recovery probability without incentive",
        sequenceStepForDiscount: 0,
      };
    }

    // ─── Gate 2: Recent discount abuse check ──────────────────
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentCoupon = await db.query.coupons.findFirst({
      where: and(
        eq(coupons.storeId, storeId),
        eq(coupons.status, "used"),
        gt(coupons.createdAt, thirtyDaysAgo),
      ),
      orderBy: desc(coupons.createdAt),
    });

    if (recentCoupon) {
      log.info({ abandonId, customerId: abandon.customerId }, "Recent discount used, not eligible");
      return {
        eligible: false,
        reason: "Customer used a discount within 30 days",
        sequenceStepForDiscount: 0,
      };
    }
  }

  // ─── Gate 3: First-touch rule ───────────────────────────────
  // Always try to recover without discount first. Discount goes in message 2 or 3.
  const maxMessages = settings?.maxMessagesPerRecovery ?? 3;

  // ─── Gate 4: Cart value floor ───────────────────────────────
  const cartTotal = parseFloat(abandon.cartTotal ?? "0");
  if (cartTotal < 25) {
    log.info({ abandonId, cartTotal }, "Cart too low for discount");
    return {
      eligible: false,
      reason: "Cart value below discount threshold ($25)",
      sequenceStepForDiscount: 0,
    };
  }

  // ─── Eligible ───────────────────────────────────────────────
  // Discount appears on message step 2 (for 2-msg sequence) or step 3 (for 3-msg)
  const discountStep = Math.max(2, maxMessages - 1);

  log.info(
    { abandonId, recoveryScore, discountSensitivity, discountStep },
    "Customer eligible for discount",
  );

  return {
    eligible: true,
    reason: "Passed all eligibility gates",
    sequenceStepForDiscount: discountStep,
  };
}
