import {
  pgTable, text, timestamp, integer, uuid, jsonb, pgEnum, numeric, index,
} from "drizzle-orm/pg-core";
import { stores } from "./stores.js";
import { abandons } from "./abandons.js";
import { customers } from "./customers.js";

export const messageChannelEnum = pgEnum("message_channel", [
  "email",
  "sms",
  "whatsapp",
]);

export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "scheduled",
  "sending",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "failed",
  "unsubscribed",
]);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  abandonId: uuid("abandon_id").notNull().references(() => abandons.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").references(() => customers.id),

  channel: messageChannelEnum("channel").notNull(),
  status: messageStatusEnum("status").default("queued").notNull(),
  sequenceStep: integer("sequence_step").notNull().default(1),

  // Content
  subject: text("subject"),
  bodyHtml: text("body_html"),
  bodyText: text("body_text"),
  templateId: text("template_id"),

  // Discount
  includesDiscount: integer("includes_discount").default(0), // 0 = false, 1 = true
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }),
  couponCode: text("coupon_code"),

  // Delivery tracking
  providerMessageId: text("provider_message_id"),
  provider: text("provider"), // "resend", "sendgrid", "twilio", "telnyx"

  // Tracking
  trackingId: text("tracking_id").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),

  // Timing
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),

  // Retry
  attempts: integer("attempts").default(0),
  lastError: text("last_error"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_messages_abandon").on(table.abandonId),
  index("idx_messages_store_status").on(table.storeId, table.status),
  index("idx_messages_scheduled").on(table.scheduledFor),
  index("idx_messages_tracking").on(table.trackingId),
]);
