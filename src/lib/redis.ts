import IORedis from "ioredis";
import { env } from "../config/env.js";
import { createLogger } from "./logger.js";

const Redis = IORedis.default ?? IORedis;

const log = createLogger("redis");

let _redis: InstanceType<typeof Redis> | null = null;

export function getRedis(): InstanceType<typeof Redis> {
  if (_redis) return _redis;

  _redis = new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times: number) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  _redis.on("error", (err: Error) => log.error({ err }, "Redis connection error"));
  _redis.on("connect", () => log.info("Redis connected"));

  return _redis;
}

export function createRedisConnection(): InstanceType<typeof Redis> {
  return new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export async function closeRedis() {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
