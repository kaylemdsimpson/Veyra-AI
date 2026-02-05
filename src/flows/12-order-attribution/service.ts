import { getDb } from "../../db/client.js";
import { abandons, messages, coupons } from "../../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { enqueue, QUEUES } from "../../lib/queue.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";

const log = createLogger("flow:order-attribution");

interface AttributionInput {
  abandonId: string;
  storeId: string;
  orderId: string;
  orderTotal: string;
  currency: string;
  checkoutTokenMatch: boolean;
  cartTokenMatch: boolean;
  discountCodes: Array<{ code: string; amount: string }>;
}

/**
 * Flow 12: Order Attribution Resolver
 *
 * Determines attribution confidence:
 *  - Checkout token match: 0.95 confidence
 *  - Cart token match: 0.85 confidence
 *  - Email match within window: 0.60 confidence
 *  - Coupon code match: +0.20 confidence boost
 *  - Click within 24h: +0.15 confidence boost
 */
export async function resolveAttribution(input: AttributionInput): Promise<void> {
  const db = getDb();

  const abandon = await db.query.abandons.findFirst({
    where: eq(abandons.id, input.abandonId),
  });

  if (!abandon) return;

  // Base confidence from match type
  let confidence = 0.4; // email-only baseline
  let source = "email_match";

  if (input.checkoutTokenMatch) {
    confidence = 0.95;
    source = "checkout_token";
  } else if (input.cartTokenMatch) {
    confidence = 0.85;
    source = "cart_token";
  }

  // Check if a Veyra coupon was used
  if (abandon.couponCode && input.discountCodes.length > 0) {
    const couponUsed = input.discountCodes.some(
      (dc) => dc.code.toLowerCase() === abandon.couponCode?.toLowerCase(),
    );
    if (couponUsed) {
      confidence = Math.min(confidence + 0.2, 1.0);
      source = "coupon_usage";

      // Mark coupon as used
      await db
        .update(coupons)
        .set({ status: "used", usedAt: new Date() })
        .where(
          and(
            eq(coupons.storeId, input.storeId),
            eq(coupons.code, abandon.couponCode),
          ),
        );
    }
  }

  // Check for recent click engagement
  const recentMessage = await db.query.messages.findFirst({
    where: and(
      eq(messages.abandonId, input.abandonId),
      eq(messages.status, "clicked"),
    ),
  });

  if (recentMessage?.clickedAt) {
    const clickAge = Date.now() - recentMessage.clickedAt.getTime();
    if (clickAge < 24 * 60 * 60 * 1000) {
      confidence = Math.min(confidence + 0.15, 1.0);
      if (source === "email_match") source = "click_then_purchase";
    }
  }

  // Update abandon as recovered
  await db
    .update(abandons)
    .set({
      state: "recovered",
      recoveredOrderId: input.orderId,
      recoveredRevenue: input.orderTotal,
      recoveredAt: new Date(),
      attributionConfidence: confidence.toFixed(4),
      updatedAt: new Date(),
    })
    .where(eq(abandons.id, input.abandonId));

  // Write to recovery ledger
  await enqueue(QUEUES.LEDGER_WRITE, {
    storeId: input.storeId,
    abandonId: input.abandonId,
    orderId: input.orderId,
    orderTotal: input.orderTotal,
    currency: input.currency,
    discountGiven: abandon.discountOffered ?? "0",
    attributionConfidence: confidence,
    attributionSource: source,
  });

  await eventBus.emit(EVENTS.ORDER_ATTRIBUTED, {
    storeId: input.storeId,
    abandonId: input.abandonId,
    orderId: input.orderId,
    confidence,
    source,
  });

  log.info(
    { abandonId: input.abandonId, orderId: input.orderId, confidence, source },
    "Order attributed to recovery",
  );
}
