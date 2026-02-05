import { getDb } from "../../db/client.js";
import { stores, abandons } from "../../db/schema/index.js";
import { eq, and, notInArray } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";

const log = createLogger("flow:app-uninstall");

/**
 * Flow 3: App Uninstall Handler
 *
 * When a merchant uninstalls, we:
 *  1. Mark store as uninstalled
 *  2. Cancel all active recovery flows
 *  3. Redact the access token
 *  4. Keep data for 30 days (GDPR compliance), then purge
 */
export async function handleAppUninstall(shop: string): Promise<void> {
  const db = getDb();

  const store = await db.query.stores.findFirst({
    where: eq(stores.shopifyDomain, shop),
  });

  if (!store) {
    log.warn({ shop }, "Uninstall webhook for unknown store");
    return;
  }

  // Mark store as uninstalled, clear access token
  await db
    .update(stores)
    .set({
      status: "uninstalled",
      shopifyAccessToken: "REDACTED",
      uninstalledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(stores.id, store.id));

  // Cancel all active abandons for this store
  const terminalStates = ["recovered", "expired", "cancelled", "holdout"] as const;
  await db
    .update(abandons)
    .set({ state: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(abandons.storeId, store.id),
        notInArray(abandons.state, [...terminalStates]),
      ),
    );

  await eventBus.emit(EVENTS.STORE_UNINSTALLED, {
    storeId: store.id,
    shop,
  });

  log.info({ shop, storeId: store.id }, "Store uninstalled, recoveries cancelled");
}
