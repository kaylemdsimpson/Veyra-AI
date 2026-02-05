import { getDb } from "../../db/client.js";
import { abandons, stores } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { transitionAbandonState } from "../16-recovery-state-machine/service.js";
import { env } from "../../config/env.js";
import type { StoreSettings } from "../../db/schema/stores.js";

const log = createLogger("flow:holdout-group");

/**
 * Flow 30: Holdout Group Assigner
 *
 * Assigns a percentage of abandons to a holdout group (no messages sent).
 * This is critical for measuring the TRUE incremental impact of Veyra.
 *
 * Without holdout groups, it's impossible to know if the customer would
 * have returned on their own. This data is used in the dashboard to
 * show the merchant: "X% of your recoveries were directly caused by Veyra."
 *
 * Default holdout: 10% (configurable per store).
 * Assignment is deterministic based on abandon ID hash to ensure consistency.
 */
export async function assignHoldoutGroup(
  abandonId: string,
  storeId: string,
): Promise<boolean> {
  if (!env().ENABLE_HOLDOUT_GROUPS) return false;

  const db = getDb();

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
    columns: { settings: true },
  });

  const settings = store?.settings as StoreSettings | undefined;
  const holdoutPercent = settings?.defaultHoldoutPercent ?? 10;

  // Deterministic assignment using abandon ID hash
  const hash = simpleHash(abandonId);
  const bucket = hash % 100;
  const isHoldout = bucket < holdoutPercent;

  if (isHoldout) {
    await transitionAbandonState(abandonId, "ASSIGN_HOLDOUT");
    log.info({ abandonId, storeId, bucket, holdoutPercent }, "Assigned to holdout group");
    return true;
  }

  return false;
}

/**
 * Simple deterministic hash for consistent group assignment.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
