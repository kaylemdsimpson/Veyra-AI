import { nanoid } from "nanoid";
import { getDb } from "../../db/client.js";
import { coupons, abandons, stores } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { shopifyRequest } from "../../lib/shopify.js";
import { decrypt } from "../../lib/crypto.js";
import { createLogger } from "../../lib/logger.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";

const log = createLogger("flow:dynamic-coupon-generator");

/**
 * Flow 26: Dynamic Coupon Generator
 *
 * Creates unique, single-use discount codes in Shopify for each recovery.
 *
 * Process:
 *  1. Generate unique code (prefix + nanoid)
 *  2. Create Shopify Price Rule
 *  3. Create Shopify Discount Code under that rule
 *  4. Store in local coupons table
 *  5. Set expiry (configurable, default 48h)
 *
 * Single-use codes prevent discount abuse.
 */

export interface CouponInput {
  abandonId: string;
  storeId: string;
  discountPercent: number;
  discountType: "percentage" | "fixed";
  minimumOrderAmount?: number;
  expiryHours?: number;
}

export interface GeneratedCoupon {
  code: string;
  couponId: string;
}

export async function generateCoupon(input: CouponInput): Promise<GeneratedCoupon | null> {
  const db = getDb();

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, input.storeId),
  });

  if (!store || store.status !== "active") return null;

  const accessToken = decrypt(store.shopifyAccessToken);
  const shop = store.shopifyDomain;

  // Generate unique code
  const code = `VEYRA-${nanoid(8).toUpperCase()}`;
  const expiryHours = input.expiryHours ?? 48;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  // Create Shopify Price Rule
  const priceRulePayload = {
    price_rule: {
      title: `Veyra Recovery ${code}`,
      target_type: "line_item",
      target_selection: "all",
      allocation_method: "across",
      value_type: input.discountType,
      value: input.discountType === "percentage"
        ? `-${input.discountPercent}`
        : `-${input.discountPercent}`,
      customer_selection: "all",
      usage_limit: 1,
      once_per_customer: true,
      starts_at: new Date().toISOString(),
      ends_at: expiresAt.toISOString(),
      prerequisite_subtotal_range: input.minimumOrderAmount
        ? { greater_than_or_equal_to: String(input.minimumOrderAmount) }
        : undefined,
    },
  };

  let shopifyPriceRuleId: string | undefined;
  let shopifyDiscountCodeId: string | undefined;

  try {
    const priceRuleResult = await shopifyRequest<{
      price_rule: { id: number };
    }>({
      shop,
      accessToken,
      endpoint: "price_rules.json",
      method: "POST",
      body: priceRulePayload,
    });

    shopifyPriceRuleId = String(priceRuleResult.price_rule.id);

    // Create discount code under the price rule
    const discountCodeResult = await shopifyRequest<{
      discount_code: { id: number; code: string };
    }>({
      shop,
      accessToken,
      endpoint: `price_rules/${shopifyPriceRuleId}/discount_codes.json`,
      method: "POST",
      body: { discount_code: { code } },
    });

    shopifyDiscountCodeId = String(discountCodeResult.discount_code.id);
  } catch (err) {
    log.error({ err, storeId: input.storeId, abandonId: input.abandonId }, "Failed to create Shopify discount");
    return null;
  }

  // Store locally
  const [coupon] = await db
    .insert(coupons)
    .values({
      storeId: input.storeId,
      abandonId: input.abandonId,
      code,
      shopifyPriceRuleId,
      shopifyDiscountCodeId,
      discountType: input.discountType,
      discountValue: String(input.discountPercent),
      minimumOrderAmount: input.minimumOrderAmount
        ? String(input.minimumOrderAmount)
        : null,
      singleUse: true,
      status: "active",
      expiresAt,
    })
    .returning({ id: coupons.id });

  // Update abandon with coupon code
  await db
    .update(abandons)
    .set({ couponCode: code, updatedAt: new Date() })
    .where(eq(abandons.id, input.abandonId));

  await eventBus.emit(EVENTS.COUPON_CREATED, {
    storeId: input.storeId,
    abandonId: input.abandonId,
    code,
  });

  log.info(
    { storeId: input.storeId, abandonId: input.abandonId, code, discountPercent: input.discountPercent },
    "Coupon generated",
  );

  return { code, couponId: coupon!.id };
}
