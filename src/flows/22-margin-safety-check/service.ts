import { getDb } from "../../db/client.js";
import { stores } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import type { StoreSettings } from "../../db/schema/stores.js";

const log = createLogger("flow:margin-safety-check");

/**
 * Flow 22: Margin Safety Check
 *
 * Ensures any proposed discount does not violate the merchant's margin floor.
 *
 * Inputs:
 *  - Cart total
 *  - Proposed discount percentage
 *  - Store's max discount config
 *
 * Engineering assumption: We don't have access to COGS data.
 * Margin safety is enforced via the merchant's configured max discount %.
 * Future enhancement: integrate with Shopify product metafields for COGS.
 */

export interface MarginCheckInput {
  storeId: string;
  cartTotal: number;
  proposedDiscountPercent: number;
}

export interface MarginCheckResult {
  approved: boolean;
  maxAllowedPercent: number;
  adjustedPercent: number;
  reason: string;
}

export async function checkMarginSafety(
  input: MarginCheckInput,
): Promise<MarginCheckResult> {
  const db = getDb();

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, input.storeId),
  });

  if (!store) {
    return {
      approved: false,
      maxAllowedPercent: 0,
      adjustedPercent: 0,
      reason: "Store not found",
    };
  }

  const settings = store.settings as StoreSettings;
  const maxPercent = settings.maxDiscountPercent ?? 15;

  // Hard floor: never discount below $1 net
  const minNetTotal = 1.0;
  const discountAmount = input.cartTotal * (input.proposedDiscountPercent / 100);
  const netAfterDiscount = input.cartTotal - discountAmount;

  if (netAfterDiscount < minNetTotal) {
    const safePercent = Math.floor(
      ((input.cartTotal - minNetTotal) / input.cartTotal) * 100,
    );
    log.warn(
      { storeId: input.storeId, proposed: input.proposedDiscountPercent, adjusted: safePercent },
      "Discount would result in near-zero net, adjusting",
    );
    return {
      approved: true,
      maxAllowedPercent: maxPercent,
      adjustedPercent: Math.min(safePercent, maxPercent),
      reason: "Adjusted to maintain minimum net total",
    };
  }

  if (input.proposedDiscountPercent > maxPercent) {
    log.info(
      { storeId: input.storeId, proposed: input.proposedDiscountPercent, max: maxPercent },
      "Discount exceeds store maximum, capping",
    );
    return {
      approved: true,
      maxAllowedPercent: maxPercent,
      adjustedPercent: maxPercent,
      reason: "Capped to store maximum",
    };
  }

  return {
    approved: true,
    maxAllowedPercent: maxPercent,
    adjustedPercent: input.proposedDiscountPercent,
    reason: "Within margin safety bounds",
  };
}
