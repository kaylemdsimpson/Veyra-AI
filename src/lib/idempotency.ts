import { getRedis } from "./redis.js";
import { createLogger } from "./logger.js";

const log = createLogger("idempotency");
const DEFAULT_TTL_SECONDS = 86400; // 24 hours

/**
 * Check-and-set idempotency key.
 * Returns true if this is the first time the key is seen (proceed with processing).
 * Returns false if the key already exists (skip processing).
 */
export async function acquireIdempotencyLock(
  key: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<boolean> {
  const redis = getRedis();
  const fullKey = `idem:${key}`;
  const result = await redis.set(fullKey, "1", "EX", ttlSeconds, "NX");
  const acquired = result === "OK";
  if (!acquired) {
    log.debug({ key }, "Idempotency key already exists, skipping");
  }
  return acquired;
}

/**
 * Release an idempotency key (e.g., on permanent failure where retry is desired).
 */
export async function releaseIdempotencyLock(key: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`idem:${key}`);
}

/**
 * Build a deterministic idempotency key from components.
 */
export function buildIdempotencyKey(...parts: string[]): string {
  return parts.join(":");
}
