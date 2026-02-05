import { getDb } from "../../db/client.js";
import { abandons } from "../../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";
import type { AbandonLineItem } from "../../db/schema/abandons.js";

const log = createLogger("flow:checkout-updated");

interface ShopifyCheckoutUpdate {
  id: number;
  token: string;
  email: string | null;
  phone: string | null;
  total_price: string;
  currency: string;
  abandoned_checkout_url: string;
  line_items: Array<{
    product_id: number;
    variant_id: number;
    title: string;
    quantity: number;
    price: string;
    image_url?: string;
  }>;
}

/**
 * Flow 7: Checkout Updated Listener
 *
 * Updates the abandon record when the checkout is modified
 * (e.g., customer adds email, changes items).
 */
export async function handleCheckoutUpdated(
  storeId: string,
  payload: ShopifyCheckoutUpdate,
): Promise<void> {
  const db = getDb();

  const existing = await db.query.abandons.findFirst({
    where: and(
      eq(abandons.storeId, storeId),
      eq(abandons.shopifyCheckoutToken, payload.token),
    ),
  });

  if (!existing) {
    log.debug({ storeId, checkoutToken: payload.token }, "No abandon record for checkout update");
    return;
  }

  // Don't update terminal states
  const terminalStates = new Set(["recovered", "expired", "cancelled", "holdout"]);
  if (terminalStates.has(existing.state)) {
    return;
  }

  const lineItems: AbandonLineItem[] = payload.line_items.map((li) => ({
    productId: String(li.product_id),
    variantId: String(li.variant_id),
    title: li.title,
    quantity: li.quantity,
    price: li.price,
    imageUrl: li.image_url,
  }));

  await db
    .update(abandons)
    .set({
      email: payload.email ?? existing.email,
      phone: payload.phone ?? existing.phone,
      cartTotal: payload.total_price,
      cartCurrency: payload.currency,
      lineItems,
      checkoutUrl: payload.abandoned_checkout_url,
      updatedAt: new Date(),
    })
    .where(eq(abandons.id, existing.id));

  await eventBus.emit(EVENTS.CHECKOUT_UPDATED, {
    storeId,
    abandonId: existing.id,
    checkoutToken: payload.token,
  });

  log.info({ storeId, abandonId: existing.id }, "Checkout updated");
}
