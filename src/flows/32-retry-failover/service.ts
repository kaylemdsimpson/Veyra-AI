import { getDb } from "../../db/client.js";
import { messages, providerHealth } from "../../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { enqueue, QUEUES } from "../../lib/queue.js";

const log = createLogger("flow:retry-failover");

/**
 * Flow 32: Retry & Failover Handler
 *
 * Manages message delivery retries with provider failover:
 *
 * Retry policy:
 *  - Max 3 attempts per message
 *  - Exponential backoff: 30s, 2min, 10min
 *  - On 3rd failure: try failover provider
 *
 * Failover map:
 *  - Email: Resend → SendGrid
 *  - SMS: Twilio → Telnyx
 *  - WhatsApp: Twilio only (no failover)
 */

const MAX_ATTEMPTS = 3;
const BACKOFF_DELAYS = [30_000, 120_000, 600_000]; // 30s, 2m, 10m

const FAILOVER_MAP: Record<string, string | null> = {
  resend: "sendgrid",
  sendgrid: null,
  twilio_sms: "telnyx",
  telnyx: null,
  twilio_whatsapp: null,
};

export async function handleSendFailure(
  messageId: string,
  provider: string,
  error: string,
): Promise<void> {
  const db = getDb();

  const msg = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
  });

  if (!msg) return;

  const attempts = (msg.attempts ?? 0) + 1;

  await db
    .update(messages)
    .set({
      attempts,
      lastError: error,
      updatedAt: new Date(),
    })
    .where(eq(messages.id, messageId));

  if (attempts < MAX_ATTEMPTS) {
    // Retry with backoff
    const delay = BACKOFF_DELAYS[attempts - 1] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1]!;
    await enqueue(
      QUEUES.MESSAGE_RETRY,
      {
        messageId,
        abandonId: msg.abandonId,
        storeId: msg.storeId,
        channel: msg.channel,
        provider,
        attempt: attempts,
      },
      { delay, jobId: `retry:${messageId}:${attempts}` },
    );

    log.info(
      { messageId, attempts, delay, provider },
      "Message scheduled for retry",
    );
    return;
  }

  // Max attempts reached — try failover
  const failoverProvider = FAILOVER_MAP[provider];
  if (failoverProvider) {
    log.info(
      { messageId, from: provider, to: failoverProvider },
      "Failing over to alternate provider",
    );

    await db
      .update(messages)
      .set({
        provider: failoverProvider,
        attempts: 0,
        lastError: `Failover from ${provider}: ${error}`,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, messageId));

    await enqueue(QUEUES.MESSAGE_SEND, {
      messageId,
      abandonId: msg.abandonId,
      storeId: msg.storeId,
      channel: msg.channel,
      provider: failoverProvider,
    });

    return;
  }

  // No failover available — mark as permanently failed
  await db
    .update(messages)
    .set({
      status: "failed",
      lastError: `All attempts exhausted: ${error}`,
      updatedAt: new Date(),
    })
    .where(eq(messages.id, messageId));

  log.error(
    { messageId, provider, attempts },
    "Message permanently failed, no failover available",
  );
}
