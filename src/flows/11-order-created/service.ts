import { getDb } from "../../db/client.js";
import { abandons, customers } from "../../db/schema/index.js";
import { eq, and, inArray } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { enqueue, QUEUES } from "../../lib/queue.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";

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
 *  1. Check if it matches any active abandon (by checkout_token, cart_token, or email)
 *  2. If matched → trigger attribution resolver
 *  3. Update customer lifetime metrics
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

  // Find matching active abandons
  const activeStates = ["detected", "qualified", "scoring", "sequencing", "awaiting_send", "sending", "engaged"] as const;
  let matchedAbandon = null;

  // Match by checkout token (highest confidence)
  if (payload.checkout_token) {
    matchedAbandon = await db.query.abandons.findFirst({
      where: and(
        eq(abandons.storeId, storeId),
        eq(abandons.shopifyCheckoutToken, payload.checkout_token),
        inArray(abandons.state, [...activeStates]),
      ),
    });
  }

  // Match by cart token
  if (!matchedAbandon && payload.cart_token) {
    matchedAbandon = await db.query.abandons.findFirst({
      where: and(
        eq(abandons.storeId, storeId),
        eq(abandons.shopifyCartToken, payload.cart_token),
        inArray(abandons.state, [...activeStates]),
      ),
    });
  }

  // Match by email (lowest confidence)
  if (!matchedAbandon && payload.email) {
    matchedAbandon = await db.query.abandons.findFirst({
      where: and(
        eq(abandons.storeId, storeId),
        eq(abandons.email, payload.email),
        inArray(abandons.state, [...activeStates]),
      ),
    });
  }

  if (matchedAbandon) {
    await enqueue(QUEUES.RECOVERY_ATTRIBUTION, {
      abandonId: matchedAbandon.id,
      storeId,
      orderId: String(payload.id),
      orderTotal: payload.total_price,
      currency: payload.currency,
      checkoutTokenMatch: payload.checkout_token === matchedAbandon.shopifyCheckoutToken,
      cartTokenMatch: payload.cart_token === matchedAbandon.shopifyCartToken,
      discountCodes: payload.discount_codes,
    });

    log.info(
      { storeId, abandonId: matchedAbandon.id, orderId: payload.id },
      "Order matched to abandon, triggering attribution",
    );
  } else {
    log.debug({ storeId, orderId: payload.id }, "Order does not match any active abandon");
  }
}
