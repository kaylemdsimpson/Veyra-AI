import {
  pgTable, text, timestamp, boolean, jsonb, integer, uuid, pgEnum,
} from "drizzle-orm/pg-core";

export const storeStatusEnum = pgEnum("store_status", [
  "active",
  "paused",
  "uninstalled",
  "suspended",
]);

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  shopifyDomain: text("shopify_domain").notNull().unique(),
  shopifyAccessToken: text("shopify_access_token").notNull(),
  shopifyStoreId: text("shopify_store_id"),
  name: text("name"),
  email: text("email"),
  currency: text("currency").default("USD"),
  timezone: text("timezone").default("UTC"),
  status: storeStatusEnum("status").default("active").notNull(),

  // Snippet — domain-bound HMAC token for client-side tracking script
  snippetToken: text("snippet_token"),

  // Stripe
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),

  // Settings
  settings: jsonb("settings").$type<StoreSettings>().default({
    recoveryEnabled: true,
    emailEnabled: true,
    smsEnabled: false,
    whatsappEnabled: false,
    maxDiscountPercent: 15,
    defaultHoldoutPercent: 10,
    abandonThresholdMinutes: 60,
    maxMessagesPerRecovery: 3,
    respectMarketingConsent: true,
    autoPauseOnHighUnsubscribe: true,
  }),

  // Sync tracking
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  webhooksRegisteredAt: timestamp("webhooks_registered_at", { withTimezone: true }),

  installedAt: timestamp("installed_at", { withTimezone: true }).defaultNow(),
  uninstalledAt: timestamp("uninstalled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export interface StoreSettings {
  recoveryEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  maxDiscountPercent: number;
  defaultHoldoutPercent: number;
  abandonThresholdMinutes: number;
  maxMessagesPerRecovery: number;
  respectMarketingConsent: boolean;
  autoPauseOnHighUnsubscribe: boolean;
}
