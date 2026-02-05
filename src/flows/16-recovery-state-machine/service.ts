import { getDb } from "../../db/client.js";
import { abandons } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import {
  transition,
  isTerminalState,
  type RecoveryState,
  type RecoveryEvent,
} from "../../lib/state-machine.js";

const log = createLogger("flow:recovery-state-machine");

/**
 * Flow 16: Recovery State Machine
 *
 * Wraps the state machine library with database persistence.
 * Every state transition is:
 *  1. Validated against allowed transitions
 *  2. Persisted to the database
 *  3. Logged for audit trail
 */
export async function transitionAbandonState(
  abandonId: string,
  event: RecoveryEvent,
): Promise<{ success: boolean; newState: RecoveryState | null; error?: string }> {
  const db = getDb();

  const abandon = await db.query.abandons.findFirst({
    where: eq(abandons.id, abandonId),
    columns: { id: true, state: true, storeId: true },
  });

  if (!abandon) {
    return { success: false, newState: null, error: "Abandon not found" };
  }

  const currentState = abandon.state as RecoveryState;

  if (isTerminalState(currentState)) {
    log.warn(
      { abandonId, currentState, event },
      "Cannot transition from terminal state",
    );
    return {
      success: false,
      newState: currentState,
      error: `Already in terminal state: ${currentState}`,
    };
  }

  const result = transition(currentState, event);

  if (!result.success || !result.to) {
    log.warn(
      { abandonId, currentState, event, error: result.error },
      "Invalid state transition",
    );
    return { success: false, newState: currentState, error: result.error };
  }

  await db
    .update(abandons)
    .set({ state: result.to, updatedAt: new Date() })
    .where(eq(abandons.id, abandonId));

  log.info(
    { abandonId, from: currentState, to: result.to, event },
    "State transitioned",
  );

  return { success: true, newState: result.to };
}

/**
 * Bulk expire: transition multiple abandons to expired state.
 */
export async function bulkExpire(abandonIds: string[]): Promise<number> {
  let count = 0;
  for (const id of abandonIds) {
    const result = await transitionAbandonState(id, "EXPIRE");
    if (result.success) count++;
  }
  return count;
}
