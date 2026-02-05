import { getDb } from "../../db/client.js";
import { events } from "../../db/schema/index.js";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("flow:error-logging");

/**
 * Flow 47: Error Logging & Alerting
 *
 * Centralised error logging with alerting thresholds.
 *
 * All errors are:
 *  1. Logged with structured context (Pino)
 *  2. Written to the events table for audit
 *  3. Checked against alert thresholds
 *
 * Alert channels (future):
 *  - Slack webhook
 *  - PagerDuty
 *  - Email to ops team
 *
 * Engineering assumption: For MVP, we log to structured output.
 * External alerting integrations are added post-launch.
 */

export interface ErrorContext {
  storeId?: string;
  flow: string;
  severity: "warning" | "error" | "critical";
  message: string;
  metadata?: Record<string, unknown>;
}

export async function logError(context: ErrorContext): Promise<void> {
  const db = getDb();

  // Write to events table
  await db.insert(events).values({
    storeId: context.storeId ?? "00000000-0000-0000-0000-000000000000",
    type: `error.${context.severity}`,
    source: context.flow,
    idempotencyKey: `error:${context.flow}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    payload: {
      message: context.message,
      severity: context.severity,
      ...(context.metadata ?? {}),
    },
  });

  // Log based on severity
  switch (context.severity) {
    case "critical":
      log.fatal({ ...context }, context.message);
      // Future: trigger PagerDuty/Slack alert
      break;
    case "error":
      log.error({ ...context }, context.message);
      break;
    case "warning":
      log.warn({ ...context }, context.message);
      break;
  }
}

/**
 * Log a flow event (non-error) for audit trail.
 */
export async function logEvent(
  storeId: string,
  type: string,
  source: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const db = getDb();

  await db.insert(events).values({
    storeId,
    type,
    source,
    idempotencyKey: `event:${type}:${storeId}:${Date.now()}`,
    payload,
    processedAt: new Date(),
  });
}
