import { getDb } from "../../db/client.js";
import { abandons, customers } from "../../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { enqueue, QUEUES } from "../../lib/queue.js";
import { transition } from "../../lib/state-machine.js";
import { eventBus, EVENTS } from "../../lib/event-bus.js";
import { isDuplicate } from "../14-duplicate-resolver/service.js";

const log = createLogger("flow:abandon-normaliser");

/**
 * Flow 13: Abandon Normaliser
 *
 * Normalises abandon data before scoring:
 *  1. Resolve or create customer record
 *  2. Normalize email/phone
 *  3. Validate cart data
 *  4. Transition state: detected → qualified
 *  5. Check for duplicates (delegate to Flow 14)
 *  6. Trigger scoring pipeline
 */
export async function normaliseAbandon(
  abandonId: string,
  storeId: string,
): Promise<void> {
  const db = getDb();

  const abandon = await db.query.abandons.findFirst({
    where: eq(abandons.id, abandonId),
  });

  if (!abandon || abandon.state !== "detected") {
    log.debug({ abandonId, state: abandon?.state }, "Abandon not in detected state");
    return;
  }

  // ─── Normalize email ────────────────────────────────────────
  let email = abandon.email?.trim().toLowerCase() ?? null;
  let phone = abandon.phone?.replace(/\s+/g, "") ?? null;

  // ─── Resolve customer ───────────────────────────────────────
  let customerId = abandon.customerId;
  if (!customerId && email) {
    const customer = await db.query.customers.findFirst({
      where: and(
        eq(customers.storeId, storeId),
        eq(customers.email, email),
      ),
    });

    if (customer) {
      customerId = customer.id;
    } else {
      // Create minimal customer record
      const [newCustomer] = await db
        .insert(customers)
        .values({
          storeId,
          email,
          phone,
          emailConsent: true, // Checkout implies intent; will verify before sending
        })
        .returning({ id: customers.id });
      customerId = newCustomer!.id;
    }
  }

  // ─── Validate cart ──────────────────────────────────────────
  const cartTotal = parseFloat(abandon.cartTotal ?? "0");
  if (cartTotal <= 0) {
    log.info({ abandonId }, "Zero-value cart, expiring");
    await db
      .update(abandons)
      .set({ state: "expired", updatedAt: new Date() })
      .where(eq(abandons.id, abandonId));
    return;
  }

  // ─── Check duplicates (Flow 14) ────────────────────────────
  const duplicate = await isDuplicate(abandonId, storeId, email);
  if (duplicate) {
    log.info({ abandonId }, "Duplicate abandon, cancelled by Flow 14");
    return;
  }

  // ─── Transition to qualified ────────────────────────────────
  const result = transition("detected", "QUALIFY");
  if (!result.success) {
    log.error({ abandonId, error: result.error }, "Invalid state transition");
    return;
  }

  await db
    .update(abandons)
    .set({
      state: "qualified",
      customerId,
      email,
      phone,
      updatedAt: new Date(),
    })
    .where(eq(abandons.id, abandonId));

  await eventBus.emit(EVENTS.ABANDON_QUALIFIED, { storeId, abandonId });

  // Trigger scoring
  await enqueue(QUEUES.ABANDON_SCORE, { abandonId, storeId });

  log.info({ abandonId, storeId, customerId }, "Abandon normalised and qualified");
}
