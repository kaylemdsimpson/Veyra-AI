import type { FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/client.js";
import { stores } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { validateSnippetToken, parseSnippetToken } from "./snippet-token.js";
import { createLogger } from "./logger.js";

const log = createLogger("snippet-auth");

/**
 * Fastify preHandler hook that validates the snippet token from
 * the X-Veyra-Token header and binds it to the request's Origin domain.
 *
 * On success, attaches `request.storeId` for downstream handlers.
 * On failure, returns 403 with a generic error (no detail leakage).
 */
export async function verifySnippetToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.headers["x-veyra-token"] as string | undefined;
  if (!token) {
    return reply.status(403).send({ error: "Forbidden" });
  }

  // Extract store ID to look up the registered domain
  const parsed = parseSnippetToken(token);
  if (!parsed) {
    log.warn("Invalid snippet token format");
    return reply.status(403).send({ error: "Forbidden" });
  }

  const db = getDb();
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, parsed.storeId),
    columns: { id: true, shopifyDomain: true, status: true, snippetToken: true },
  });

  if (!store || store.status !== "active") {
    return reply.status(403).send({ error: "Forbidden" });
  }

  // Verify the token matches what we issued (prevents forged tokens)
  if (store.snippetToken !== token) {
    log.warn({ storeId: parsed.storeId }, "Snippet token mismatch");
    return reply.status(403).send({ error: "Forbidden" });
  }

  // Domain binding: validate Origin or Referer against registered domain
  const origin = extractDomain(request);
  if (!origin) {
    // Allow server-to-server calls (no Origin) in non-production,
    // but require it in production
    if (process.env.NODE_ENV === "production") {
      log.warn({ storeId: parsed.storeId }, "Missing Origin header in production");
      return reply.status(403).send({ error: "Forbidden" });
    }
  } else {
    const result = validateSnippetToken(token, origin);
    if (!result.valid) {
      log.warn(
        { storeId: parsed.storeId, origin, registeredDomain: store.shopifyDomain },
        "Domain mismatch — possible token sharing",
      );
      return reply.status(403).send({ error: "Forbidden" });
    }
  }

  // Attach store ID to request for downstream handlers
  (request as any).storeId = store.id;
}

/**
 * Extract the domain from Origin or Referer header.
 */
function extractDomain(request: FastifyRequest): string | null {
  const origin = request.headers["origin"];
  if (origin) {
    try {
      return new URL(origin).hostname;
    } catch {
      return origin;
    }
  }

  const referer = request.headers["referer"];
  if (referer) {
    try {
      return new URL(referer).hostname;
    } catch {
      return null;
    }
  }

  return null;
}
