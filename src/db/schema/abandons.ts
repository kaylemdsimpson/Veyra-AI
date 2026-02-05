import {
  pgTable, text, timestamp, numeric, uuid, jsonb, pgEnum, index,
} from "drizzle-orm/pg-core";
import { stores } from "./stores.js";
import { customers } from "./customers.js";

export const abandonTypeEnum = pgEnum("abandon_type", [
  "checkout",
  "cart",
  "browse",
]);

export const recoveryStateEnum = pgEnum("recovery_state", [
  "detected",          // Initial detection
  "qualified",         // Passed dedup, normalisation
  "scoring",           // Being scored for probability/discount
  "sequencing",        // Message sequence being built
  "awaiting_send",     // Waiting for optimal send time
  "sending",           // Messages actively being sent
  "engaged",           // Customer opened/clicked
  "recovered",         // Order placed — attributed
  "expired",           // TTL exceeded with no recovery
  "cancelled",         // Manually or auto-cancelled
  "holdout",           // In holdout group — no messages sent
]);

export const abandons = pgTable("abandons", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").references(() => customers.id),
  type: abandonTypeEnum("type").notNull(),
  state: recoveryStateEnum("state").default("detected").notNull(),

  // Shopify references
  shopifyCheckoutId: text("shopify_checkout_id"),
  shopifyCheckoutToken: text("shopify_checkout_token"),
  shopifyCartToken: text("shopify_cart_token"),

  // Contact
  email: text("email"),
  phone: text("phone"),

  // Cart details
  cartTotal: numeric("cart_total", { precision: 12, scale: 2 }),
  cartCurrency: text("cart_currency").default("USD"),
  lineItems: jsonb("line_items").$type<AbandonLineItem[]>().default([]),
  checkoutUrl: text("checkout_url"),

  // Recovery tracking
  recoveryScore: numeric("recovery_score", { precision: 5, scale: 4 }),
  discountOffered: numeric("discount_offered", { precision: 5, scale: 2 }),
  discountType: text("discount_type").$type<"percentage" | "fixed" | null>(),
  couponCode: text("coupon_code"),

  // Attribution
  recoveredOrderId: text("recovered_order_id"),
  recoveredRevenue: numeric("recovered_revenue", { precision: 12, scale: 2 }),
  recoveredAt: timestamp("recovered_at", { withTimezone: true }),
  attributionConfidence: numeric("attribution_confidence", { precision: 5, scale: 4 }),

  // Timestamps
  abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_abandons_store_state").on(table.storeId, table.state),
  index("idx_abandons_store_email").on(table.storeId, table.email),
  index("idx_abandons_checkout_id").on(table.storeId, table.shopifyCheckoutId),
  index("idx_abandons_expires").on(table.expiresAt),
  index("idx_abandons_state_created").on(table.state, table.createdAt),
]);

export interface AbandonLineItem {
  productId: string;
  variantId: string;
  title: string;
  quantity: number;
  price: string;
  imageUrl?: string;
}
