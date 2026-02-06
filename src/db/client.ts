import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";
import { env } from "../config/env.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = env().DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured — add a Postgres database to your Railway project or set the variable manually");
  }
  _sql = postgres(url, {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  _db = drizzle(_sql, { schema });
  return _db;
}

export async function closeDb() {
  if (_sql) {
    await _sql.end();
    _sql = null;
    _db = null;
  }
}

export type Database = ReturnType<typeof getDb>;
