import { Resend } from "resend";
import { getDb } from "../../db/client.js";
import { messages, abandons, stores } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { env } from "../../config/env.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";
import { handleSendFailure } from "../32-retry-failover/service.js";
import { recordProviderMetric } from "../36-provider-health/service.js";

const log = createLogger("flow:email-sender");

/**
 * Flow 33: Email Sender
 *
 * Sends recovery emails via Resend (primary provider).
 *
 * Responsibilities:
 *  - Render email template with abandon data
 *  - Include tracking pixel for opens
 *  - Wrap links for click tracking
 *  - Send via Resend API
 *  - Update message status
 *  - Handle errors → delegate to retry/failover
 */
export async function sendEmail(messageId: string): Promise<void> {
  const db = getDb();
  const startTime = Date.now();

  const msg = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
  });
  if (!msg || msg.channel !== "email") return;

  const abandon = await db.query.abandons.findFirst({
    where: eq(abandons.id, msg.abandonId),
  });
  if (!abandon || !abandon.email) return;

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, msg.storeId),
  });
  if (!store) return;

  // Render template
  const { subject, html } = renderEmailTemplate(msg, abandon, store);

  // Add tracking pixel
  const appUrl = env().SHOPIFY_APP_URL;
  const trackingPixel = `<img src="${appUrl}/t/open/${msg.trackingId}" width="1" height="1" style="display:none" alt="" />`;
  const htmlWithTracking = html + trackingPixel;

  // Wrap checkout URL with click tracking
  const trackedCheckoutUrl = `${appUrl}/t/click/${msg.trackingId}?url=${encodeURIComponent(abandon.checkoutUrl ?? "")}`;

  const finalHtml = htmlWithTracking.replace(
    /\{\{checkout_url\}\}/g,
    trackedCheckoutUrl,
  );

  try {
    const resend = new Resend(env().RESEND_API_KEY);
    const result = await resend.emails.send({
      from: `${store.name ?? "Store"} <${env().RESEND_FROM_EMAIL}>`,
      to: abandon.email,
      subject,
      html: finalHtml,
    });

    const latency = Date.now() - startTime;

    await db
      .update(messages)
      .set({
        status: "sent",
        provider: "resend",
        providerMessageId: result.data?.id,
        sentAt: new Date(),
        subject,
        bodyHtml: finalHtml,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, messageId));

    await recordProviderMetric("resend", "email", true, latency);
    await eventBus.emit(EVENTS.MESSAGE_SENT, {
      messageId,
      abandonId: msg.abandonId,
      channel: "email",
    });

    log.info({ messageId, to: abandon.email }, "Email sent");
  } catch (err) {
    const latency = Date.now() - startTime;
    await recordProviderMetric("resend", "email", false, latency);

    log.error({ messageId, err }, "Email send failed");
    await handleSendFailure(
      messageId,
      "resend",
      err instanceof Error ? err.message : "Unknown error",
    );
  }
}

function renderEmailTemplate(
  msg: typeof messages.$inferSelect,
  abandon: typeof abandons.$inferSelect,
  store: typeof stores.$inferSelect,
): { subject: string; html: string } {
  const storeName = store.name ?? "Store";
  const lineItems = (abandon.lineItems as any[]) ?? [];
  const firstItem = lineItems[0];
  const itemCount = lineItems.length;
  const cartTotal = abandon.cartTotal ?? "0";

  // Template selection based on templateId
  const isLastChance = msg.templateId?.includes("last_chance");
  const includesDiscount = msg.includesDiscount === 1;

  let subject: string;
  let headline: string;
  let cta: string;

  if (isLastChance) {
    subject = `Last chance: your ${storeName} cart is expiring`;
    headline = "Your items are almost gone";
    cta = includesDiscount && msg.couponCode
      ? `Complete your purchase with ${msg.discountPercent}% off — use code ${msg.couponCode}`
      : "Complete your purchase before your cart expires";
  } else if (msg.sequenceStep === 1) {
    subject = `You left something behind at ${storeName}`;
    headline = "Did you forget something?";
    cta = "Return to your cart";
  } else {
    subject = `Still thinking about it? Your ${storeName} cart is waiting`;
    headline = "Your cart is still waiting";
    cta = includesDiscount && msg.couponCode
      ? `Here's ${msg.discountPercent}% off to help you decide — code: ${msg.couponCode}`
      : "Complete your purchase";
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h1 style="font-size:24px;margin-bottom:16px">${headline}</h1>
  <p>Hi${abandon.email ? "" : " there"},</p>
  <p>${cta}</p>
  ${firstItem ? `
  <div style="border:1px solid #eee;border-radius:8px;padding:16px;margin:24px 0">
    <p style="font-weight:600;margin:0 0 8px">${firstItem.title}${itemCount > 1 ? ` + ${itemCount - 1} more` : ""}</p>
    <p style="color:#666;margin:0">Cart total: $${cartTotal}</p>
  </div>
  ` : ""}
  ${includesDiscount && msg.couponCode ? `
  <div style="background:#f0fdf4;border:2px dashed #22c55e;border-radius:8px;padding:16px;margin:24px 0;text-align:center">
    <p style="font-size:18px;font-weight:700;color:#16a34a;margin:0 0 8px">${msg.discountPercent}% OFF</p>
    <p style="font-family:monospace;font-size:20px;letter-spacing:2px;margin:0">${msg.couponCode}</p>
  </div>
  ` : ""}
  <a href="{{checkout_url}}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;margin:16px 0">Complete Purchase</a>
  <p style="color:#999;font-size:12px;margin-top:32px">${storeName}</p>
</body>
</html>`;

  return { subject, html };
}
