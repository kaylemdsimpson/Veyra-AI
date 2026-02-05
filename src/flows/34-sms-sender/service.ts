import { getDb } from "../../db/client.js";
import { messages, abandons, stores } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { env } from "../../config/env.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";
import { handleSendFailure } from "../32-retry-failover/service.js";
import { recordProviderMetric } from "../36-provider-health/service.js";
import Twilio from "twilio";

const log = createLogger("flow:sms-sender");

/**
 * Flow 34: SMS Sender
 *
 * Sends recovery SMS via Twilio.
 *
 * SMS messages are short and direct:
 *  - Max 160 chars for single segment
 *  - Include tracked checkout URL
 *  - Optional discount code
 *
 * Requires explicit SMS consent (TCPA compliance).
 */
export async function sendSms(messageId: string): Promise<void> {
  const db = getDb();
  const startTime = Date.now();

  const msg = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
  });
  if (!msg || msg.channel !== "sms") return;

  const abandon = await db.query.abandons.findFirst({
    where: eq(abandons.id, msg.abandonId),
  });
  if (!abandon || !abandon.phone) return;

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, msg.storeId),
  });
  if (!store) return;

  // Build SMS body
  const appUrl = env().SHOPIFY_APP_URL;
  const trackedUrl = `${appUrl}/t/click/${msg.trackingId}?url=${encodeURIComponent(abandon.checkoutUrl ?? "")}`;
  const storeName = store.name ?? "Store";

  let body: string;
  const includesDiscount = msg.includesDiscount === 1;

  if (includesDiscount && msg.couponCode) {
    body = `${storeName}: Your cart ($${abandon.cartTotal}) is waiting! Use code ${msg.couponCode} for ${msg.discountPercent}% off. Complete your order: ${trackedUrl}`;
  } else if (msg.sequenceStep === 1) {
    body = `${storeName}: You left items in your cart ($${abandon.cartTotal}). Complete your order: ${trackedUrl}`;
  } else {
    body = `${storeName}: Don't miss out! Your cart ($${abandon.cartTotal}) is about to expire. Order now: ${trackedUrl}`;
  }

  try {
    const client = Twilio(env().TWILIO_ACCOUNT_SID, env().TWILIO_AUTH_TOKEN);
    const result = await client.messages.create({
      to: abandon.phone,
      from: env().TWILIO_PHONE_NUMBER,
      body,
    });

    const latency = Date.now() - startTime;

    await db
      .update(messages)
      .set({
        status: "sent",
        provider: "twilio",
        providerMessageId: result.sid,
        sentAt: new Date(),
        bodyText: body,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, messageId));

    await recordProviderMetric("twilio", "sms", true, latency);
    await eventBus.emit(EVENTS.MESSAGE_SENT, {
      messageId,
      abandonId: msg.abandonId,
      channel: "sms",
    });

    log.info({ messageId, to: abandon.phone }, "SMS sent");
  } catch (err) {
    const latency = Date.now() - startTime;
    await recordProviderMetric("twilio", "sms", false, latency);

    log.error({ messageId, err }, "SMS send failed");
    await handleSendFailure(
      messageId,
      "twilio_sms",
      err instanceof Error ? err.message : "Unknown error",
    );
  }
}
