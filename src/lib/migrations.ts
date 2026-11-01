// Versioned migrations. Each file in /migrations runs once, in name
// order, and is recorded in the schema_migrations table.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./db.ts";

export type Migration = { name: string; sql: string };

export const MIGRATIONS_DIR = join(process.cwd(), "migrations");

export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}

/** Applies migrations that have not run yet. Returns the names it applied. */
export async function runMigrations(db: Db, migrations: Migration[] = loadMigrations()): Promise<string[]> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  const done = new Set((await db.query<{ name: string }>(`SELECT name FROM schema_migrations`)).map((r) => r.name));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.name)) continue;
    await db.exec(m.sql);
    await db.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [m.name]);
    applied.push(m.name);
  }
  return applied;
}
