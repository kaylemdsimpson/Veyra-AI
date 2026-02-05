import type { FastifyPluginAsync } from "fastify";
import { createLogger } from "../../lib/logger.js";
import { hmacVerify } from "../../lib/crypto.js";
import { env } from "../../config/env.js";
import { enqueue, QUEUES } from "../../lib/queue.js";
import { getDb } from "../../db/client.js";
import { stores } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { acquireIdempotencyLock, buildIdempotencyKey } from "../../lib/idempotency.js";

const log = createLogger("flow:webhooks");

/**
 * Shopify webhook receiver endpoints.
 * All webhook processing is offloaded to queues for reliability.
 */
export const webhookRoutes: FastifyPluginAsync = async (app) => {
  // Raw body parsing for HMAC verification
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // HMAC verification hook
  app.addHook("preHandler", async (request, reply) => {
    const hmac = request.headers["x-shopify-hmac-sha256"] as string;
    const rawBody = request.body as string;

    if (!hmac || !rawBody) {
      return reply.status(401).send({ error: "Missing HMAC" });
    }

    if (!hmacVerify(rawBody, hmac, env().SHOPIFY_WEBHOOK_SECRET)) {
      log.warn("Invalid webhook HMAC");
      return reply.status(401).send({ error: "Invalid HMAC" });
    }

    // Parse body after verification
    (request as any).parsedBody = JSON.parse(rawBody);
  });

  // ─── Checkout Created ──────────────────────────────────────
  app.post("/checkouts/create", async (request, reply) => {
    const payload = (request as any).parsedBody;
    const shop = request.headers["x-shopify-shop-domain"] as string;
    const webhookId = request.headers["x-shopify-webhook-id"] as string;

    if (!await acquireIdempotencyLock(buildIdempotencyKey("webhook", webhookId))) {
      return reply.status(200).send({ status: "duplicate" });
    }

    await enqueue(QUEUES.WEBHOOK_PROCESS, {
      type: "checkout.created",
      shop,
      payload,
      webhookId,
    });

    return reply.status(200).send({ status: "accepted" });
  });

  // ─── Checkout Updated ──────────────────────────────────────
  app.post("/checkouts/update", async (request, reply) => {
    const payload = (request as any).parsedBody;
    const shop = request.headers["x-shopify-shop-domain"] as string;
    const webhookId = request.headers["x-shopify-webhook-id"] as string;

    if (!await acquireIdempotencyLock(buildIdempotencyKey("webhook", webhookId))) {
      return reply.status(200).send({ status: "duplicate" });
    }

    await enqueue(QUEUES.WEBHOOK_PROCESS, {
      type: "checkout.updated",
      shop,
      payload,
      webhookId,
    });

    return reply.status(200).send({ status: "accepted" });
  });

  // ─── Order Created ─────────────────────────────────────────
  app.post("/orders/create", async (request, reply) => {
    const payload = (request as any).parsedBody;
    const shop = request.headers["x-shopify-shop-domain"] as string;
    const webhookId = request.headers["x-shopify-webhook-id"] as string;

    if (!await acquireIdempotencyLock(buildIdempotencyKey("webhook", webhookId))) {
      return reply.status(200).send({ status: "duplicate" });
    }

    await enqueue(QUEUES.WEBHOOK_PROCESS, {
      type: "order.created",
      shop,
      payload,
      webhookId,
    });

    return reply.status(200).send({ status: "accepted" });
  });

  // ─── App Uninstall ─────────────────────────────────────────
  app.post("/app/uninstalled", async (request, reply) => {
    const payload = (request as any).parsedBody;
    const shop = request.headers["x-shopify-shop-domain"] as string;
    const webhookId = request.headers["x-shopify-webhook-id"] as string;

    if (!await acquireIdempotencyLock(buildIdempotencyKey("webhook", webhookId))) {
      return reply.status(200).send({ status: "duplicate" });
    }

    await enqueue(QUEUES.WEBHOOK_PROCESS, {
      type: "app.uninstalled",
      shop,
      payload,
      webhookId,
    });

    return reply.status(200).send({ status: "accepted" });
  });

  // ─── Customer Updated ──────────────────────────────────────
  app.post("/customers/update", async (request, reply) => {
    const payload = (request as any).parsedBody;
    const shop = request.headers["x-shopify-shop-domain"] as string;
    const webhookId = request.headers["x-shopify-webhook-id"] as string;

    if (!await acquireIdempotencyLock(buildIdempotencyKey("webhook", webhookId))) {
      return reply.status(200).send({ status: "duplicate" });
    }

    await enqueue(QUEUES.WEBHOOK_PROCESS, {
      type: "customer.updated",
      shop,
      payload,
      webhookId,
    });

    return reply.status(200).send({ status: "accepted" });
  });
};
