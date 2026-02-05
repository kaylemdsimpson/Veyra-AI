import { createLogger } from "./logger.js";

const log = createLogger("event-bus");

type EventHandler = (payload: Record<string, unknown>) => Promise<void>;

/**
 * In-process event bus for decoupling modules.
 * For cross-process events, use BullMQ queues.
 * This bus is for synchronous fan-out within a single process.
 */
class EventBus {
  private handlers = new Map<string, EventHandler[]>();

  on(event: string, handler: EventHandler): void {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler);
    this.handlers.set(event, existing);
    log.debug({ event, handlerCount: existing.length }, "Handler registered");
  }

  off(event: string, handler: EventHandler): void {
    const existing = this.handlers.get(event) ?? [];
    this.handlers.set(event, existing.filter((h) => h !== handler));
  }

  async emit(event: string, payload: Record<string, unknown>): Promise<void> {
    const handlers = this.handlers.get(event) ?? [];
    log.debug({ event, handlerCount: handlers.length }, "Emitting event");

    const results = await Promise.allSettled(
      handlers.map((handler) => handler(payload)),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        log.error({ event, err: result.reason }, "Event handler failed");
      }
    }
  }
}

// ─── Event Types ──────────────────────────────────────────────
export const EVENTS = {
  // Store lifecycle
  STORE_INSTALLED: "store.installed",
  STORE_UNINSTALLED: "store.uninstalled",
  STORE_SYNCED: "store.synced",

  // Abandon lifecycle
  CHECKOUT_CREATED: "checkout.created",
  CHECKOUT_UPDATED: "checkout.updated",
  ABANDON_DETECTED: "abandon.detected",
  ABANDON_QUALIFIED: "abandon.qualified",
  ABANDON_SCORED: "abandon.scored",
  ABANDON_EXPIRED: "abandon.expired",
  ABANDON_CANCELLED: "abandon.cancelled",

  // Recovery
  RECOVERY_STARTED: "recovery.started",
  RECOVERY_SUCCEEDED: "recovery.succeeded",
  RECOVERY_FAILED: "recovery.failed",

  // Messages
  MESSAGE_SCHEDULED: "message.scheduled",
  MESSAGE_SENT: "message.sent",
  MESSAGE_DELIVERED: "message.delivered",
  MESSAGE_OPENED: "message.opened",
  MESSAGE_CLICKED: "message.clicked",
  MESSAGE_BOUNCED: "message.bounced",
  MESSAGE_FAILED: "message.failed",

  // Orders
  ORDER_CREATED: "order.created",
  ORDER_ATTRIBUTED: "order.attributed",

  // Discount
  DISCOUNT_OFFERED: "discount.offered",
  COUPON_CREATED: "coupon.created",
  COUPON_USED: "coupon.used",
  COUPON_EXPIRED: "coupon.expired",

  // Health
  PROVIDER_DEGRADED: "provider.degraded",
  PROVIDER_RECOVERED: "provider.recovered",
  AUTO_PAUSE_TRIGGERED: "autopause.triggered",
} as const;

export type EventType = (typeof EVENTS)[keyof typeof EVENTS];

export const eventBus = new EventBus();
