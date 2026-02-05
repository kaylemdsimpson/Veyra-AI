import { getDb } from "../../db/client.js";
import { abandons, coupons } from "../../db/schema/index.js";
import { lt, and, notInArray } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";
import { eq } from "drizzle-orm";

const log = createLogger("flow:expiry-timer");

/**
 * Flow 15: Expiry Timer
 *
 * Scheduled job that runs every 5 minutes.
 * Expires abandons that have passed their TTL.
 * Expires coupons that have passed their expiry date.
 */
export async function processExpiredAbandons(): Promise<number> {
  const db = getDb();
  const now = new Date();

  const terminalStates = ["recovered", "expired", "cancelled", "holdout"] as const;

  // Find all abandons past their expiry
  const expiredAbandons = await db.query.abandons.findMany({
    where: and(
      lt(abandons.expiresAt, now),
      notInArray(abandons.state, [...terminalStates]),
    ),
    columns: { id: true, storeId: true, state: true },
  });

  if (expiredAbandons.length === 0) return 0;

  // Batch update to expired
  for (const abandon of expiredAbandons) {
    await db
      .update(abandons)
      .set({ state: "expired", updatedAt: now })
      .where(eq(abandons.id, abandon.id));

    await eventBus.emit(EVENTS.ABANDON_EXPIRED, {
      storeId: abandon.storeId,
      abandonId: abandon.id,
      previousState: abandon.state,
    });
  }

  log.info({ count: expiredAbandons.length }, "Expired abandons processed");
  return expiredAbandons.length;
}

/**
 * Expire coupons that have passed their expiry date.
 */
export async function processExpiredCoupons(): Promise<number> {
  const db = getDb();
  const now = new Date();

  const expired = await db.query.coupons.findMany({
    where: and(
      lt(coupons.expiresAt, now),
      eq(coupons.status, "active"),
    ),
    columns: { id: true, storeId: true, code: true },
  });

  for (const coupon of expired) {
    await db
      .update(coupons)
      .set({ status: "expired" })
      .where(eq(coupons.id, coupon.id));

    await eventBus.emit(EVENTS.COUPON_EXPIRED, {
      storeId: coupon.storeId,
      couponCode: coupon.code,
    });
  }

  if (expired.length > 0) {
    log.info({ count: expired.length }, "Expired coupons processed");
  }

  return expired.length;
}
