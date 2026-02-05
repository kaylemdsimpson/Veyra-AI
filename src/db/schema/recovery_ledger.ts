import {
  pgTable, text, timestamp, numeric, uuid, index,
} from "drizzle-orm/pg-core";
import { stores } from "./stores.js";
import { abandons } from "./abandons.js";

export const recoveryLedger = pgTable("recovery_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  abandonId: uuid("abandon_id").notNull().references(() => abandons.id),

  orderId: text("order_id").notNull(),
  orderTotal: numeric("order_total", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),

  discountGiven: numeric("discount_given", { precision: 12, scale: 2 }).default("0"),
  netRevenue: numeric("net_revenue", { precision: 12, scale: 2 }).notNull(),

  // Veyra fee
  feePercent: numeric("fee_percent", { precision: 5, scale: 2 }).notNull(),
  feeAmount: numeric("fee_amount", { precision: 12, scale: 2 }).notNull(),

  // Attribution
  attributionConfidence: numeric("attribution_confidence", { precision: 5, scale: 4 }),
  attributionSource: text("attribution_source"), // "click", "open_then_purchase", "coupon_usage"

  // Billing
  billingPeriod: text("billing_period"), // "2025-01"
  reportedToStripe: timestamp("reported_to_stripe", { withTimezone: true }),

  recoveredAt: timestamp("recovered_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_ledger_store_period").on(table.storeId, table.billingPeriod),
  index("idx_ledger_store_date").on(table.storeId, table.recoveredAt),
]);
