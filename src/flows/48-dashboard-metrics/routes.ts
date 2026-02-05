import type { FastifyPluginAsync } from "fastify";
import { buildDashboardMetrics } from "./service.js";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("flow:dashboard-routes");

/**
 * Dashboard API routes.
 * In production, these would be authenticated per-store.
 */
export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Querystring: { storeId: string; period?: string };
  }>("/metrics", async (request, reply) => {
    const { storeId, period } = request.query;

    if (!storeId) {
      return reply.status(400).send({ error: "storeId is required" });
    }

    const metrics = await buildDashboardMetrics(storeId, period ?? "30d");
    return reply.send(metrics);
  });
};
