import { shopifyRequest } from "../../lib/shopify.js";
import { decrypt } from "../../lib/crypto.js";
import { getDb } from "../../db/client.js";
import { stores } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { env } from "../../config/env.js";

const log = createLogger("flow:webhook-registration");

/**
 * Flow 2: Webhook Registration
 *
 * Registers all required Shopify webhooks for a store.
 * Idempotent — re-registers on re-install.
 */

const REQUIRED_WEBHOOKS = [
  { topic: "checkouts/create", path: "/webhooks/shopify/checkouts/create" },
  { topic: "checkouts/update", path: "/webhooks/shopify/checkouts/update" },
  { topic: "orders/create", path: "/webhooks/shopify/orders/create" },
  { topic: "app/uninstalled", path: "/webhooks/shopify/app/uninstalled" },
  { topic: "customers/update", path: "/webhooks/shopify/customers/update" },
];

export async function registerWebhooks(storeId: string, shop: string): Promise<void> {
  const db = getDb();
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  });

  if (!store) {
    log.error({ storeId }, "Store not found for webhook registration");
    return;
  }

  const accessToken = decrypt(store.shopifyAccessToken);
  const appUrl = env().SHOPIFY_APP_URL;

  // Get existing webhooks
  const existing = await shopifyRequest<{ webhooks: Array<{ id: number; topic: string }> }>({
    shop,
    accessToken,
    endpoint: "webhooks.json",
  });

  const existingTopics = new Set(existing.webhooks.map((w) => w.topic));

  // Register missing webhooks
  for (const webhook of REQUIRED_WEBHOOKS) {
    if (existingTopics.has(webhook.topic)) {
      log.debug({ shop, topic: webhook.topic }, "Webhook already registered");
      continue;
    }

    await shopifyRequest({
      shop,
      accessToken,
      endpoint: "webhooks.json",
      method: "POST",
      body: {
        webhook: {
          topic: webhook.topic,
          address: `${appUrl}${webhook.path}`,
          format: "json",
        },
      },
    });

    log.info({ shop, topic: webhook.topic }, "Webhook registered");
  }

  // Update store
  await db
    .update(stores)
    .set({ webhooksRegisteredAt: new Date(), updatedAt: new Date() })
    .where(eq(stores.id, storeId));

  log.info({ shop, storeId }, "All webhooks registered");
}
