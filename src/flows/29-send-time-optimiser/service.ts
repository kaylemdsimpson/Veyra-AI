import { getDb } from "../../db/client.js";
import { messages, customers, stores } from "../../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { enqueue, QUEUES } from "../../lib/queue.js";

const log = createLogger("flow:send-time-optimiser");

/**
 * Flow 29: Send-Time Optimiser
 *
 * Adjusts scheduled send times based on:
 *  1. Store timezone (don't send at 3am)
 *  2. Customer engagement history (preferred open times)
 *  3. Day-of-week patterns
 *
 * Quiet hours: 10pm – 8am in store timezone (configurable)
 *
 * Engineering assumption: We use timezone-based rules for MVP.
 * ML-based per-customer send-time optimization is a future enhancement.
 */

const QUIET_HOUR_START = 22; // 10 PM
const QUIET_HOUR_END = 8;   // 8 AM

export async function optimiseSendTimes(
  abandonId: string,
  storeId: string,
): Promise<void> {
  const db = getDb();

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
    columns: { timezone: true },
  });

  const storeTimezone = store?.timezone ?? "UTC";

  const scheduledMessages = await db.query.messages.findMany({
    where: and(
      eq(messages.abandonId, abandonId),
      eq(messages.status, "scheduled"),
    ),
  });

  for (const msg of scheduledMessages) {
    if (!msg.scheduledFor) continue;

    let adjustedTime = new Date(msg.scheduledFor);

    // Convert to store local time to check quiet hours
    const localHour = getLocalHour(adjustedTime, storeTimezone);

    if (isQuietHour(localHour)) {
      // Push to 8 AM next day in store timezone
      adjustedTime = getNextAllowedTime(adjustedTime, storeTimezone);
      log.debug(
        { messageId: msg.id, original: msg.scheduledFor, adjusted: adjustedTime },
        "Send time adjusted for quiet hours",
      );
    }

    // Don't send in the past
    if (adjustedTime.getTime() < Date.now()) {
      adjustedTime = new Date(Date.now() + 60_000); // 1 minute from now
    }

    await db
      .update(messages)
      .set({ scheduledFor: adjustedTime, updatedAt: new Date() })
      .where(eq(messages.id, msg.id));

    // Enqueue for actual sending at the scheduled time
    const delay = adjustedTime.getTime() - Date.now();
    await enqueue(
      QUEUES.MESSAGE_SEND,
      { messageId: msg.id, abandonId, storeId },
      {
        delay: Math.max(0, delay),
        jobId: `send:${msg.id}`,
      },
    );
  }

  log.info({ abandonId, count: scheduledMessages.length }, "Send times optimised");
}

function getLocalHour(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    return parseInt(formatter.format(date), 10);
  } catch {
    return date.getUTCHours();
  }
}

function isQuietHour(hour: number): boolean {
  return hour >= QUIET_HOUR_START || hour < QUIET_HOUR_END;
}

function getNextAllowedTime(date: Date, timezone: string): Date {
  const result = new Date(date);
  // Move forward to find 8 AM in store timezone
  const localHour = getLocalHour(result, timezone);
  if (localHour >= QUIET_HOUR_START) {
    // Evening: push to 8 AM next day
    const hoursUntilMorning = 24 - localHour + QUIET_HOUR_END;
    result.setTime(result.getTime() + hoursUntilMorning * 60 * 60 * 1000);
  } else if (localHour < QUIET_HOUR_END) {
    // Early morning: push to 8 AM same day
    const hoursUntilMorning = QUIET_HOUR_END - localHour;
    result.setTime(result.getTime() + hoursUntilMorning * 60 * 60 * 1000);
  }
  return result;
}
