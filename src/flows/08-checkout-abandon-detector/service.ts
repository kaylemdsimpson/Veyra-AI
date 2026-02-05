import { getDb } from "../../db/client.js";
import { abandons, stores } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { enqueue, QUEUES } from "../../lib/queue.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";
import type { StoreSettings } from "../../db/schema/stores.js";

const log = createLogger("flow:checkout-abandon-detector");

/**
 * Flow 8: Checkout Abandoned Detector
 *
 * Runs after the abandon threshold delay.
 * Checks if the checkout has been completed (order exists).
 * If not completed → mark as abandoned, trigger normalisation.
 */
export async function detectCheckoutAbandon(
  abandonId: string,
  storeId: string,
): Promise<void> {
  const db = getDb();

  const abandon = await db.query.abandons.findFirst({
    where: eq(abandons.id, abandonId),
  });

  if (!abandon) {
    log.warn({ abandonId }, "Abandon record not found");
    return;
  }

  // Already processed or recovered
  if (abandon.state !== "detected") {
    log.debug({ abandonId, state: abandon.state }, "Abandon already processed");
    return;
  }

  // Check if email/contact info is available (can't recover without it)
  if (!abandon.email && !abandon.phone) {
    log.info({ abandonId }, "No contact info, cannot recover. Expiring.");
    await db
      .update(abandons)
      .set({ state: "expired", updatedAt: new Date() })
      .where(eq(abandons.id, abandonId));
    return;
  }

  // Mark as abandoned with expiry
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  });
  const settings = store?.settings as StoreSettings | undefined;
  const expiryHours = 72; // Default 72-hour recovery window
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  await db
    .update(abandons)
    .set({
      abandonedAt: new Date(),
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(abandons.id, abandonId));

  // If recovery is disabled, skip
  if (settings && !settings.recoveryEnabled) {
    log.info({ abandonId, storeId }, "Recovery disabled for store");
    await db
      .update(abandons)
      .set({ state: "cancelled", updatedAt: new Date() })
      .where(eq(abandons.id, abandonId));
    return;
  }

  await eventBus.emit(EVENTS.ABANDON_DETECTED, { storeId, abandonId });

  // Trigger normalisation pipeline
  await enqueue(QUEUES.ABANDON_NORMALISE, { abandonId, storeId });

  log.info({ abandonId, storeId, expiresAt: expiresAt.toISOString() }, "Checkout abandon confirmed");
}
