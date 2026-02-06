import { getDb } from "../../db/client.js";
import { messages, abandons } from "../../db/schema/index.js";
import { eq, and, lte, inArray } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { enqueue, QUEUES } from "../../lib/queue.js";
import { detectConflicts } from "../45-conflict-detection/service.js";

const log = createLogger("flow:message-queue-manager");

/**
 * Flow 31: Message Queue Manager
 *
 * Scheduled job that runs every minute.
 * Finds messages ready to send and enqueues them.
 *
 * Backpressure: Limits batch size per run to prevent queue flooding.
 * Rate limiting: Respects per-channel rate limits via BullMQ limiter.
 */

const BATCH_SIZE = 100; // Max messages to process per run

export async function processMessageQueue(): Promise<number> {
  const db = getDb();
  const now = new Date();

  // Find messages scheduled for now or earlier, still in scheduled state
  const readyMessages = await db.query.messages.findMany({
    where: and(
      eq(messages.status, "scheduled"),
      lte(messages.scheduledFor, now),
    ),
    limit: BATCH_SIZE,
    columns: {
      id: true,
      abandonId: true,
      storeId: true,
      channel: true,
      sequenceStep: true,
    },
  });

  if (readyMessages.length === 0) return 0;

  let enqueued = 0;

  for (const msg of readyMessages) {
    // Verify the abandon is still in an active state
    const abandon = await db.query.abandons.findFirst({
      where: eq(abandons.id, msg.abandonId),
      columns: { state: true },
    });

    const activeStates = new Set([
      "qualified", "scoring", "sequencing", "awaiting_send", "sending", "engaged",
    ]);

    if (!abandon || !activeStates.has(abandon.state)) {
      // Cancel this message — abandon is no longer active
      await db
        .update(messages)
        .set({ status: "failed", lastError: "Abandon no longer active", updatedAt: new Date() })
        .where(eq(messages.id, msg.id));
      continue;
    }

    // Flow 45: Conflict detection — pre-send safety check
    const conflictResult = await detectConflicts(msg.abandonId, msg.storeId);
    if (conflictResult.hasConflict) {
      log.warn(
        { messageId: msg.id, abandonId: msg.abandonId, conflicts: conflictResult.conflicts },
        "Message blocked by conflict detection",
      );
      await db
        .update(messages)
        .set({
          status: "failed",
          lastError: `Conflict: ${conflictResult.conflicts.join("; ")}`,
          updatedAt: new Date(),
        })
        .where(eq(messages.id, msg.id));
      continue;
    }

    // Mark as sending
    await db
      .update(messages)
      .set({ status: "sending", updatedAt: new Date() })
      .where(eq(messages.id, msg.id));

    // Enqueue for delivery
    await enqueue(QUEUES.MESSAGE_SEND, {
      messageId: msg.id,
      abandonId: msg.abandonId,
      storeId: msg.storeId,
      channel: msg.channel,
    });

    enqueued++;
  }

  log.info({ total: readyMessages.length, enqueued }, "Messages enqueued for sending");
  return enqueued;
}

/**
 * Cancel all pending messages for an abandon (e.g., when recovered or expired).
 */
export async function cancelPendingMessages(abandonId: string): Promise<number> {
  const db = getDb();

  const pending = await db.query.messages.findMany({
    where: and(
      eq(messages.abandonId, abandonId),
      inArray(messages.status, ["queued", "scheduled"]),
    ),
    columns: { id: true },
  });

  for (const msg of pending) {
    await db
      .update(messages)
      .set({ status: "failed", lastError: "Cancelled", updatedAt: new Date() })
      .where(eq(messages.id, msg.id));
  }

  return pending.length;
}
