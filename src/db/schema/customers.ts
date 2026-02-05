import {
  pgTable, text, timestamp, boolean, numeric, integer, uuid, index,
} from "drizzle-orm/pg-core";
import { stores } from "./stores.js";

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  shopifyCustomerId: text("shopify_customer_id"),
  email: text("email"),
  phone: text("phone"),
  firstName: text("first_name"),
  lastName: text("last_name"),

  // Marketing consent
  emailConsent: boolean("email_consent").default(false),
  smsConsent: boolean("sms_consent").default(false),

  // Scoring
  totalOrders: integer("total_orders").default(0),
  totalSpent: numeric("total_spent", { precision: 12, scale: 2 }).default("0"),
  ltv: numeric("ltv", { precision: 12, scale: 2 }).default("0"),
  isVip: boolean("is_vip").default(false),
  recoveryProbability: numeric("recovery_probability", { precision: 5, scale: 4 }),
  discountSensitivity: numeric("discount_sensitivity", { precision: 5, scale: 4 }),
  preferredChannel: text("preferred_channel").$type<"email" | "sms" | "whatsapp">(),

  // Engagement
  lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
  lastEmailOpenAt: timestamp("last_email_open_at", { withTimezone: true }),
  lastClickAt: timestamp("last_click_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_customers_store_email").on(table.storeId, table.email),
  index("idx_customers_store_shopify").on(table.storeId, table.shopifyCustomerId),
  index("idx_customers_vip").on(table.storeId, table.isVip),
]);
