import { getDb } from "../../db/client.js";
import { customers, messages } from "../../db/schema/index.js";
import { eq, and, desc } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("flow:channel-preference");

type Channel = "email" | "sms" | "whatsapp";

/**
 * Flow 21: Channel Preference Detector
 *
 * Determines the optimal communication channel for a customer based on:
 *  - Historical engagement rates per channel
 *  - Consent status
 *  - Store configuration
 *
 * Returns ranked channel list (best first).
 */
export async function detectChannelPreference(
  customerId: string,
  storeId: string,
): Promise<Channel[]> {
  const db = getDb();

  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, customerId),
  });

  if (!customer) return ["email"];

  // Get historical engagement per channel
  const channelScores: Record<Channel, number> = {
    email: 0,
    sms: 0,
    whatsapp: 0,
  };

  // Base consent scores
  if (customer.emailConsent && customer.email) channelScores.email += 1;
  if (customer.smsConsent && customer.phone) channelScores.sms += 1;
  if (customer.phone) channelScores.whatsapp += 0.5; // WhatsApp doesn't require explicit SMS consent in all markets

  // Historical engagement
  const pastMessages = await db.query.messages.findMany({
    where: and(
      eq(messages.customerId, customerId),
    ),
    columns: { channel: true, status: true },
    orderBy: desc(messages.createdAt),
    limit: 50,
  });

  for (const msg of pastMessages) {
    const ch = msg.channel as Channel;
    if (msg.status === "opened") channelScores[ch] += 2;
    if (msg.status === "clicked") channelScores[ch] += 3;
    if (msg.status === "bounced") channelScores[ch] -= 5;
    if (msg.status === "unsubscribed") channelScores[ch] = -100;
  }

  // Sort by score, filter out negative (unsubscribed/bounced)
  const ranked = (Object.entries(channelScores) as [Channel, number][])
    .filter(([_, score]) => score > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([channel]) => channel);

  // Default to email if nothing else
  if (ranked.length === 0) {
    if (customer.email) return ["email"];
    return [];
  }

  // Persist preferred channel
  await db
    .update(customers)
    .set({ preferredChannel: ranked[0], updatedAt: new Date() })
    .where(eq(customers.id, customerId));

  log.debug({ customerId, ranked, scores: channelScores }, "Channel preference detected");
  return ranked;
}
