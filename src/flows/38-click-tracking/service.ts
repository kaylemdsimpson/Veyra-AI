import { getDb } from "../../db/client.js";
import { messages, abandons } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";
import { transitionAbandonState } from "../16-recovery-state-machine/service.js";

const log = createLogger("flow:click-tracking");

/**
 * Flow 38: Click Tracking Handler
 *
 * Processes click events from tracked links in recovery messages.
 *
 * When a customer clicks a tracked link:
 *  1. Look up message by trackingId
 *  2. Mark message as "clicked"
 *  3. Transition abandon state to "engaged"
 *  4. Emit MESSAGE_CLICKED event
 *  5. Return the original destination URL for redirect
 */
export async function handleClick(trackingId: string): Promise<string | null> {
  const db = getDb();

  const msg = await db.query.messages.findFirst({
    where: eq(messages.trackingId, trackingId),
  });

  if (!msg) {
    log.warn({ trackingId }, "Click tracking: message not found");
    return null;
  }

  // Only update if not already clicked (idempotent)
  if (msg.status !== "clicked") {
    await db
      .update(messages)
      .set({
        status: "clicked",
        clickedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(messages.id, msg.id));

    // Transition abandon to engaged state
    await transitionAbandonState(msg.abandonId, "ENGAGE");

    await eventBus.emit(EVENTS.MESSAGE_CLICKED, {
      messageId: msg.id,
      abandonId: msg.abandonId,
      storeId: msg.storeId,
      channel: msg.channel,
    });

    log.info(
      { messageId: msg.id, trackingId, abandonId: msg.abandonId },
      "Click tracked",
    );
  }

  // Return checkout URL from the abandon for redirect
  const abandon = await db.query.abandons.findFirst({
    where: eq(abandons.id, msg.abandonId),
    columns: { checkoutUrl: true },
  });

  return abandon?.checkoutUrl ?? null;
}
