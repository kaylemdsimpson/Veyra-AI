import { getDb } from "../../db/client.js";
import { abandons, customers, stores } from "../../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { enqueue, QUEUES } from "../../lib/queue.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";
import type { AbandonLineItem } from "../../db/schema/abandons.js";

const log = createLogger("flow:checkout-created");

interface ShopifyCheckout {
  id: number;
  token: string;
  cart_token: string;
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
  customer?: {
    id: number;
    email: string;
  };
}

/**
 * Flow 6: Checkout Created Listener
 *
 * Processes checkouts/create webhooks.
 * Creates an initial abandon record in "detected" state.
 * Does NOT immediately mark as abandoned — the Abandon Detector (Flow 8) handles timing.
 */
export async function handleCheckoutCreated(
  storeId: string,
  payload: ShopifyCheckout,
): Promise<void> {
  const db = getDb();

  // Resolve or create customer
  let customerId: string | undefined;
  const email = payload.email ?? payload.customer?.email;
  if (email) {
    const existingCustomer = await db.query.customers.findFirst({
      where: and(
        eq(customers.storeId, storeId),
        eq(customers.email, email),
      ),
    });
    customerId = existingCustomer?.id;
  }

  // Map line items
  const lineItems: AbandonLineItem[] = payload.line_items.map((li) => ({
    productId: String(li.product_id),
    variantId: String(li.variant_id),
    title: li.title,
    quantity: li.quantity,
    price: li.price,
    imageUrl: li.image_url,
  }));

  // Check for existing abandon with same checkout token (idempotency)
  const existing = await db.query.abandons.findFirst({
    where: and(
      eq(abandons.storeId, storeId),
      eq(abandons.shopifyCheckoutToken, payload.token),
    ),
  });

  if (existing) {
    log.debug({ storeId, checkoutToken: payload.token }, "Checkout already tracked");
    return;
  }

  // Create abandon record
  const [abandon] = await db
    .insert(abandons)
    .values({
      storeId,
      customerId,
      type: "checkout",
      state: "detected",
      shopifyCheckoutId: String(payload.id),
      shopifyCheckoutToken: payload.token,
      shopifyCartToken: payload.cart_token,
      email,
      phone: payload.phone,
      cartTotal: payload.total_price,
      cartCurrency: payload.currency,
      lineItems,
      checkoutUrl: payload.abandoned_checkout_url,
    })
    .returning({ id: abandons.id });

  await eventBus.emit(EVENTS.CHECKOUT_CREATED, {
    storeId,
    abandonId: abandon!.id,
    checkoutToken: payload.token,
  });

  // Schedule abandon detection after threshold
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  });
  const thresholdMinutes = (store?.settings as any)?.abandonThresholdMinutes ?? 60;

  await enqueue(
    QUEUES.ABANDON_DETECT,
    { abandonId: abandon!.id, storeId, checkoutToken: payload.token },
    {
      delay: thresholdMinutes * 60 * 1000,
      jobId: `abandon-detect:${payload.token}`,
    },
  );

  log.info({ storeId, abandonId: abandon!.id }, "Checkout created, abandon detection scheduled");
}
