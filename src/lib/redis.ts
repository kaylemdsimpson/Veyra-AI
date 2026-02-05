import Redis from "ioredis";
import { env } from "../config/env.js";
import { createLogger } from "./logger.js";

const log = createLogger("redis");

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;

  _redis = new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  _redis.on("error", (err) => log.error({ err }, "Redis connection error"));
  _redis.on("connect", () => log.info("Redis connected"));

  return _redis;
}

export function createRedisConnection(): Redis {
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
