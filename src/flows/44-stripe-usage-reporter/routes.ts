import type { FastifyPluginAsync } from "fastify";
import { createLogger } from "../../lib/logger.js";
import { env } from "../../config/env.js";

const log = createLogger("flow:stripe-webhooks");

/**
 * Stripe webhook receiver for billing events.
 */
export const stripeWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.post("/", async (request, reply) => {
    const sig = request.headers["stripe-signature"] as string;
    const rawBody = request.body as string;

    // In production, verify webhook signature using Stripe SDK
    // For now, log and acknowledge
    try {
      const event = JSON.parse(rawBody);
      log.info({ type: event.type, id: event.id }, "Stripe webhook received");

      switch (event.type) {
        case "invoice.payment_succeeded":
          log.info({ invoiceId: event.data.object.id }, "Payment succeeded");
          break;
        case "invoice.payment_failed":
          log.warn({ invoiceId: event.data.object.id }, "Payment failed");
          break;
        case "customer.subscription.deleted":
          log.warn({ subscriptionId: event.data.object.id }, "Subscription cancelled");
          break;
      }
    } catch (err) {
      log.error({ err }, "Failed to process Stripe webhook");
    }

    return reply.status(200).send({ received: true });
  });
};
