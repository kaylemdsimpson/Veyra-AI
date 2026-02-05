import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { loadEnv, env } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { closeDb } from "./db/client.js";
import { closeRedis } from "./lib/redis.js";
import { closeAllQueues } from "./lib/queue.js";

// Routes
import { shopifyAuthRoutes } from "./flows/01-shopify-oauth/routes.js";
import { webhookRoutes } from "./flows/02-webhook-registration/routes.js";
import { trackingRoutes } from "./flows/37-open-tracking/routes.js";
import { dashboardRoutes } from "./flows/48-dashboard-metrics/routes.js";
import { stripeWebhookRoutes } from "./flows/44-stripe-usage-reporter/routes.js";

loadEnv();
const log = createLogger("server");

const app = Fastify({
  logger: false, // We use our own pino instance
  trustProxy: true,
  requestTimeout: 30_000,
});

async function start() {
  // Plugins
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env().NODE_ENV === "production" ? env().SHOPIFY_APP_URL : true,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  // Health check
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // Routes
  await app.register(shopifyAuthRoutes, { prefix: "/auth/shopify" });
  await app.register(webhookRoutes, { prefix: "/webhooks/shopify" });
  await app.register(trackingRoutes, { prefix: "/t" });
  await app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  await app.register(stripeWebhookRoutes, { prefix: "/webhooks/stripe" });

  // Global error handler
  app.setErrorHandler((error, _request, reply) => {
    log.error({ err: error }, "Unhandled error");
    const statusCode = (error as any).statusCode ?? 500;
    reply.status(statusCode).send({
      error: error.message,
      code: (error as any).code ?? "INTERNAL_ERROR",
    });
  });

  // Start
  const port = env().PORT;
  await app.listen({ port, host: "0.0.0.0" });
  log.info({ port }, "Veyra server started");
}

// Graceful shutdown
async function shutdown(signal: string) {
  log.info({ signal }, "Shutting down");
  await app.close();
  await closeAllQueues();
  await closeRedis();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start().catch((err) => {
  log.fatal({ err }, "Failed to start server");
  process.exit(1);
});
