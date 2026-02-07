import type { FastifyPluginAsync } from "fastify";
import { randomBytes } from "node:crypto";
import { buildAuthUrl, exchangeToken } from "../../lib/shopify.js";
import { encrypt } from "../../lib/crypto.js";
import { generateSnippetToken } from "../../lib/snippet-token.js";
import { getDb } from "../../db/client.js";
import { stores } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { enqueue, QUEUES } from "../../lib/queue.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";
import { createLogger } from "../../lib/logger.js";
import { getRedis } from "../../lib/redis.js";
import { env } from "../../config/env.js";

const log = createLogger("flow:shopify-oauth");

export const shopifyAuthRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Flow 1a: Initiate Shopify OAuth
   * GET /auth/shopify?shop=mystore.myshopify.com
   */
  app.get<{ Querystring: { shop: string } }>("/", async (request, reply) => {
    const { shop } = request.query;
    if (!shop || !shop.endsWith(".myshopify.com")) {
      return reply.status(400).send({ error: "Invalid shop parameter" });
    }

    // Generate and store nonce for CSRF protection
    const nonce = randomBytes(16).toString("hex");
    const redis = getRedis();
    await redis.set(`oauth:nonce:${nonce}`, shop, "EX", 600); // 10min TTL

    const authUrl = buildAuthUrl(shop, nonce);
    log.info({ shop }, "Initiating OAuth");
    return reply.redirect(authUrl);
  });

  /**
   * Flow 1b: OAuth Callback
   * GET /auth/shopify/callback?code=...&shop=...&state=...&hmac=...
   */
  app.get<{
    Querystring: { code: string; shop: string; state: string; hmac: string };
  }>("/callback", async (request, reply) => {
    const { code, shop, state } = request.query;

    // Validate nonce
    const redis = getRedis();
    const storedShop = await redis.get(`oauth:nonce:${state}`);
    if (!storedShop || storedShop !== shop) {
      log.warn({ shop, state }, "Invalid OAuth nonce");
      return reply.status(403).send({ error: "Invalid state parameter" });
    }
    await redis.del(`oauth:nonce:${state}`);

    // Exchange code for access token
    const { access_token, scope } = await exchangeToken(shop, code);
    log.info({ shop, scope }, "Token exchanged successfully");

    // Encrypt and store
    const encryptedToken = encrypt(access_token);
    const db = getDb();

    // Upsert store
    const existing = await db.query.stores.findFirst({
      where: eq(stores.shopifyDomain, shop),
    });

    let storeId: string;
    if (existing) {
      // Re-generate snippet token on re-install (old one is invalidated)
      const snippetToken = generateSnippetToken(existing.id, shop);
      await db
        .update(stores)
        .set({
          shopifyAccessToken: encryptedToken,
          snippetToken,
          status: "active",
          uninstalledAt: null,
          installedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(stores.id, existing.id));
      storeId = existing.id;
      log.info({ shop, storeId }, "Store re-installed");
    } else {
      const [newStore] = await db
        .insert(stores)
        .values({
          shopifyDomain: shop,
          shopifyAccessToken: encryptedToken,
          status: "active",
          installedAt: new Date(),
        })
        .returning({ id: stores.id });
      storeId = newStore!.id;

      // Generate domain-bound snippet token
      const snippetToken = generateSnippetToken(storeId, shop);
      await db
        .update(stores)
        .set({ snippetToken, updatedAt: new Date() })
        .where(eq(stores.id, storeId));

      log.info({ shop, storeId }, "New store installed");
    }

    // Trigger downstream flows
    await enqueue(QUEUES.WEBHOOK_PROCESS, {
      type: "register_webhooks",
      storeId,
      shop,
    });
    await enqueue(QUEUES.STORE_SYNC, { storeId, shop });
    await enqueue(QUEUES.CUSTOMER_SYNC, { storeId, shop });

    await eventBus.emit(EVENTS.STORE_INSTALLED, { storeId, shop });

    const redirectUrl = `${env().SHOPIFY_APP_URL}/installed?shop=${shop}`;
    return reply.redirect(redirectUrl);
  });
};
