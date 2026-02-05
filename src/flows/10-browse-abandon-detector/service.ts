import { getDb } from "../../db/client.js";
import { abandons } from "../../db/schema/index.js";
import { createLogger } from "../../lib/logger.js";
import { enqueue, QUEUES } from "../../lib/queue.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";

const log = createLogger("flow:browse-abandon-detector");

/**
 * Flow 10: Browse Abandon Detector
 *
 * Detects when a customer viewed products but didn't add to cart.
 * Lowest priority abandon type. Requires client-side tracking.
 *
 * Engineering assumption: Browse events are ingested via a lightweight
 * tracking endpoint (similar to analytics pixels) and batched.
 */
export interface BrowseAbandonPayload {
  storeId: string;
  email: string;
  products: Array<{
    productId: string;
    variantId: string;
    title: string;
    price: string;
    imageUrl?: string;
  }>;
  sessionId: string;
}

export async function detectBrowseAbandon(payload: BrowseAbandonPayload): Promise<void> {
  if (!payload.email || payload.products.length === 0) return;

  const db = getDb();

  // Don't create browse abandons if there's an active checkout/cart abandon for this email
  const activeAbandon = await db.query.abandons.findFirst({
    where: (a, { eq, and, notInArray }) =>
      and(
        eq(a.storeId, payload.storeId),
        eq(a.email, payload.email),
        notInArray(a.state, ["recovered", "expired", "cancelled"]),
        notInArray(a.type, ["browse"]),
      ),
  });

  if (activeAbandon) {
    log.debug({ email: payload.email }, "Active abandon exists, skipping browse");
    return;
  }

  const topProduct = payload.products[0]!;
  const estimatedTotal = payload.products.reduce(
    (sum, p) => sum + parseFloat(p.price),
    0,
  );

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24hr window

  const [abandon] = await db
    .insert(abandons)
    .values({
      storeId: payload.storeId,
      type: "browse",
      state: "detected",
      email: payload.email,
      cartTotal: estimatedTotal.toFixed(2),
      lineItems: payload.products.map((p) => ({
        productId: p.productId,
        variantId: p.variantId,
        title: p.title,
        quantity: 1,
        price: p.price,
        imageUrl: p.imageUrl,
      })),
      abandonedAt: new Date(),
      expiresAt,
    })
    .returning({ id: abandons.id });

  await eventBus.emit(EVENTS.ABANDON_DETECTED, {
    storeId: payload.storeId,
    abandonId: abandon!.id,
    type: "browse",
  });

  await enqueue(QUEUES.ABANDON_NORMALISE, {
    abandonId: abandon!.id,
    storeId: payload.storeId,
  });

  log.info({ storeId: payload.storeId, abandonId: abandon!.id }, "Browse abandon detected");
}
