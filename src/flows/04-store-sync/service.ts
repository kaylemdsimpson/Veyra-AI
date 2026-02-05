import { shopifyRequest } from "../../lib/shopify.js";
import { decrypt } from "../../lib/crypto.js";
import { getDb } from "../../db/client.js";
import { stores } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";

const log = createLogger("flow:store-sync");

interface ShopifyShopData {
  shop: {
    id: number;
    name: string;
    email: string;
    currency: string;
    iana_timezone: string;
    myshopify_domain: string;
  };
}

/**
 * Flow 4: Store Sync
 *
 * Pulls store metadata from Shopify and updates local record.
 * Runs on install and periodically (daily).
 */
export async function syncStore(storeId: string, shop: string): Promise<void> {
  const db = getDb();
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  });

  if (!store || store.status !== "active") {
    log.warn({ storeId, shop }, "Store not found or inactive, skipping sync");
    return;
  }

  const accessToken = decrypt(store.shopifyAccessToken);
  const shopData = await shopifyRequest<ShopifyShopData>({
    shop,
    accessToken,
    endpoint: "shop.json",
  });

  await db
    .update(stores)
    .set({
      shopifyStoreId: String(shopData.shop.id),
      name: shopData.shop.name,
      email: shopData.shop.email,
      currency: shopData.shop.currency,
      timezone: shopData.shop.iana_timezone,
      lastSyncAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(stores.id, storeId));

  await eventBus.emit(EVENTS.STORE_SYNCED, { storeId, shop });
  log.info({ storeId, shop, name: shopData.shop.name }, "Store synced");
}
