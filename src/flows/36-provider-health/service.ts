import { getDb } from "../../db/client.js";
import { providerHealth } from "../../db/schema/index.js";
import { eq, and, gt } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";

const log = createLogger("flow:provider-health");

/**
 * Flow 36: Provider Health Monitor
 *
 * Tracks success/failure rates for each messaging provider in rolling windows.
 * Triggers alerts when a provider degrades below threshold.
 *
 * Degraded threshold: < 95% success rate in a 15-minute window
 * Critical threshold: < 80% success rate → auto-failover
 */

const WINDOW_MINUTES = 15;
const DEGRADED_THRESHOLD = 0.95;
const CRITICAL_THRESHOLD = 0.80;

export async function recordProviderMetric(
  provider: string,
  channel: string,
  success: boolean,
  latencyMs: number,
): Promise<void> {
  const db = getDb();

  // Current window
  const windowStart = new Date(
    Math.floor(Date.now() / (WINDOW_MINUTES * 60_000)) * WINDOW_MINUTES * 60_000,
  );

  const existing = await db.query.providerHealth.findFirst({
    where: and(
      eq(providerHealth.provider, provider),
      eq(providerHealth.channel, channel),
      eq(providerHealth.windowStart, windowStart),
    ),
  });

  if (existing) {
    const newSuccess = (existing.successCount ?? 0) + (success ? 1 : 0);
    const newFailure = (existing.failureCount ?? 0) + (success ? 0 : 1);
    const total = newSuccess + newFailure;
    const avgLatency = existing.avgLatencyMs
      ? (parseFloat(existing.avgLatencyMs) * (total - 1) + latencyMs) / total
      : latencyMs;

    await db
      .update(providerHealth)
      .set({
        successCount: newSuccess,
        failureCount: newFailure,
        avgLatencyMs: avgLatency.toFixed(2),
        ...(success
          ? { lastSuccessAt: new Date() }
          : { lastFailureAt: new Date() }),
      })
      .where(eq(providerHealth.id, existing.id));
  } else {
    await db.insert(providerHealth).values({
      provider,
      channel,
      successCount: success ? 1 : 0,
      failureCount: success ? 0 : 1,
      avgLatencyMs: String(latencyMs),
      windowStart,
      ...(success
        ? { lastSuccessAt: new Date() }
        : { lastFailureAt: new Date() }),
    });
  }
}

/**
 * Check provider health for degradation or critical failure.
 */
export async function checkProviderHealth(): Promise<void> {
  const db = getDb();

  const windowStart = new Date(
    Math.floor(Date.now() / (WINDOW_MINUTES * 60_000)) * WINDOW_MINUTES * 60_000,
  );

  const currentMetrics = await db.query.providerHealth.findMany({
    where: eq(providerHealth.windowStart, windowStart),
  });

  for (const metric of currentMetrics) {
    const total = (metric.successCount ?? 0) + (metric.failureCount ?? 0);
    if (total < 5) continue; // Not enough data

    const successRate = (metric.successCount ?? 0) / total;

    if (successRate < CRITICAL_THRESHOLD) {
      await eventBus.emit(EVENTS.PROVIDER_DEGRADED, {
        provider: metric.provider,
        channel: metric.channel,
        successRate,
        level: "critical",
      });
      log.error(
        { provider: metric.provider, channel: metric.channel, successRate },
        "Provider CRITICAL — auto-failover recommended",
      );
    } else if (successRate < DEGRADED_THRESHOLD) {
      await eventBus.emit(EVENTS.PROVIDER_DEGRADED, {
        provider: metric.provider,
        channel: metric.channel,
        successRate,
        level: "degraded",
      });
      log.warn(
        { provider: metric.provider, channel: metric.channel, successRate },
        "Provider degraded",
      );
    }
  }
}
