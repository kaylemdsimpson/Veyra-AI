import { createLogger } from "../../lib/logger.js";

const log = createLogger("flow:discount-timing");

/**
 * Flow 25: Discount Timing Controller
 *
 * Determines WHEN in the recovery sequence to introduce the discount.
 *
 * Core principle: Try to recover without a discount first.
 *
 * Timing strategy:
 *  - Message 1: NEVER include a discount. Pure reminder.
 *  - Message 2: Include discount ONLY if:
 *     - Message 1 was opened but not clicked
 *     - Discount sensitivity > 0.6
 *  - Message 3 (final): Include discount if eligible.
 *     - This is the "last chance" message.
 *
 * Returns the message step number where discount should be introduced.
 */

export interface TimingInput {
  totalMessages: number;
  discountSensitivity: number;
  recoveryScore: number;
  message1Opened: boolean;
  message1Clicked: boolean;
}

export interface TimingResult {
  introduceAtStep: number;
  reason: string;
}

export function calculateDiscountTiming(input: TimingInput): TimingResult {
  // Never on first message
  if (input.totalMessages === 1) {
    return {
      introduceAtStep: 0, // 0 = never
      reason: "Single message sequence, no discount",
    };
  }

  // High recovery probability → push discount to final message
  if (input.recoveryScore > 0.7) {
    return {
      introduceAtStep: input.totalMessages,
      reason: "High recovery probability, discount as last resort",
    };
  }

  // If message 1 was opened but not clicked → customer is interested but hesitant
  if (input.message1Opened && !input.message1Clicked && input.discountSensitivity > 0.6) {
    return {
      introduceAtStep: 2,
      reason: "Opened but not clicked, moderate-high sensitivity",
    };
  }

  // Default: introduce on the last message
  return {
    introduceAtStep: input.totalMessages,
    reason: "Default: discount on final message",
  };
}
