import { getDb } from "../../db/client.js";
import { abandons } from "../../db/schema/index.js";
import { createLogger } from "../../lib/logger.js";
import { enqueue, QUEUES } from "../../lib/queue.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";

const log = createLogger("flow:cart-abandon-detector");

/**
 * Flow 9: Cart Abandon Detector
 *
 * Detects cart abandonment (user added items to cart but never started checkout).
 * Lower priority than checkout abandonment.
 *
 * Implementation note: Shopify doesn't have a native "cart abandoned" webhook.
 * Cart abandons are detected via client-side tracking (Shopify ScriptTag or App Proxy)
 * and pushed to an ingest endpoint, or via periodic polling of the Shopify cart API.
 *
 * For MVP, cart abandons are ingested via a POST endpoint.
 */
export interface CartAbandonPayload {
  storeId: string;
  cartToken: string;
  email?: string;
  phone?: string;
  cartTotal: string;
  currency: string;
  lineItems: Array<{
    productId: string;
    variantId: string;
    title: string;
    quantity: number;
    price: string;
  }>;
}

export async function detectCartAbandon(payload: CartAbandonPayload): Promise<void> {
  const db = getDb();

  // Check for existing checkout abandon with same cart token (checkout takes priority)
  const existingCheckout = await db.query.abandons.findFirst({
    where: (a, { eq, and }) =>
      and(
        eq(a.storeId, payload.storeId),
        eq(a.shopifyCartToken, payload.cartToken),
        eq(a.type, "checkout"),
      ),
  });

  if (existingCheckout) {
    log.debug({ cartToken: payload.cartToken }, "Cart has checkout abandon, skipping");
    return;
  }

  // Check if we already have this cart abandon
  const existingCart = await db.query.abandons.findFirst({
    where: (a, { eq, and }) =>
      and(
        eq(a.storeId, payload.storeId),
        eq(a.shopifyCartToken, payload.cartToken),
        eq(a.type, "cart"),
      ),
  });

  if (existingCart) {
    log.debug({ cartToken: payload.cartToken }, "Cart abandon already tracked");
    return;
  }

  if (!payload.email && !payload.phone) {
    log.debug({ cartToken: payload.cartToken }, "No contact info for cart abandon");
    return;
  }

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48hr window for cart

  const [abandon] = await db
    .insert(abandons)
    .values({
      storeId: payload.storeId,
      type: "cart",
      state: "detected",
      shopifyCartToken: payload.cartToken,
      email: payload.email,
      phone: payload.phone,
      cartTotal: payload.cartTotal,
      cartCurrency: payload.currency,
      lineItems: payload.lineItems.map((li) => ({
        productId: li.productId,
        variantId: li.variantId,
        title: li.title,
        quantity: li.quantity,
        price: li.price,
      })),
      abandonedAt: new Date(),
      expiresAt,
    })
    .returning({ id: abandons.id });

  await eventBus.emit(EVENTS.ABANDON_DETECTED, {
    storeId: payload.storeId,
    abandonId: abandon!.id,
    type: "cart",
  });

  await enqueue(QUEUES.ABANDON_NORMALISE, {
    abandonId: abandon!.id,
    storeId: payload.storeId,
  });

  log.info({ storeId: payload.storeId, abandonId: abandon!.id }, "Cart abandon detected");
}
