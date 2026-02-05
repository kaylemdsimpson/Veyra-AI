import { getDb } from "../../db/client.js";
import { messages, abandons, stores } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { env } from "../../config/env.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";
import { handleSendFailure } from "../32-retry-failover/service.js";
import { recordProviderMetric } from "../36-provider-health/service.js";
import Twilio from "twilio";

const log = createLogger("flow:whatsapp-sender");

/**
 * Flow 35: WhatsApp Sender
 *
 * Sends recovery messages via WhatsApp Business API (through Twilio).
 *
 * WhatsApp has specific requirements:
 *  - Must use pre-approved message templates for business-initiated messages
 *  - 24-hour customer service window for free-form messages
 *  - Rich media support (images, buttons)
 *
 * Engineering assumption: We use Twilio's WhatsApp API with template messages.
 * Template approval is handled outside this codebase.
 */
export async function sendWhatsApp(messageId: string): Promise<void> {
  const db = getDb();
  const startTime = Date.now();

  const msg = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
  });
  if (!msg || msg.channel !== "whatsapp") return;

  const abandon = await db.query.abandons.findFirst({
    where: eq(abandons.id, msg.abandonId),
  });
  if (!abandon || !abandon.phone) return;

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, msg.storeId),
  });
  if (!store) return;

  const appUrl = env().SHOPIFY_APP_URL;
  const trackedUrl = `${appUrl}/t/click/${msg.trackingId}?url=${encodeURIComponent(abandon.checkoutUrl ?? "")}`;
  const storeName = store.name ?? "Store";
  const includesDiscount = msg.includesDiscount === 1;

  let body: string;
  if (includesDiscount && msg.couponCode) {
    body = `Hi! Your cart at ${storeName} ($${abandon.cartTotal}) is still waiting for you.\n\n` +
      `We've got a special offer: *${msg.discountPercent}% OFF* with code *${msg.couponCode}*\n\n` +
      `Complete your purchase: ${trackedUrl}`;
  } else {
    body = `Hi! You left some items in your ${storeName} cart ($${abandon.cartTotal}).\n\n` +
      `Complete your purchase: ${trackedUrl}`;
  }

  try {
    const client = Twilio(env().TWILIO_ACCOUNT_SID, env().TWILIO_AUTH_TOKEN);
    const result = await client.messages.create({
      to: `whatsapp:${abandon.phone}`,
      from: env().TWILIO_WHATSAPP_NUMBER,
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

    await recordProviderMetric("twilio", "whatsapp", true, latency);
    await eventBus.emit(EVENTS.MESSAGE_SENT, {
      messageId,
      abandonId: msg.abandonId,
      channel: "whatsapp",
    });

    log.info({ messageId, to: abandon.phone }, "WhatsApp message sent");
  } catch (err) {
    const latency = Date.now() - startTime;
    await recordProviderMetric("twilio", "whatsapp", false, latency);

    log.error({ messageId, err }, "WhatsApp send failed");
    await handleSendFailure(
      messageId,
      "twilio_whatsapp",
      err instanceof Error ? err.message : "Unknown error",
    );
  }
}
