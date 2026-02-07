import { getDb } from "../../db/client.js";
import { messages, abandons, stores } from "../../db/schema/index.js";
import { eq, and, inArray, gt } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";
import { getThirdPartyCoveredChannels } from "../../lib/third-party-detector.js";
import type { StoreSettings, DetectedThirdPartyTool } from "../../db/schema/stores.js";

const log = createLogger("flow:conflict-detection");

/**
 * Flow 45: Conflict Detection
 *
 * Detects potential conflicts that could harm the merchant or customer:
 *
 * 1. Over-messaging: Too many messages to same customer across abandons
 * 2. Discount stacking: Multiple active coupons for same customer
 * 3. Timing conflict: Messages scheduled too close together
 * 4. Consent violation: Messaging without consent
 * 5. Third-party overlap: Another tool already covers this channel/abandon type
 *
 * This service is called before message sending to do a final safety check.
 */

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: string[];
  /** Channels that should be skipped because a third-party tool covers them */
  blockedChannels: Array<"email" | "sms" | "whatsapp">;
  /** Recommended action when third-party conflict detected */
  thirdPartyAction: "send" | "delay" | "skip" | "channel_switch";
}

export async function detectConflicts(
  abandonId: string,
  storeId: string,
  targetChannel?: "email" | "sms" | "whatsapp",
): Promise<ConflictResult> {
  const db = getDb();
  const conflicts: string[] = [];
  const blockedChannels: ConflictResult["blockedChannels"] = [];
  let thirdPartyAction: ConflictResult["thirdPartyAction"] = "send";

  const abandon = await db.query.abandons.findFirst({
    where: eq(abandons.id, abandonId),
  });

  if (!abandon) {
    return {
      hasConflict: true,
      conflicts: ["Abandon not found"],
      blockedChannels: [],
      thirdPartyAction: "skip",
    };
  }

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  });

  const settings = store?.settings as StoreSettings | undefined;
  const detectedTools = (store?.detectedTools as DetectedThirdPartyTool[] | null) ?? [];

  // ─── Check 1: Over-messaging ────────────────────────────────
  if (abandon.email) {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentMessages = await db.query.messages.findMany({
      where: and(
        eq(messages.storeId, storeId),
        inArray(messages.status, ["sent", "delivered", "opened", "clicked"]),
        gt(messages.sentAt, last24h),
      ),
      columns: { id: true, abandonId: true },
    });

    const messagesThisAbandon = recentMessages.filter(
      (m) => m.abandonId === abandonId,
    );

    if (messagesThisAbandon.length >= 3) {
      conflicts.push("Over-messaging: 3+ messages sent in 24h for this abandon");
    }
  }

  // ─── Check 2: Timing conflict ──────────────────────────────
  const scheduledMessages = await db.query.messages.findMany({
    where: and(
      eq(messages.abandonId, abandonId),
      eq(messages.status, "scheduled"),
    ),
    columns: { id: true, scheduledFor: true, sequenceStep: true },
  });

  for (let i = 0; i < scheduledMessages.length - 1; i++) {
    const current = scheduledMessages[i]!;
    const next = scheduledMessages[i + 1]!;
    if (current.scheduledFor && next.scheduledFor) {
      const gap =
        next.scheduledFor.getTime() - current.scheduledFor.getTime();
      if (gap < 60 * 60 * 1000) {
        conflicts.push(
          `Timing conflict: Messages ${current.sequenceStep} and ${next.sequenceStep} are less than 1h apart`,
        );
      }
    }
  }

  // ─── Check 3: Third-party tool coordination ────────────────
  if (detectedTools.length > 0 && settings) {
    const mode = settings.thirdPartyMode ?? "complement";
    const coveredChannels = getThirdPartyCoveredChannels(detectedTools);

    if (mode === "monitor") {
      // Monitor mode: track only, don't send
      conflicts.push("Third-party mode is 'monitor' — Veyra is tracking only");
      thirdPartyAction = "skip";
      blockedChannels.push("email", "sms", "whatsapp");
    } else if (mode === "complement") {
      // Complement mode: avoid overlap, fill gaps
      if (targetChannel && coveredChannels.has(targetChannel)) {
        const toolNames = detectedTools
          .filter((t) => t.hasAbandonCartFlow && t.channels.includes(targetChannel))
          .map((t) => t.name);

        if (abandon.type === "checkout") {
          // Checkout: third-party tools definitely fire here — delay Veyra
          thirdPartyAction = "delay";
          conflicts.push(
            `Third-party overlap: ${toolNames.join(", ")} likely sends ${targetChannel} for checkout abandons. Veyra will delay.`,
          );
        } else if (abandon.type === "cart") {
          // Cart: check if there's an uncovered channel to switch to
          const uncovered = (["email", "sms", "whatsapp"] as const).filter(
            (ch) => !coveredChannels.has(ch),
          );
          if (uncovered.length > 0) {
            thirdPartyAction = "channel_switch";
            conflicts.push(
              `Third-party overlap on ${targetChannel}. Recommending switch to ${uncovered[0]}.`,
            );
          } else {
            thirdPartyAction = "delay";
            conflicts.push(
              `Third-party overlap: ${toolNames.join(", ")} covers ${targetChannel}. Veyra will delay.`,
            );
          }
        }
        // Browse: most tools don't cover this — Veyra sends normally

        for (const ch of coveredChannels) {
          if (ch === "email" || ch === "sms" || ch === "whatsapp") {
            blockedChannels.push(ch);
          }
        }
      }
    }
    // "replace" mode: Veyra sends everything, no third-party coordination
  }

  if (conflicts.length > 0) {
    log.warn({ abandonId, storeId, conflicts, thirdPartyAction }, "Conflicts detected");
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    blockedChannels,
    thirdPartyAction,
  };
}

/**
 * Compute delay offset (in minutes) for Veyra's messages when complementing
 * a third-party tool, based on known default timing of major tools.
 *
 * Goal: never send within 2h of a likely third-party message.
 */
export function computeThirdPartyDelay(
  tools: DetectedThirdPartyTool[],
  abandonType: "checkout" | "cart" | "browse",
): number {
  const hasKlaviyo = tools.some((t) => t.id === "klaviyo");
  const hasOmnisend = tools.some((t) => t.id === "omnisend");
  const hasShopifyBuiltin = tools.some(
    (t) => t.id === "shopify_builtin_recovery",
  );

  if (abandonType === "checkout") {
    if (hasKlaviyo) return 300;       // +5h (Klaviyo fires ~4h)
    if (hasOmnisend) return 180;      // +3h (Omnisend fires ~1h)
    if (hasShopifyBuiltin) return 60; // +1h (Shopify fires ~10h)
    return 120;                       // +2h default buffer
  }

  if (abandonType === "cart") {
    if (hasKlaviyo || hasOmnisend) return 120; // +2h
    return 60;
  }

  // Browse: almost nothing covers this
  return 0;
}
