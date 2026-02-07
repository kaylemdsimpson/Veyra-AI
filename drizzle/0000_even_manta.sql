CREATE TYPE "public"."abandon_type" AS ENUM('checkout', 'cart', 'browse');--> statement-breakpoint
CREATE TYPE "public"."recovery_state" AS ENUM('detected', 'qualified', 'scoring', 'sequencing', 'awaiting_send', 'sending', 'engaged', 'recovered', 'expired', 'cancelled', 'holdout');--> statement-breakpoint
CREATE TYPE "public"."coupon_status" AS ENUM('active', 'used', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."store_status" AS ENUM('active', 'paused', 'uninstalled', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('email', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'scheduled', 'sending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed');--> statement-breakpoint
CREATE TABLE "abandons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"customer_id" uuid,
	"type" "abandon_type" NOT NULL,
	"state" "recovery_state" DEFAULT 'detected' NOT NULL,
	"shopify_checkout_id" text,
	"shopify_checkout_token" text,
	"shopify_cart_token" text,
	"email" text,
	"phone" text,
	"cart_total" numeric(12, 2),
	"cart_currency" text DEFAULT 'USD',
	"line_items" jsonb DEFAULT '[]'::jsonb,
	"checkout_url" text,
	"recovery_score" numeric(5, 4),
	"discount_offered" numeric(5, 2),
	"discount_type" text,
	"coupon_code" text,
	"recovered_order_id" text,
	"recovered_revenue" numeric(12, 2),
	"recovered_at" timestamp with time zone,
	"attribution_confidence" numeric(5, 4),
	"abandoned_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"abandon_id" uuid,
	"code" text NOT NULL,
	"shopify_price_rule_id" text,
	"shopify_discount_code_id" text,
	"discount_type" text NOT NULL,
	"discount_value" numeric(8, 2) NOT NULL,
	"minimum_order_amount" numeric(12, 2),
	"single_use" boolean DEFAULT true,
	"status" "coupon_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"shopify_customer_id" text,
	"email" text,
	"phone" text,
	"first_name" text,
	"last_name" text,
	"email_consent" boolean DEFAULT false,
	"sms_consent" boolean DEFAULT false,
	"total_orders" integer DEFAULT 0,
	"total_spent" numeric(12, 2) DEFAULT '0',
	"ltv" numeric(12, 2) DEFAULT '0',
	"is_vip" boolean DEFAULT false,
	"recovery_probability" numeric(5, 4),
	"discount_sensitivity" numeric(5, 4),
	"preferred_channel" text,
	"last_order_at" timestamp with time zone,
	"last_email_open_at" timestamp with time zone,
	"last_click_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shopify_domain" text NOT NULL,
	"shopify_access_token" text NOT NULL,
	"shopify_store_id" text,
	"name" text,
	"email" text,
	"currency" text DEFAULT 'USD',
	"timezone" text DEFAULT 'UTC',
	"status" "store_status" DEFAULT 'active' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"settings" jsonb DEFAULT '{"recoveryEnabled":true,"emailEnabled":true,"smsEnabled":false,"whatsappEnabled":false,"maxDiscountPercent":15,"defaultHoldoutPercent":10,"abandonThresholdMinutes":60,"maxMessagesPerRecovery":3,"respectMarketingConsent":true,"autoPauseOnHighUnsubscribe":true}'::jsonb,
	"last_sync_at" timestamp with time zone,
	"webhooks_registered_at" timestamp with time zone,
	"installed_at" timestamp with time zone DEFAULT now(),
	"uninstalled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_shopify_domain_unique" UNIQUE("shopify_domain")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"abandon_id" uuid NOT NULL,
	"customer_id" uuid,
	"channel" "message_channel" NOT NULL,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"sequence_step" integer DEFAULT 1 NOT NULL,
	"subject" text,
	"body_html" text,
	"body_text" text,
	"template_id" text,
	"includes_discount" integer DEFAULT 0,
	"discount_percent" numeric(5, 2),
	"coupon_code" text,
	"provider_message_id" text,
	"provider" text,
	"tracking_id" text NOT NULL,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"attempts" integer DEFAULT 0,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"abandon_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"order_total" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD',
	"discount_given" numeric(12, 2) DEFAULT '0',
	"net_revenue" numeric(12, 2) NOT NULL,
	"fee_percent" numeric(5, 2) NOT NULL,
	"fee_amount" numeric(12, 2) NOT NULL,
	"attribution_confidence" numeric(5, 4),
	"attribution_source" text,
	"billing_period" text,
	"reported_to_stripe" timestamp with time zone,
	"recovered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"channel" text NOT NULL,
	"success_count" integer DEFAULT 0,
	"failure_count" integer DEFAULT 0,
	"avg_latency_ms" numeric(10, 2),
	"last_failure_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"window_start" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "abandons" ADD CONSTRAINT "abandons_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abandons" ADD CONSTRAINT "abandons_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_abandon_id_abandons_id_fk" FOREIGN KEY ("abandon_id") REFERENCES "public"."abandons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_abandon_id_abandons_id_fk" FOREIGN KEY ("abandon_id") REFERENCES "public"."abandons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_ledger" ADD CONSTRAINT "recovery_ledger_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_ledger" ADD CONSTRAINT "recovery_ledger_abandon_id_abandons_id_fk" FOREIGN KEY ("abandon_id") REFERENCES "public"."abandons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_abandons_store_state" ON "abandons" USING btree ("store_id","state");--> statement-breakpoint
CREATE INDEX "idx_abandons_store_email" ON "abandons" USING btree ("store_id","email");--> statement-breakpoint
CREATE INDEX "idx_abandons_checkout_id" ON "abandons" USING btree ("store_id","shopify_checkout_id");--> statement-breakpoint
CREATE INDEX "idx_abandons_expires" ON "abandons" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_abandons_state_created" ON "abandons" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "idx_coupons_code" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_coupons_store_status" ON "coupons" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "idx_coupons_expires" ON "coupons" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_customers_store_email" ON "customers" USING btree ("store_id","email");--> statement-breakpoint
CREATE INDEX "idx_customers_store_shopify" ON "customers" USING btree ("store_id","shopify_customer_id");--> statement-breakpoint
CREATE INDEX "idx_customers_vip" ON "customers" USING btree ("store_id","is_vip");--> statement-breakpoint
CREATE INDEX "idx_events_idempotency" ON "events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_events_store_type" ON "events" USING btree ("store_id","type");--> statement-breakpoint
CREATE INDEX "idx_events_created" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_abandon" ON "messages" USING btree ("abandon_id");--> statement-breakpoint
CREATE INDEX "idx_messages_store_status" ON "messages" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "idx_messages_scheduled" ON "messages" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_messages_tracking" ON "messages" USING btree ("tracking_id");--> statement-breakpoint
CREATE INDEX "idx_ledger_store_period" ON "recovery_ledger" USING btree ("store_id","billing_period");--> statement-breakpoint
CREATE INDEX "idx_ledger_store_date" ON "recovery_ledger" USING btree ("store_id","recovered_at");