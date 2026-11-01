// Runs before `next build`. Creates tables and starter content in the
// Postgres database at DATABASE_URL. Without it, nothing to do: the app
// sets up its own local database on first use.
import { neon } from "@neondatabase/serverless";
import { SCHEMA_SQL, seedStatements } from "../src/lib/schema.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] DATABASE_URL not set, skipping (local database is set up on first request).");
  process.exit(0);
}

const sql = neon(url);
const statements = SCHEMA_SQL.split(/;\s*$/m)
  .map((s) => s.trim())
  .filter(Boolean);
for (const statement of statements) await sql.query(statement);
for (const { text, params } of seedStatements()) await sql.query(text, params);
console.log(`[migrate] schema ready (${statements.length} statements) and starter content seeded.`);
