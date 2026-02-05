import {
  pgTable, text, timestamp, integer, numeric, uuid,
} from "drizzle-orm/pg-core";

export const providerHealth = pgTable("provider_health", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(), // "resend", "sendgrid", "twilio", "telnyx"
  channel: text("channel").notNull(),   // "email", "sms", "whatsapp"
  successCount: integer("success_count").default(0),
  failureCount: integer("failure_count").default(0),
  avgLatencyMs: numeric("avg_latency_ms", { precision: 10, scale: 2 }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
