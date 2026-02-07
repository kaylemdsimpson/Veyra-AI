import type { FastifyPluginAsync } from "fastify";
import { createLogger } from "../../lib/logger.js";
import { detectCartAbandon, type CartAbandonPayload } from "./service.js";
import { detectBrowseAbandon, type BrowseAbandonPayload } from "../10-browse-abandon-detector/service.js";
import { verifySnippetToken } from "../../lib/snippet-auth.js";
import { getDb } from "../../db/client.js";
import { stores } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";

const log = createLogger("flow:ingest-routes");

/**
 * Flows 9 & 10: Cart & Browse Abandon Ingest Endpoints
 *
 * Called by the client-side tracking snippet (v.js) to report abandon events.
 *
 * Authentication: Domain-bound HMAC snippet token via X-Veyra-Token header.
 * Falls back to legacy X-Veyra-Store-Id for backwards compatibility.
 */
export const ingestRoutes: FastifyPluginAsync = async (app) => {
  // Authenticate via snippet token (preferred) or legacy store ID
  app.addHook("preHandler", async (request, reply) => {
    const token = request.headers["x-veyra-token"] as string;
    if (token) {
      return verifySnippetToken(request, reply);
    }

    // Legacy fallback: raw store ID
    const storeId = request.headers["x-veyra-store-id"] as string;
    if (!storeId) {
      return reply.status(401).send({ error: "Missing authentication" });
    }

    const db = getDb();
    const store = await db.query.stores.findFirst({
      where: eq(stores.id, storeId),
      columns: { id: true, status: true },
    });

    if (!store || store.status !== "active") {
      return reply.status(403).send({ error: "Store not found or inactive" });
    }

    (request as any).storeId = storeId;
  });

  /**
   * Flow 9: Cart Abandon Ingest
   * POST /ingest/cart-abandon
   */
  app.post("/cart-abandon", async (request, reply) => {
    const storeId = (request as any).storeId as string;
    const body = request.body as Omit<CartAbandonPayload, "storeId">;

    await detectCartAbandon({ ...body, storeId });

    return reply.status(202).send({ status: "accepted" });
  });

  /**
   * Flow 10: Browse Abandon Ingest
   * POST /ingest/browse-abandon
   */
  app.post("/browse-abandon", async (request, reply) => {
    const storeId = (request as any).storeId as string;
    const body = request.body as Omit<BrowseAbandonPayload, "storeId">;

    await detectBrowseAbandon({ ...body, storeId });

    return reply.status(202).send({ status: "accepted" });
  });
};
