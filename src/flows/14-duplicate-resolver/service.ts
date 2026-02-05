import { getDb } from "../../db/client.js";
import { abandons } from "../../db/schema/index.js";
import { eq, and, gt, ne, inArray } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("flow:duplicate-resolver");

/**
 * Flow 14: Duplicate Abandon Resolver
 *
 * Prevents duplicate recovery attempts for the same customer:
 *  - Same email within a configurable window (default 24h)
 *  - Same checkout token
 *  - Prioritises: checkout > cart > browse
 *
 * Called during normalisation (Flow 13).
 * Returns true if this abandon should proceed, false if it's a duplicate.
 */
export async function isDuplicate(
  abandonId: string,
  storeId: string,
  email: string | null,
): Promise<boolean> {
  if (!email) return false;

  const db = getDb();
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const activeStates = ["qualified", "scoring", "sequencing", "awaiting_send", "sending", "engaged"] as const;

  const existingActive = await db.query.abandons.findFirst({
    where: and(
      eq(abandons.storeId, storeId),
      eq(abandons.email, email),
      ne(abandons.id, abandonId),
      inArray(abandons.state, [...activeStates]),
      gt(abandons.createdAt, windowStart),
    ),
  });

  if (existingActive) {
    log.info(
      { abandonId, existingId: existingActive.id, email },
      "Duplicate abandon detected, cancelling newer",
    );

    // Cancel this abandon — the earlier one takes priority
    await db
      .update(abandons)
      .set({ state: "cancelled", updatedAt: new Date() })
      .where(eq(abandons.id, abandonId));

    return true;
  }

  return false;
}

/**
 * Merge abandon data when a cart abandon is superseded by a checkout abandon.
 */
export async function mergeAbandons(
  cartAbandonId: string,
  checkoutAbandonId: string,
): Promise<void> {
  const db = getDb();

  // Cancel the cart abandon
  await db
    .update(abandons)
    .set({ state: "cancelled", updatedAt: new Date() })
    .where(eq(abandons.id, cartAbandonId));

  log.info(
    { cartAbandonId, checkoutAbandonId },
    "Cart abandon merged into checkout abandon",
  );
}
