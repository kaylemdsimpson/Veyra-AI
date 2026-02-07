import * as Sentry from "@sentry/node";
import { env } from "../config/env.js";

let initialized = false;

export function initSentry(): void {
  const dsn = env().SENTRY_DSN;
  if (!dsn) return;

  if (initialized) return;
  initialized = true;

  Sentry.init({
    dsn,
    environment: env().NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

export function captureException(err: unknown): void {
  if (initialized) {
    Sentry.captureException(err);
  }
}

export { Sentry };
