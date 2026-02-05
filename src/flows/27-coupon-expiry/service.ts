import { getDb } from "../../db/client.js";
import { coupons, stores } from "../../db/schema/index.js";
import { eq, and, lt } from "drizzle-orm";
import { shopifyRequest } from "../../lib/shopify.js";
import { decrypt } from "../../lib/crypto.js";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("flow:coupon-expiry-manager");

/**
 * Flow 27: Coupon Expiry Manager
 *
 * Scheduled job that:
 *  1. Finds expired coupons
 *  2. Deletes them from Shopify (cleanup)
 *  3. Updates local status
 *
 * Prevents coupon accumulation in the merchant's Shopify admin.
 */
export async function processExpiredCoupons(): Promise<number> {
  const db = getDb();
  const now = new Date();

  const expiredCoupons = await db.query.coupons.findMany({
    where: and(
      eq(coupons.status, "active"),
      lt(coupons.expiresAt, now),
    ),
  });

  let processed = 0;

  for (const coupon of expiredCoupons) {
    // Delete from Shopify if we have the price rule ID
    if (coupon.shopifyPriceRuleId) {
      try {
        const store = await db.query.stores.findFirst({
          where: eq(stores.id, coupon.storeId),
        });

        if (store && store.status === "active" && store.shopifyAccessToken !== "REDACTED") {
          const accessToken = decrypt(store.shopifyAccessToken);
          await shopifyRequest({
            shop: store.shopifyDomain,
            accessToken,
            endpoint: `price_rules/${coupon.shopifyPriceRuleId}.json`,
            method: "DELETE",
          });
        }
      } catch (err) {
        // Non-critical: Shopify may have already cleaned it up
        log.warn(
          { couponId: coupon.id, err },
          "Failed to delete expired coupon from Shopify",
        );
      }
    }

    await db
      .update(coupons)
      .set({ status: "expired" })
      .where(eq(coupons.id, coupon.id));

    processed++;
  }

  if (processed > 0) {
    log.info({ count: processed }, "Expired coupons cleaned up");
  }

  return processed;
}
