import { getDb } from "../../db/client.js";
import { abandons, customers } from "../../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { enqueue, QUEUES } from "../../lib/queue.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";
import { matchOrderToAbandon } from "../39-conversion-matcher/service.js";

const log = createLogger("flow:order-created");

interface ShopifyOrder {
  id: number;
  email: string;
  total_price: string;
  currency: string;
  checkout_token: string | null;
  cart_token: string | null;
  discount_codes: Array<{ code: string; amount: string }>;
  customer?: { id: number; email: string };
  line_items: Array<{ product_id: number; variant_id: number; quantity: number; price: string }>;
}

/**
 * Flow 11: Order Created Listener
 *
 * When an order is created:
 *  1. Update customer lifetime metrics
 *  2. Use Flow 39 (Conversion Matcher) to find matching abandon
 *  3. If matched → trigger Flow 12 (Order Attribution Resolver)
 */
export async function handleOrderCreated(
  storeId: string,
  payload: ShopifyOrder,
): Promise<void> {
  const db = getDb();

  await eventBus.emit(EVENTS.ORDER_CREATED, {
    storeId,
    orderId: String(payload.id),
    email: payload.email,
    total: payload.total_price,
  });

  // Update customer metrics
  if (payload.email) {
    const customer = await db.query.customers.findFirst({
      where: and(
        eq(customers.storeId, storeId),
        eq(customers.email, payload.email),
      ),
    });

    if (customer) {
      const newTotal = parseFloat(customer.totalSpent ?? "0") + parseFloat(payload.total_price);
      await db
        .update(customers)
        .set({
          totalOrders: (customer.totalOrders ?? 0) + 1,
          totalSpent: newTotal.toFixed(2),
          lastOrderAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(customers.id, customer.id));
    }
  }

  // Use Flow 39: Conversion Matcher for multi-signal matching
  const match = await matchOrderToAbandon(
    storeId,
    String(payload.id),
    payload.email,
    payload.checkout_token,
    payload.cart_token,
    payload.discount_codes.map((dc) => dc.code),
  );

  if (match.abandonId) {
    const matchedAbandon = await db.query.abandons.findFirst({
      where: eq(abandons.id, match.abandonId),
    });

    await enqueue(QUEUES.RECOVERY_ATTRIBUTION, {
      abandonId: match.abandonId,
      storeId,
      orderId: String(payload.id),
      orderTotal: payload.total_price,
      currency: payload.currency,
      checkoutTokenMatch: match.matchType === "checkout_token",
      cartTokenMatch: match.matchType === "cart_token",
      discountCodes: payload.discount_codes,
    });

    log.info(
      {
        storeId,
        abandonId: match.abandonId,
        orderId: payload.id,
        matchType: match.matchType,
        confidence: match.confidence,
      },
      "Order matched to abandon via conversion matcher",
    );
  } else {
    log.debug({ storeId, orderId: payload.id }, "Order does not match any active abandon");
  }
}
