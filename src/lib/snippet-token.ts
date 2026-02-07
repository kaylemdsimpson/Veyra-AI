import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Snippet Token — domain-bound, HMAC-signed, read-only identity token.
 *
 * Format: veyra_<hex(HMAC-SHA256(storeId:domain, APP_SECRET))>_<storeId>
 *
 * - The HMAC binds the token to a specific store + domain pair.
 * - Anyone who pastes the snippet on a different domain gets a 403.
 * - The token is read-only: it can only be used to send ingest events,
 *   never to read or modify store data.
 * - The storeId suffix lets us resolve the store without a DB lookup on
 *   the hot path (we only need the DB to fetch the domain for validation).
 */

const TOKEN_PREFIX = "veyra_";

/**
 * Generate a snippet token for a store.
 */
export function generateSnippetToken(storeId: string, domain: string): string {
  const payload = `${storeId}:${normaliseDomain(domain)}`;
  const signature = createHmac("sha256", env().APP_SECRET)
    .update(payload, "utf8")
    .digest("hex");
  return `${TOKEN_PREFIX}${signature}_${storeId}`;
}

/**
 * Parse a snippet token into its components.
 * Returns null if the token format is invalid.
 */
export function parseSnippetToken(
  token: string,
): { signature: string; storeId: string } | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const body = token.slice(TOKEN_PREFIX.length);
  const separatorIndex = body.indexOf("_");
  if (separatorIndex === -1) return null;

  const signature = body.slice(0, separatorIndex);
  const storeId = body.slice(separatorIndex + 1);

  if (!signature || !storeId) return null;
  return { signature, storeId };
}

/**
 * Validate a snippet token against a known domain.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function validateSnippetToken(
  token: string,
  domain: string,
): { valid: boolean; storeId: string | null } {
  const parsed = parseSnippetToken(token);
  if (!parsed) return { valid: false, storeId: null };

  const payload = `${parsed.storeId}:${normaliseDomain(domain)}`;
  const expected = createHmac("sha256", env().APP_SECRET)
    .update(payload, "utf8")
    .digest("hex");

  const sigBuffer = Buffer.from(parsed.signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (sigBuffer.length !== expectedBuffer.length) {
    return { valid: false, storeId: parsed.storeId };
  }

  const valid = timingSafeEqual(sigBuffer, expectedBuffer);
  return { valid, storeId: parsed.storeId };
}

/**
 * Normalise a Shopify domain for consistent HMAC computation.
 * Strips protocol, trailing slashes, lowercases.
 */
function normaliseDomain(domain: string): string {
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .toLowerCase()
    .trim();
}
