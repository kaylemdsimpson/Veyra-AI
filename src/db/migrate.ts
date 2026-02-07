import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadEnv, env } from "../config/env.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("migrate");

export async function runMigrations(): Promise<void> {
  const url = env().DATABASE_URL;
  if (!url) {
    log.warn("DATABASE_URL not set — skipping migrations");
    return;
  }

  log.info("Running database migrations...");

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    log.info("Migrations complete");
  } catch (err) {
    log.error({ err }, "Migration failed");
    throw err;
  } finally {
    await sql.end();
  }
}

// Allow running standalone via: tsx src/db/migrate.ts
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  loadEnv();
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
