import { getDb } from "../../db/client.js";
import { abandons, messages } from "../../db/schema/index.js";
import { eq, and, inArray, desc } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("flow:conversion-matcher");

/**
 * Flow 39: Conversion Matcher
 *
 * Matches orders to abandons using multiple signals:
 *
 * Priority of matching signals:
 *  1. Checkout token (exact match — definitive)
 *  2. Cart token (strong match)
 *  3. Coupon code (strong match — Veyra-generated)
 *  4. Email + time window (weak match — needs confidence scoring)
 *  5. Click tracking + purchase window (moderate match)
 *
 * This is called by Flow 11 (Order Created Listener).
 * Results feed into Flow 12 (Order Attribution Resolver).
 */

export interface MatchResult {
  abandonId: string | null;
  matchType: "checkout_token" | "cart_token" | "coupon_code" | "email_window" | "click_purchase" | null;
  confidence: number;
}

export async function matchOrderToAbandon(
  storeId: string,
  orderId: string,
  email: string | null,
  checkoutToken: string | null,
  cartToken: string | null,
  discountCodes: string[],
): Promise<MatchResult> {
  const db = getDb();
  const activeStates = [
    "detected", "qualified", "scoring", "sequencing",
    "awaiting_send", "sending", "engaged",
  ] as const;

  // 1. Checkout token match
  if (checkoutToken) {
    const match = await db.query.abandons.findFirst({
      where: and(
        eq(abandons.storeId, storeId),
        eq(abandons.shopifyCheckoutToken, checkoutToken),
        inArray(abandons.state, [...activeStates]),
      ),
    });
    if (match) {
      return { abandonId: match.id, matchType: "checkout_token", confidence: 0.95 };
    }
  }

  // 2. Cart token match
  if (cartToken) {
    const match = await db.query.abandons.findFirst({
      where: and(
        eq(abandons.storeId, storeId),
        eq(abandons.shopifyCartToken, cartToken),
        inArray(abandons.state, [...activeStates]),
      ),
    });
    if (match) {
      return { abandonId: match.id, matchType: "cart_token", confidence: 0.85 };
    }
  }

  // 3. Coupon code match (Veyra-generated codes start with "VEYRA-")
  const veyraCodes = discountCodes.filter((c) => c.startsWith("VEYRA-"));
  if (veyraCodes.length > 0) {
    const match = await db.query.abandons.findFirst({
      where: and(
        eq(abandons.storeId, storeId),
        eq(abandons.couponCode, veyraCodes[0]!),
      ),
    });
    if (match) {
      return { abandonId: match.id, matchType: "coupon_code", confidence: 0.98 };
    }
  }

  // 4. Email + time window (72h)
  if (email) {
    const match = await db.query.abandons.findFirst({
      where: and(
        eq(abandons.storeId, storeId),
        eq(abandons.email, email.toLowerCase()),
        inArray(abandons.state, [...activeStates]),
      ),
      orderBy: desc(abandons.createdAt),
    });

    if (match) {
      // Check for click engagement (boosts confidence)
      const clickedMessage = await db.query.messages.findFirst({
        where: and(
          eq(messages.abandonId, match.id),
          eq(messages.status, "clicked"),
        ),
      });

      if (clickedMessage?.clickedAt) {
        const hoursSinceClick =
          (Date.now() - clickedMessage.clickedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceClick < 24) {
          return { abandonId: match.id, matchType: "click_purchase", confidence: 0.80 };
        }
      }

      return { abandonId: match.id, matchType: "email_window", confidence: 0.50 };
    }
  }

  return { abandonId: null, matchType: null, confidence: 0 };
}
