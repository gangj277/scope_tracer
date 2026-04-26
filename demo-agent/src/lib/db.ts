import "server-only";

import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { Pool, type PoolConfig, type QueryResultRow } from "pg";

let pool: Pool | null = null;
let envLoaded = false;

type PoolConfigWithChannelBinding = PoolConfig & {
  enableChannelBinding?: boolean;
};

function ensureEnv() {
  if (envLoaded) return;
  envLoaded = true;
  if (!process.env.DATABASE_URL) {
    loadDotenv({ path: path.resolve(process.cwd(), "..", ".env"), quiet: true });
  }
}

export function getPool() {
  ensureEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured. Add it to ../.env or the process environment.");
  }
  if (!pool) {
    const dbConfig = normalizeDatabaseUrl(connectionString);
    const poolConfig: PoolConfigWithChannelBinding = {
      connectionString: dbConfig.connectionString,
      ssl: dbConfig.ssl,
      enableChannelBinding: dbConfig.enableChannelBinding,
      max: 6,
      idleTimeoutMillis: 20_000
    };
    pool = new Pool(poolConfig);
  }
  return pool;
}

function normalizeDatabaseUrl(connectionString: string) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode");
  const channelBinding = url.searchParams.get("channel_binding");

  url.searchParams.delete("sslmode");
  url.searchParams.delete("channel_binding");

  return {
    connectionString: url.toString(),
    ssl: sslMode ? { rejectUnauthorized: false } : undefined,
    enableChannelBinding: channelBinding === "require"
  };
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return getPool().query<T>(text, params);
}

export async function dbOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const result = await dbQuery<T>(text, params);
  return result.rows[0] ?? null;
}

export async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}
