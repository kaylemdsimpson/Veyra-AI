import { getDb } from "../../db/client.js";
import { abandons, customers } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("flow:recovery-probability-scorer");

/**
 * Flow 19: Recovery Probability Scorer
 *
 * Scores the likelihood of recovering a specific abandon (0.0 – 1.0).
 *
 * Factors:
 *  - Abandon type (checkout > cart > browse)
 *  - Cart value (higher value → slightly lower recovery, but higher ROI)
 *  - Customer history (returning customers recover better)
 *  - Time since abandon (fresher → higher probability)
 *  - Email/SMS availability (multi-channel → higher)
 *  - VIP status
 *
 * Engineering assumption: Rule-based scoring for MVP.
 * ML model training is a future enhancement once we have recovery data.
 */
export async function scoreRecoveryProbability(
  abandonId: string,
): Promise<number> {
  const db = getDb();

  const abandon = await db.query.abandons.findFirst({
    where: eq(abandons.id, abandonId),
  });
  if (!abandon) return 0;

  let score = 0.5; // Baseline

  // ─── Abandon type factor ────────────────────────────────────
  switch (abandon.type) {
    case "checkout":
      score += 0.15; // Strongest intent
      break;
    case "cart":
      score += 0.05;
      break;
    case "browse":
      score -= 0.10;
      break;
  }

  // ─── Cart value factor ──────────────────────────────────────
  const cartTotal = parseFloat(abandon.cartTotal ?? "0");
  if (cartTotal >= 200) score -= 0.05; // High-value = more considered purchase
  if (cartTotal >= 50 && cartTotal < 200) score += 0.05; // Sweet spot
  if (cartTotal < 20) score -= 0.10; // Too low to bother

  // ─── Customer history factor ────────────────────────────────
  if (abandon.customerId) {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, abandon.customerId),
    });

    if (customer) {
      const orders = customer.totalOrders ?? 0;
      if (orders >= 3) score += 0.15; // Loyal customer
      else if (orders >= 1) score += 0.08; // Returning customer
      // New customer: no adjustment

      if (customer.isVip) score += 0.10;

      // Engagement recency
      if (customer.lastEmailOpenAt) {
        const daysSinceOpen =
          (Date.now() - customer.lastEmailOpenAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceOpen < 7) score += 0.05;
      }
    }
  }

  // ─── Time since abandon ─────────────────────────────────────
  if (abandon.abandonedAt) {
    const hoursSince =
      (Date.now() - abandon.abandonedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 1) score += 0.10; // Very fresh
    else if (hoursSince < 4) score += 0.05;
    else if (hoursSince > 24) score -= 0.10;
    else if (hoursSince > 48) score -= 0.20;
  }

  // ─── Channel availability ──────────────────────────────────
  const hasEmail = !!abandon.email;
  const hasPhone = !!abandon.phone;
  if (hasEmail && hasPhone) score += 0.05;
  if (!hasEmail) score -= 0.15;

  // Clamp to [0.01, 0.99]
  score = Math.max(0.01, Math.min(0.99, score));

  // Persist
  await db
    .update(abandons)
    .set({ recoveryScore: score.toFixed(4), updatedAt: new Date() })
    .where(eq(abandons.id, abandonId));

  if (abandon.customerId) {
    await db
      .update(customers)
      .set({
        recoveryProbability: score.toFixed(4),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, abandon.customerId));
  }

  log.info({ abandonId, score }, "Recovery probability scored");
  return score;
}
