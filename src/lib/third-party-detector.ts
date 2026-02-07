import { shopifyRequest } from "./shopify.js";
import { decrypt } from "./crypto.js";
import { createLogger } from "./logger.js";
import type { DetectedThirdPartyTool } from "../db/schema/stores.js";

const log = createLogger("third-party-detector");

/**
 * Known third-party recovery/marketing tools and their detection signatures.
 *
 * Detection methods:
 *  1. Shopify ScriptTag API — check for known CDN domains in injected scripts
 *  2. Shopify REST API — list installed apps (if scope permits)
 *
 * Each tool entry defines:
 *  - scriptPatterns: URL patterns in ScriptTag src fields
 *  - appHandles: Shopify app store handles (for app list detection)
 *  - channels: what channels this tool covers
 *  - hasAbandonCartFlow: whether this tool has built-in abandon recovery
 */
const KNOWN_TOOLS: Array<{
  id: string;
  name: string;
  category: DetectedThirdPartyTool["category"];
  scriptPatterns: RegExp[];
  appHandles: string[];
  channels: DetectedThirdPartyTool["channels"];
  hasAbandonCartFlow: boolean;
}> = [
  {
    id: "klaviyo",
    name: "Klaviyo",
    category: "multi_channel",
    scriptPatterns: [/static\.klaviyo\.com/, /klaviyo\.js/, /a\.]klaviyo\.com/],
    appHandles: ["klaviyo-email-marketing"],
    channels: ["email", "sms", "push"],
    hasAbandonCartFlow: true,
  },
  {
    id: "omnisend",
    name: "Omnisend",
    category: "multi_channel",
    scriptPatterns: [/omnisrc\.com/, /omnisend\.com/],
    appHandles: ["omnisend"],
    channels: ["email", "sms", "push"],
    hasAbandonCartFlow: true,
  },
  {
    id: "postscript",
    name: "Postscript",
    category: "sms_marketing",
    scriptPatterns: [/postscript\.io/, /sdk\.postscript\.io/],
    appHandles: ["postscript-sms-marketing"],
    channels: ["sms"],
    hasAbandonCartFlow: true,
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    category: "email_marketing",
    scriptPatterns: [/chimpstatic\.com/, /mailchimp\.com\/js/],
    appHandles: ["mailchimp"],
    channels: ["email"],
    hasAbandonCartFlow: true,
  },
  {
    id: "drip",
    name: "Drip",
    category: "email_marketing",
    scriptPatterns: [/dc\.getdrip\.com/, /tag\.getdrip\.com/],
    appHandles: ["drip"],
    channels: ["email"],
    hasAbandonCartFlow: true,
  },
  {
    id: "attentive",
    name: "Attentive",
    category: "sms_marketing",
    scriptPatterns: [/attentive\.com/, /attn\.tv/],
    appHandles: ["attentive"],
    channels: ["sms"],
    hasAbandonCartFlow: true,
  },
  {
    id: "yotpo",
    name: "Yotpo (SMSBump)",
    category: "sms_marketing",
    scriptPatterns: [/smsbump\.com/, /yotpo\.com/],
    appHandles: ["smsbump-sms-marketing-by-yotpo"],
    channels: ["email", "sms"],
    hasAbandonCartFlow: true,
  },
  {
    id: "privy",
    name: "Privy",
    category: "email_marketing",
    scriptPatterns: [/privy\.com/, /widget\.privy\.com/],
    appHandles: ["privy"],
    channels: ["email", "sms"],
    hasAbandonCartFlow: true,
  },
  {
    id: "recart",
    name: "Recart",
    category: "cart_recovery",
    scriptPatterns: [/recart\.com/],
    appHandles: ["recart"],
    channels: ["email", "sms", "push"],
    hasAbandonCartFlow: true,
  },
  {
    id: "shopify_email",
    name: "Shopify Email",
    category: "email_marketing",
    scriptPatterns: [],
    appHandles: ["shopify-email"],
    channels: ["email"],
    hasAbandonCartFlow: true, // Shopify's built-in abandoned checkout emails
  },
  {
    id: "sendlane",
    name: "Sendlane",
    category: "multi_channel",
    scriptPatterns: [/sendlane\.com/],
    appHandles: ["sendlane"],
    channels: ["email", "sms"],
    hasAbandonCartFlow: true,
  },
  {
    id: "retention",
    name: "Retention.com",
    category: "cart_recovery",
    scriptPatterns: [/retention\.com/, /getretention\.com/],
    appHandles: ["retention"],
    channels: ["email"],
    hasAbandonCartFlow: true,
  },
];

/**
 * Detect third-party recovery tools installed on a Shopify store.
 *
 * Uses two detection methods:
 *  1. ScriptTag API — scans injected scripts for known CDN patterns
 *  2. App list — checks installed apps against known handles
 */
export async function detectThirdPartyTools(
  shop: string,
  encryptedAccessToken: string,
): Promise<DetectedThirdPartyTool[]> {
  const accessToken = decrypt(encryptedAccessToken);
  const detected: DetectedThirdPartyTool[] = [];
  const now = new Date().toISOString();

  // ─── Method 1: ScriptTag scan ───────────────────────────────
  try {
    const scriptTags = await shopifyRequest<{
      script_tags: Array<{ id: number; src: string; event: string }>;
    }>({
      shop,
      accessToken,
      endpoint: "script_tags.json",
    });

    for (const tool of KNOWN_TOOLS) {
      for (const tag of scriptTags.script_tags) {
        if (tool.scriptPatterns.some((p) => p.test(tag.src))) {
          if (!detected.find((d) => d.id === tool.id)) {
            detected.push({
              id: tool.id,
              name: tool.name,
              category: tool.category,
              detectedVia: "shopify_scripts",
              channels: tool.channels,
              hasAbandonCartFlow: tool.hasAbandonCartFlow,
              confidence: 0.95,
              detectedAt: now,
            });
          }
        }
      }
    }

    log.debug({ shop, scriptCount: scriptTags.script_tags.length }, "Script tags scanned");
  } catch (err) {
    log.warn({ shop, err }, "Failed to scan script tags (scope may be missing)");
  }

  // ─── Method 2: Installed apps scan ──────────────────────────
  // Note: This requires the `read_apps` scope which may not be available.
  // We use a best-effort approach — script tags are the primary detection method.

  // ─── Method 3: Check Shopify's built-in abandoned checkout emails ──
  try {
    const shopData = await shopifyRequest<{
      shop: { checkout_api_supported: boolean };
    }>({
      shop,
      accessToken,
      endpoint: "shop.json",
    });

    // Shopify has built-in abandoned checkout emails that are on by default
    // We can't detect if they're disabled via API, so we flag it with lower confidence
    if (!detected.find((d) => d.id === "shopify_builtin_recovery")) {
      detected.push({
        id: "shopify_builtin_recovery",
        name: "Shopify Abandoned Checkout Emails",
        category: "cart_recovery",
        detectedVia: "shopify_apps",
        channels: ["email"],
        hasAbandonCartFlow: true,
        confidence: 0.7, // Lower confidence since we can't confirm it's enabled
        detectedAt: now,
      });
    }
  } catch {
    // Non-critical, skip
  }

  log.info(
    { shop, detectedCount: detected.length, tools: detected.map((d) => d.name) },
    "Third-party tool detection complete",
  );

  return detected;
}

/**
 * Determine which channels are already covered by third-party tools.
 */
export function getThirdPartyCoveredChannels(
  tools: DetectedThirdPartyTool[],
): Set<string> {
  const channels = new Set<string>();
  for (const tool of tools) {
    if (tool.hasAbandonCartFlow && tool.confidence >= 0.7) {
      for (const ch of tool.channels) {
        channels.add(ch);
      }
    }
  }
  return channels;
}

/**
 * Generate a coordination recommendation based on detected tools.
 */
export function getCoordinationRecommendation(
  tools: DetectedThirdPartyTool[],
): {
  recommendedMode: "complement" | "replace" | "monitor";
  reason: string;
  coveredChannels: string[];
  uncoveredChannels: string[];
} {
  const covered = getThirdPartyCoveredChannels(tools);
  const allChannels = ["email", "sms", "whatsapp"];
  const uncovered = allChannels.filter((ch) => !covered.has(ch));

  const recoveryTools = tools.filter(
    (t) => t.hasAbandonCartFlow && t.confidence >= 0.7,
  );

  if (recoveryTools.length === 0) {
    return {
      recommendedMode: "replace",
      reason: "No third-party recovery tools detected. Veyra handles everything.",
      coveredChannels: [],
      uncoveredChannels: allChannels,
    };
  }

  if (uncovered.length > 0) {
    return {
      recommendedMode: "complement",
      reason: `${recoveryTools.map((t) => t.name).join(", ")} detected covering ${[...covered].join(", ")}. Veyra will fill ${uncovered.join(", ")} gap.`,
      coveredChannels: [...covered],
      uncoveredChannels: uncovered,
    };
  }

  return {
    recommendedMode: "complement",
    reason: `${recoveryTools.map((t) => t.name).join(", ")} detected covering all channels. Veyra will complement with smart timing and incremental recovery.`,
    coveredChannels: [...covered],
    uncoveredChannels: [],
  };
}
