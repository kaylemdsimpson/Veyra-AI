import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Shopify — optional at boot, required when a merchant connects
  SHOPIFY_API_KEY: z.string().default(""),
  SHOPIFY_API_SECRET: z.string().default(""),
  SHOPIFY_SCOPES: z.string().default("read_checkouts,read_orders,write_script_tags,read_customers,write_discounts"),
  SHOPIFY_APP_URL: z.string().default(""),
  SHOPIFY_WEBHOOK_SECRET: z.string().default(""),

  // Stripe — optional at boot, required for billing
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  STRIPE_PRICE_ID: z.string().default(""),

  // Email — optional at boot, required for sending recovery emails
  RESEND_API_KEY: z.string().default(""),
  RESEND_FROM_EMAIL: z.string().default(""),

  // Twilio — optional at boot, required for SMS/WhatsApp
  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_PHONE_NUMBER: z.string().default(""),
  TWILIO_WHATSAPP_NUMBER: z.string().default("whatsapp:+14155238886"),

  // App
  APP_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(32),

  // Feature flags
  ENABLE_SMS: z.coerce.boolean().default(false),
  ENABLE_WHATSAPP: z.coerce.boolean().default(false),
  ENABLE_HOLDOUT_GROUPS: z.coerce.boolean().default(true),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function loadEnv(): Env {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const fields = result.error.flatten().fieldErrors;
    console.error("──── Missing / invalid environment variables ────");
    for (const [key, errors] of Object.entries(fields)) {
      console.error(`  ${key}: ${(errors as string[]).join(", ")}`);
    }
    console.error("─────────────────────────────────────────────────");
    throw new Error("Invalid environment configuration — see above for details");
  }
  _env = result.data;
  return _env;
}

export function env(): Env {
  if (!_env) return loadEnv();
  return _env;
}
