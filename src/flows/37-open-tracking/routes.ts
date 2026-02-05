import type { FastifyPluginAsync } from "fastify";
import { getDb } from "../../db/client.js";
import { messages, customers } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";
import { transitionAbandonState } from "../16-recovery-state-machine/service.js";

const log = createLogger("flow:tracking");

// 1x1 transparent PNG pixel
const TRACKING_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Flows 37 & 38: Open Tracking & Click Tracking
 *
 * /t/open/:trackingId  — Records email opens via tracking pixel
 * /t/click/:trackingId — Records link clicks and redirects to destination
 */
export const trackingRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Flow 37: Open Tracking Handler
   * Returns a 1x1 transparent pixel and records the open event.
   */
  app.get<{ Params: { trackingId: string } }>(
    "/open/:trackingId",
    async (request, reply) => {
      const { trackingId } = request.params;

      // Fire and forget — don't block the pixel response
      recordOpen(trackingId).catch((err) =>
        log.error({ err, trackingId }, "Failed to record open"),
      );

      return reply
        .type("image/png")
        .header("Cache-Control", "no-store, no-cache, must-revalidate")
        .header("Pragma", "no-cache")
        .send(TRACKING_PIXEL);
    },
  );

  /**
   * Flow 38: Click Tracking Handler
   * Records the click and redirects to the destination URL.
   */
  app.get<{
    Params: { trackingId: string };
    Querystring: { url: string };
  }>(
    "/click/:trackingId",
    async (request, reply) => {
      const { trackingId } = request.params;
      const { url } = request.query;

      if (!url) {
        return reply.status(400).send({ error: "Missing url parameter" });
      }

      // Fire and forget
      recordClick(trackingId).catch((err) =>
        log.error({ err, trackingId }, "Failed to record click"),
      );

      return reply.redirect(302, url);
    },
  );
};

async function recordOpen(trackingId: string): Promise<void> {
  const db = getDb();

  const msg = await db.query.messages.findFirst({
    where: eq(messages.trackingId, trackingId),
  });

  if (!msg) return;
  if (msg.openedAt) return; // Already tracked

  await db
    .update(messages)
    .set({
      status: "opened",
      openedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(messages.id, msg.id));

  // Update customer engagement
  if (msg.customerId) {
    await db
      .update(customers)
      .set({ lastEmailOpenAt: new Date(), updatedAt: new Date() })
      .where(eq(customers.id, msg.customerId));
  }

  await eventBus.emit(EVENTS.MESSAGE_OPENED, {
    messageId: msg.id,
    abandonId: msg.abandonId,
    channel: msg.channel,
  });

  log.info({ messageId: msg.id, trackingId }, "Open tracked");
}

async function recordClick(trackingId: string): Promise<void> {
  const db = getDb();

  const msg = await db.query.messages.findFirst({
    where: eq(messages.trackingId, trackingId),
  });

  if (!msg) return;

  const now = new Date();

  await db
    .update(messages)
    .set({
      status: "clicked",
      clickedAt: now,
      openedAt: msg.openedAt ?? now, // Click implies open
      updatedAt: now,
    })
    .where(eq(messages.id, msg.id));

  // Update customer engagement
  if (msg.customerId) {
    await db
      .update(customers)
      .set({ lastClickAt: now, updatedAt: now })
      .where(eq(customers.id, msg.customerId));
  }

  // Transition abandon to engaged
  await transitionAbandonState(msg.abandonId, "ENGAGE");

  await eventBus.emit(EVENTS.MESSAGE_CLICKED, {
    messageId: msg.id,
    abandonId: msg.abandonId,
    channel: msg.channel,
  });

  log.info({ messageId: msg.id, trackingId }, "Click tracked");
}
