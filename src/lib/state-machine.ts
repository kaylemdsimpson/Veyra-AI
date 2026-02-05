import { createLogger } from "./logger.js";

const log = createLogger("state-machine");

/**
 * Recovery State Machine
 *
 * Lightweight typed state machine for the abandon recovery lifecycle.
 * No external dependencies — just a transition table and guards.
 *
 * States:
 *   detected → qualified → scoring → sequencing → awaiting_send → sending
 *                                                                    ↓
 *   recovered ← engaged ←──────────────────────────────────────── sending
 *   expired (from any active state after TTL)
 *   cancelled (from any active state)
 *   holdout (from qualified — no messages sent)
 */

export type RecoveryState =
  | "detected"
  | "qualified"
  | "scoring"
  | "sequencing"
  | "awaiting_send"
  | "sending"
  | "engaged"
  | "recovered"
  | "expired"
  | "cancelled"
  | "holdout";

export type RecoveryEvent =
  | "QUALIFY"
  | "ASSIGN_HOLDOUT"
  | "START_SCORING"
  | "SCORED"
  | "SEQUENCE_BUILT"
  | "SCHEDULE_SEND"
  | "SEND"
  | "ENGAGE"
  | "RECOVER"
  | "EXPIRE"
  | "CANCEL";

// Allowed transitions: from → event → to
const transitions: Record<string, RecoveryState> = {
  "detected:QUALIFY": "qualified",
  "qualified:ASSIGN_HOLDOUT": "holdout",
  "qualified:START_SCORING": "scoring",
  "scoring:SCORED": "sequencing",
  "sequencing:SEQUENCE_BUILT": "awaiting_send",
  "awaiting_send:SCHEDULE_SEND": "sending",
  "awaiting_send:SEND": "sending",
  "sending:ENGAGE": "engaged",
  "sending:RECOVER": "recovered",
  "engaged:RECOVER": "recovered",

  // Terminal from any active state
  "detected:EXPIRE": "expired",
  "qualified:EXPIRE": "expired",
  "scoring:EXPIRE": "expired",
  "sequencing:EXPIRE": "expired",
  "awaiting_send:EXPIRE": "expired",
  "sending:EXPIRE": "expired",
  "engaged:EXPIRE": "expired",

  "detected:CANCEL": "cancelled",
  "qualified:CANCEL": "cancelled",
  "scoring:CANCEL": "cancelled",
  "sequencing:CANCEL": "cancelled",
  "awaiting_send:CANCEL": "cancelled",
  "sending:CANCEL": "cancelled",
  "engaged:CANCEL": "cancelled",
};

const TERMINAL_STATES: ReadonlySet<RecoveryState> = new Set([
  "recovered",
  "expired",
  "cancelled",
  "holdout",
]);

export function isTerminalState(state: RecoveryState): boolean {
  return TERMINAL_STATES.has(state);
}

export interface TransitionResult {
  success: boolean;
  from: RecoveryState;
  to: RecoveryState | null;
  event: RecoveryEvent;
  error?: string;
}

export function transition(
  currentState: RecoveryState,
  event: RecoveryEvent,
): TransitionResult {
  const key = `${currentState}:${event}`;
  const nextState = transitions[key];

  if (!nextState) {
    const err = `Invalid transition: ${currentState} + ${event}`;
    log.warn({ currentState, event }, err);
    return { success: false, from: currentState, to: null, event, error: err };
  }

  log.info({ from: currentState, to: nextState, event }, "State transition");
  return { success: true, from: currentState, to: nextState, event };
}

/**
 * Validate a batch of events against a starting state.
 * Returns the final state or the first invalid transition.
 */
export function validatePath(
  startState: RecoveryState,
  eventSequence: RecoveryEvent[],
): { valid: boolean; finalState: RecoveryState; failedAt?: number } {
  let current = startState;
  for (let i = 0; i < eventSequence.length; i++) {
    const result = transition(current, eventSequence[i]!);
    if (!result.success || !result.to) {
      return { valid: false, finalState: current, failedAt: i };
    }
    current = result.to;
  }
  return { valid: true, finalState: current };
}
