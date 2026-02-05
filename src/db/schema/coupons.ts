import {
  pgTable, text, timestamp, numeric, uuid, boolean, pgEnum, index,
} from "drizzle-orm/pg-core";
import { stores } from "./stores.js";
import { abandons } from "./abandons.js";

export const couponStatusEnum = pgEnum("coupon_status", [
  "active",
  "used",
  "expired",
  "revoked",
]);

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  abandonId: uuid("abandon_id").references(() => abandons.id),

  code: text("code").notNull(),
  shopifyPriceRuleId: text("shopify_price_rule_id"),
  shopifyDiscountCodeId: text("shopify_discount_code_id"),

  discountType: text("discount_type").$type<"percentage" | "fixed">().notNull(),
  discountValue: numeric("discount_value", { precision: 8, scale: 2 }).notNull(),
  minimumOrderAmount: numeric("minimum_order_amount", { precision: 12, scale: 2 }),
  singleUse: boolean("single_use").default(true),
  status: couponStatusEnum("status").default("active").notNull(),

  expiresAt: timestamp("expires_at", { withTimezone: true }),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_coupons_code").on(table.code),
  index("idx_coupons_store_status").on(table.storeId, table.status),
  index("idx_coupons_expires").on(table.expiresAt),
]);
