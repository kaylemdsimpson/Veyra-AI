import pino from "pino";

export function createLogger(name: string) {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? "info",
    ...(process.env.NODE_ENV === "development" && {
      transport: { target: "pino-pretty", options: { colorize: true } },
    }),
    formatters: {
      bindings: (bindings) => ({
        pid: bindings.pid,
        host: bindings.hostname,
        service: name,
      }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export const logger = createLogger("veyra");
