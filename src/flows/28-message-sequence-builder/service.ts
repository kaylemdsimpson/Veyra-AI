import { nanoid } from "nanoid";
import { getDb } from "../../db/client.js";
import { abandons, messages, stores } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { transitionAbandonState } from "../16-recovery-state-machine/service.js";
import { checkDiscountEligibility } from "../23-discount-eligibility/service.js";
import { detectChannelPreference } from "../21-channel-preference/service.js";
import { enqueue, QUEUES } from "../../lib/queue.js";
import type { StoreSettings } from "../../db/schema/stores.js";

const log = createLogger("flow:message-sequence-builder");

/**
 * Flow 28: Message Sequence Builder
 *
 * Builds the recovery message sequence for an abandon:
 *
 * Default 3-message sequence:
 *  1. Reminder (1h after abandon) — no discount
 *  2. Urgency (12h after abandon) — may include discount
 *  3. Last Chance (24h after abandon) — discount if eligible
 *
 * Adjustments:
 *  - Browse abandons: 2 messages max
 *  - Cart abandons: 2-3 messages
 *  - Checkout abandons: up to 3 messages
 *  - VIP customers: may get faster timing
 */

interface SequenceStep {
  step: number;
  channel: "email" | "sms" | "whatsapp";
  delayMinutes: number;
  includeDiscount: boolean;
  templateKey: string;
}

export async function buildMessageSequence(
  abandonId: string,
  storeId: string,
): Promise<void> {
  const db = getDb();

  const abandon = await db.query.abandons.findFirst({
    where: eq(abandons.id, abandonId),
  });
  if (!abandon) return;

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  });
  const settings = store?.settings as StoreSettings | undefined;
  const maxMessages = settings?.maxMessagesPerRecovery ?? 3;

  // Determine channel preference
  const channels = abandon.customerId
    ? await detectChannelPreference(abandon.customerId, storeId)
    : (abandon.email ? ["email" as const] : []);

  if (channels.length === 0) {
    log.warn({ abandonId }, "No available channels for messaging");
    await transitionAbandonState(abandonId, "CANCEL");
    return;
  }

  const primaryChannel = channels[0]!;

  // Check discount eligibility
  const eligibility = await checkDiscountEligibility(abandonId, storeId);

  // Build sequence based on abandon type
  const sequence: SequenceStep[] = [];
  const abandonType = abandon.type;

  // Message count by type
  const messageCount =
    abandonType === "browse" ? Math.min(2, maxMessages)
    : abandonType === "cart" ? Math.min(3, maxMessages)
    : maxMessages;

  // Timing profiles (minutes after abandon)
  const timingProfiles: Record<string, number[]> = {
    checkout: [60, 720, 1440],     // 1h, 12h, 24h
    cart: [120, 1440, 2880],       // 2h, 24h, 48h
    browse: [240, 1440],           // 4h, 24h
  };

  const timings = timingProfiles[abandonType] ?? timingProfiles.checkout!;

  for (let i = 0; i < messageCount; i++) {
    const step = i + 1;
    const includeDiscount =
      eligibility.eligible && step >= eligibility.sequenceStepForDiscount;

    let templateKey: string;
    if (step === 1) templateKey = `${abandonType}_reminder`;
    else if (step === messageCount) templateKey = `${abandonType}_last_chance`;
    else templateKey = `${abandonType}_urgency`;

    sequence.push({
      step,
      channel: primaryChannel,
      delayMinutes: timings[i] ?? timings[timings.length - 1]!,
      includeDiscount,
      templateKey,
    });
  }

  // Transition state
  await transitionAbandonState(abandonId, "SEQUENCE_BUILT");

  // Create message records
  for (const step of sequence) {
    const trackingId = nanoid(12);
    const scheduledFor = new Date(
      (abandon.abandonedAt?.getTime() ?? Date.now()) + step.delayMinutes * 60 * 1000,
    );

    await db.insert(messages).values({
      storeId,
      abandonId,
      customerId: abandon.customerId,
      channel: step.channel,
      status: "scheduled",
      sequenceStep: step.step,
      templateId: step.templateKey,
      includesDiscount: step.includeDiscount ? 1 : 0,
      trackingId,
      scheduledFor,
    });
  }

  // Schedule send-time optimiser
  await enqueue(QUEUES.MESSAGE_SCHEDULE, { abandonId, storeId });

  log.info(
    { abandonId, storeId, messageCount: sequence.length, primaryChannel },
    "Message sequence built",
  );
}
