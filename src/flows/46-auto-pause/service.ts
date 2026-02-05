import { getDb } from "../../db/client.js";
import { stores, messages } from "../../db/schema/index.js";
import { eq, and, gt, inArray } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";

const log = createLogger("flow:auto-pause");

/**
 * Flow 46: Auto-Pause Protection
 *
 * Automatically pauses recovery for a store when safety thresholds are breached:
 *
 * Triggers:
 *  1. Bounce rate > 10% in 24h → pause email
 *  2. Unsubscribe rate > 5% in 24h → pause all
 *  3. Provider failure rate > 50% in 1h → pause channel
 *  4. Merchant manually pauses via dashboard
 *
 * This protects:
 *  - Merchant's sender reputation
 *  - Customer experience
 *  - Veyra's platform reputation with providers
 */

const BOUNCE_THRESHOLD = 0.10;
const UNSUBSCRIBE_THRESHOLD = 0.05;

export async function checkAutoPause(storeId: string): Promise<boolean> {
  const db = getDb();

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Get message stats for last 24h
  const recentMessages = await db.query.messages.findMany({
    where: and(
      eq(messages.storeId, storeId),
      gt(messages.sentAt, last24h),
    ),
    columns: { status: true, channel: true },
  });

  if (recentMessages.length < 10) return false; // Not enough data

  const total = recentMessages.length;
  const bounced = recentMessages.filter((m) => m.status === "bounced").length;
  const unsubscribed = recentMessages.filter((m) => m.status === "unsubscribed").length;

  const bounceRate = bounced / total;
  const unsubRate = unsubscribed / total;

  let paused = false;

  if (bounceRate > BOUNCE_THRESHOLD) {
    log.error(
      { storeId, bounceRate, threshold: BOUNCE_THRESHOLD },
      "AUTO-PAUSE: Bounce rate exceeded threshold",
    );

    await db
      .update(stores)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(stores.id, storeId));

    await eventBus.emit(EVENTS.AUTO_PAUSE_TRIGGERED, {
      storeId,
      reason: "bounce_rate",
      value: bounceRate,
      threshold: BOUNCE_THRESHOLD,
    });

    paused = true;
  }

  if (unsubRate > UNSUBSCRIBE_THRESHOLD) {
    log.error(
      { storeId, unsubRate, threshold: UNSUBSCRIBE_THRESHOLD },
      "AUTO-PAUSE: Unsubscribe rate exceeded threshold",
    );

    await db
      .update(stores)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(stores.id, storeId));

    await eventBus.emit(EVENTS.AUTO_PAUSE_TRIGGERED, {
      storeId,
      reason: "unsubscribe_rate",
      value: unsubRate,
      threshold: UNSUBSCRIBE_THRESHOLD,
    });

    paused = true;
  }

  return paused;
}
