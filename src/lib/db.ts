import { neon } from "@neondatabase/serverless";

/** The small slice of a Postgres client the app needs. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

/** Splits a migration file into single statements (the HTTP driver runs one at a time). */
export function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
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

/** Opens the database for scripts: Neon when DATABASE_URL is set, else the local one. */
export async function openDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) return createNeonDb(url);
  return createPgliteDb(process.env.PGLITE_DIR ?? "./.pglite");
}

const globalForDb = globalThis as unknown as { __thedailyDb?: Promise<Db> };

/**
 * The app's database. With DATABASE_URL (production) the schema is
 * managed by `npm run db:migrate` in CI. Without it, a local database is
 * used and the same migration files are applied on first use.
 */
export function getDb(): Promise<Db> {
  globalForDb.__thedailyDb ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (url) return createNeonDb(url);
    const db = await createPgliteDb(process.env.PGLITE_DIR ?? "./.pglite");
    const { runMigrations } = await import("./migrations.ts");
    await runMigrations(db);
    return db;
  })();
  return globalForDb.__thedailyDb;
}
