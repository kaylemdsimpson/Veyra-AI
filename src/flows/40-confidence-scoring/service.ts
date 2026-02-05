import { createLogger } from "../../lib/logger.js";

const log = createLogger("flow:confidence-scoring");

/**
 * Flow 40: Confidence Scoring Engine
 *
 * Computes attribution confidence for a recovery event.
 *
 * Confidence tiers:
 *  - 0.90+ : Definitive (checkout token or coupon code match)
 *  - 0.70-0.89 : High (cart token + engagement)
 *  - 0.50-0.69 : Moderate (email match + click within window)
 *  - 0.30-0.49 : Low (email match only, no engagement signal)
 *  - < 0.30 : Not attributed (organic return)
 *
 * Billing threshold: Only charge for recoveries with confidence >= 0.50
 */

export interface ConfidenceInput {
  checkoutTokenMatch: boolean;
  cartTokenMatch: boolean;
  couponCodeMatch: boolean;
  emailMatch: boolean;
  clickedWithin24h: boolean;
  openedWithin48h: boolean;
  timeSinceAbandonHours: number;
}

export const BILLING_CONFIDENCE_THRESHOLD = 0.50;

export function calculateConfidence(input: ConfidenceInput): number {
  let confidence = 0;

  // ─── Direct match signals ──────────────────────────────────
  if (input.couponCodeMatch) {
    confidence = 0.98; // Strongest signal — our unique code was used
  } else if (input.checkoutTokenMatch) {
    confidence = 0.95;
  } else if (input.cartTokenMatch) {
    confidence = 0.85;
  } else if (input.emailMatch) {
    confidence = 0.40;
  } else {
    return 0; // No match signals
  }

  // ─── Engagement boost ──────────────────────────────────────
  if (input.clickedWithin24h) {
    confidence = Math.min(confidence + 0.15, 1.0);
  } else if (input.openedWithin48h) {
    confidence = Math.min(confidence + 0.05, 1.0);
  }

  // ─── Time decay ─────────────────────────────────────────────
  if (input.timeSinceAbandonHours > 48) {
    confidence *= 0.9;
  } else if (input.timeSinceAbandonHours > 72) {
    confidence *= 0.75;
  }

  // ─── Floor ──────────────────────────────────────────────────
  confidence = Math.max(0, Math.min(1, confidence));

  log.debug({ input, confidence }, "Confidence calculated");
  return parseFloat(confidence.toFixed(4));
}

export function isBillable(confidence: number): boolean {
  return confidence >= BILLING_CONFIDENCE_THRESHOLD;
}
