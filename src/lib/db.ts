import { neon } from "@neondatabase/serverless";
import { SCHEMA_SQL, seedStatements } from "./schema.ts";

/** The small slice of a Postgres client the app needs. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

/** Splits a schema file into single statements (HTTP drivers run one at a time). */
export function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function createNeonDb(url: string): Db {
  const sql = neon(url);
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[],
    exec: async (script) => {
      for (const statement of splitStatements(script)) await sql.query(statement);
    },
  };
}

/** In-process Postgres. Used for local dev and tests when DATABASE_URL is unset. */
export async function createPgliteDb(dataDir = "memory://"): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
    exec: async (script) => {
      await pg.exec(script);
    },
  };
}

/** Creates tables and inserts starter content. Safe to run on every deploy. */
export async function migrate(db: Db): Promise<void> {
  await db.exec(SCHEMA_SQL);
  for (const { text, params } of seedStatements()) await db.query(text, params);
}

const globalForDb = globalThis as unknown as { __thedailyDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__thedailyDb ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (url) return createNeonDb(url);
    const dir = process.env.PGLITE_DIR ?? (process.env.VERCEL ? "memory://" : "./.pglite");
    if (process.env.VERCEL) {
      console.warn("DATABASE_URL is not set: using a temporary in-memory database. Data will not persist.");
    }
    const db = await createPgliteDb(dir);
    await migrate(db);
    return db;
  })();
  return globalForDb.__thedailyDb;
}
