import { Queue, Worker, Job, QueueEvents, type ConnectionOptions } from "bullmq";
import { createLogger } from "./logger.js";
import { env } from "../config/env.js";

const log = createLogger("queue");

// ─── Queue Names ─────────────────────────────────────────────
export const QUEUES = {
  // Ingestion
  STORE_SYNC: "store-sync",
  CUSTOMER_SYNC: "customer-sync",
  WEBHOOK_PROCESS: "webhook-process",

  // Abandon lifecycle
  ABANDON_DETECT: "abandon-detect",
  ABANDON_NORMALISE: "abandon-normalise",
  ABANDON_SCORE: "abandon-score",
  ABANDON_EXPIRE: "abandon-expire",

  // Recovery
  RECOVERY_SEQUENCE: "recovery-sequence",
  RECOVERY_ATTRIBUTION: "recovery-attribution",

  // Messaging
  MESSAGE_SCHEDULE: "message-schedule",
  MESSAGE_SEND: "message-send",
  MESSAGE_RETRY: "message-retry",

  // Discount
  DISCOUNT_EVALUATE: "discount-evaluate",
  COUPON_CREATE: "coupon-create",
  COUPON_EXPIRE: "coupon-expire",

  // Billing
  LEDGER_WRITE: "ledger-write",
  BILLING_AGGREGATE: "billing-aggregate",
  STRIPE_REPORT: "stripe-report",

  // Ops
  METRICS_BUILD: "metrics-build",
  HEALTH_CHECK: "health-check",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// ─── Connection ──────────────────────────────────────────────
function getConnection(): ConnectionOptions {
  return { url: env().REDIS_URL };
}

// ─── Queue Factory ───────────────────────────────────────────
const queues = new Map<string, Queue>();

export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 5000 },
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    });
    queues.set(name, queue);
  }
  return queue;
}

// ─── Enqueue Helper ──────────────────────────────────────────
export interface EnqueueOptions {
  jobId?: string;       // For idempotency
  delay?: number;       // Delay in ms
  priority?: number;    // Lower = higher priority
  attempts?: number;
  backoff?: { type: "exponential" | "fixed"; delay: number };
}

export async function enqueue<T extends Record<string, unknown>>(
  queueName: QueueName,
  data: T,
  options: EnqueueOptions = {},
): Promise<Job<T>> {
  const queue = getQueue(queueName);
  const job = await queue.add(queueName, data, {
    jobId: options.jobId,
    delay: options.delay,
    priority: options.priority,
    attempts: options.attempts,
    backoff: options.backoff,
  });
  log.debug({ queue: queueName, jobId: job.id }, "Job enqueued");
  return job;
}

// ─── Worker Factory ──────────────────────────────────────────
export interface WorkerConfig<T> {
  queueName: QueueName;
  handler: (job: Job<T>) => Promise<void>;
  concurrency?: number;
  limiter?: { max: number; duration: number };
}

export function createWorker<T>(config: WorkerConfig<T>): Worker<T> {
  const worker = new Worker<T>(
    config.queueName,
    async (job) => {
      const startTime = Date.now();
      log.info({ queue: config.queueName, jobId: job.id }, "Processing job");
      try {
        await config.handler(job);
        log.info(
          { queue: config.queueName, jobId: job.id, durationMs: Date.now() - startTime },
          "Job completed",
        );
      } catch (err) {
        log.error(
          { queue: config.queueName, jobId: job.id, err, attempt: job.attemptsMade },
          "Job failed",
        );
        throw err;
      }
    },
    {
      connection: getConnection(),
      concurrency: config.concurrency ?? 5,
      limiter: config.limiter,
    },
  );

  worker.on("error", (err) => {
    log.error({ queue: config.queueName, err }, "Worker error");
  });

  return worker;
}

// ─── Shutdown ────────────────────────────────────────────────
export async function closeAllQueues() {
  const closePromises = Array.from(queues.values()).map((q) => q.close());
  await Promise.all(closePromises);
  queues.clear();
}
