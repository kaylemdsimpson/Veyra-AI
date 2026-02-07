import type { StoreSettings } from "../db/schema/stores.js";
import { createLogger } from "./logger.js";

const log = createLogger("flow-eligibility");

/**
 * Flow Eligibility Evaluator
 *
 * Determines which of the 48 flows are active for a given store based on
 * its configuration (settings JSONB) and feature flags. Flows are prebuilt
 * and immutable — merchants never define, edit, or see them.
 *
 * This is "Configuration-Driven Activation": the system evaluates
 * entitlements at runtime. No visual builder, no workflow editor.
 */

export interface FlowEligibility {
  id: number;
  name: string;
  active: boolean;
  reason: string;
}

/**
 * Evaluate which flows are eligible for a store.
 */
export function evaluateFlowEligibility(
  settings: StoreSettings,
  featureFlags: {
    smsEnabled: boolean;
    whatsappEnabled: boolean;
    holdoutEnabled: boolean;
  },
): FlowEligibility[] {
  const s = settings;
  const f = featureFlags;

  // Helper: always active (core infrastructure)
  const always = (id: number, name: string): FlowEligibility => ({
    id,
    name,
    active: true,
    reason: "Core infrastructure — always active",
  });

  // Helper: active only if recovery is enabled
  const ifRecovery = (id: number, name: string): FlowEligibility => ({
    id,
    name,
    active: s.recoveryEnabled,
    reason: s.recoveryEnabled ? "Recovery enabled" : "Recovery disabled in settings",
  });

  return [
    // ─── Installation & Setup (always active) ───────────────────
    always(1, "shopify-oauth"),
    always(2, "webhook-registration"),
    always(3, "app-uninstall"),
    always(4, "store-sync"),
    always(5, "customer-sync"),

    // ─── Abandon Detection (active if recovery enabled) ─────────
    ifRecovery(6, "checkout-created"),
    ifRecovery(7, "checkout-updated"),
    ifRecovery(8, "checkout-abandon-detector"),
    ifRecovery(9, "cart-abandon-detector"),
    ifRecovery(10, "browse-abandon-detector"),

    // ─── Order & Attribution ────────────────────────────────────
    always(11, "order-created"),
    ifRecovery(12, "order-attribution"),

    // ─── Abandon Processing Pipeline ────────────────────────────
    ifRecovery(13, "abandon-normaliser"),
    ifRecovery(14, "duplicate-resolver"),
    ifRecovery(15, "expiry-timer"),
    ifRecovery(16, "recovery-state-machine"),

    // ─── Scoring Engines ────────────────────────────────────────
    ifRecovery(17, "vip-detection"),
    ifRecovery(18, "ltv-calculator"),
    ifRecovery(19, "recovery-probability-scorer"),
    ifRecovery(20, "discount-sensitivity-scorer"),

    // ─── Channel Selection ──────────────────────────────────────
    {
      id: 21,
      name: "channel-preference",
      active: s.recoveryEnabled && (s.emailEnabled || s.smsEnabled || s.whatsappEnabled),
      reason: !s.recoveryEnabled
        ? "Recovery disabled"
        : !(s.emailEnabled || s.smsEnabled || s.whatsappEnabled)
          ? "No channels enabled"
          : "At least one channel enabled",
    },

    // ─── Discount Engine ────────────────────────────────────────
    ifRecovery(22, "margin-safety-check"),
    {
      id: 23,
      name: "discount-eligibility",
      active: s.recoveryEnabled && s.maxDiscountPercent > 0,
      reason: s.maxDiscountPercent > 0
        ? `Discounts enabled (max ${s.maxDiscountPercent}%)`
        : "Max discount set to 0% — discounts disabled",
    },
    {
      id: 24,
      name: "discount-value-calculator",
      active: s.recoveryEnabled && s.maxDiscountPercent > 0,
      reason: s.maxDiscountPercent > 0 ? "Active" : "Discounts disabled",
    },
    {
      id: 25,
      name: "discount-timing",
      active: s.recoveryEnabled && s.maxDiscountPercent > 0,
      reason: s.maxDiscountPercent > 0 ? "Active" : "Discounts disabled",
    },
    {
      id: 26,
      name: "dynamic-coupon-generator",
      active: s.recoveryEnabled && s.maxDiscountPercent > 0,
      reason: s.maxDiscountPercent > 0 ? "Active" : "Discounts disabled",
    },
    {
      id: 27,
      name: "coupon-expiry",
      active: s.recoveryEnabled && s.maxDiscountPercent > 0,
      reason: s.maxDiscountPercent > 0 ? "Active" : "Discounts disabled",
    },

    // ─── Messaging Pipeline ─────────────────────────────────────
    ifRecovery(28, "message-sequence-builder"),
    ifRecovery(29, "send-time-optimiser"),
    {
      id: 30,
      name: "holdout-group",
      active: s.recoveryEnabled && f.holdoutEnabled && s.defaultHoldoutPercent > 0,
      reason: !f.holdoutEnabled
        ? "Holdout groups disabled (feature flag)"
        : s.defaultHoldoutPercent === 0
          ? "Holdout percent set to 0"
          : `Active — ${s.defaultHoldoutPercent}% holdout`,
    },
    ifRecovery(31, "message-queue-manager"),
    ifRecovery(32, "retry-failover"),

    // ─── Channel Senders ────────────────────────────────────────
    {
      id: 33,
      name: "email-sender",
      active: s.recoveryEnabled && s.emailEnabled,
      reason: s.emailEnabled ? "Email enabled" : "Email disabled in settings",
    },
    {
      id: 34,
      name: "sms-sender",
      active: s.recoveryEnabled && s.smsEnabled && f.smsEnabled,
      reason: !f.smsEnabled
        ? "SMS disabled (feature flag)"
        : !s.smsEnabled
          ? "SMS disabled in settings"
          : "SMS enabled",
    },
    {
      id: 35,
      name: "whatsapp-sender",
      active: s.recoveryEnabled && s.whatsappEnabled && f.whatsappEnabled,
      reason: !f.whatsappEnabled
        ? "WhatsApp disabled (feature flag)"
        : !s.whatsappEnabled
          ? "WhatsApp disabled in settings"
          : "WhatsApp enabled",
    },

    // ─── Provider Health ────────────────────────────────────────
    always(36, "provider-health"),

    // ─── Tracking ───────────────────────────────────────────────
    ifRecovery(37, "open-tracking"),
    ifRecovery(38, "click-tracking"),

    // ─── Conversion & Attribution ───────────────────────────────
    ifRecovery(39, "conversion-matcher"),
    ifRecovery(40, "confidence-scoring"),

    // ─── Billing Pipeline ───────────────────────────────────────
    always(41, "recovery-ledger"),
    always(42, "fee-calculator"),
    always(43, "billing-aggregator"),
    always(44, "stripe-usage-reporter"),

    // ─── Safety & Monitoring ────────────────────────────────────
    ifRecovery(45, "conflict-detection"),
    {
      id: 46,
      name: "auto-pause",
      active: s.recoveryEnabled && s.autoPauseOnHighUnsubscribe,
      reason: s.autoPauseOnHighUnsubscribe
        ? "Auto-pause enabled"
        : "Auto-pause disabled in settings",
    },
    always(47, "error-logging"),
    always(48, "dashboard-metrics"),
  ];
}

/**
 * Quick check: is a specific flow active for a store?
 */
export function isFlowActive(
  flowId: number,
  settings: StoreSettings,
  featureFlags: {
    smsEnabled: boolean;
    whatsappEnabled: boolean;
    holdoutEnabled: boolean;
  },
): boolean {
  const eligibility = evaluateFlowEligibility(settings, featureFlags);
  const flow = eligibility.find((f) => f.id === flowId);
  return flow?.active ?? false;
}
