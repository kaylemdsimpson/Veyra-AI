import {
  pgTable, text, timestamp, uuid, jsonb, index,
} from "drizzle-orm/pg-core";
import { stores } from "./stores.js";

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  source: text("source").notNull(), // "shopify_webhook", "internal", "scheduler"
  idempotencyKey: text("idempotency_key").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_events_idempotency").on(table.idempotencyKey),
  index("idx_events_store_type").on(table.storeId, table.type),
  index("idx_events_created").on(table.createdAt),
]);
