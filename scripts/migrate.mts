// Applies pending files in /migrations to the database.
//   DATABASE_URL=postgres://… npm run db:migrate   (Neon, run by CI on main)
//   npm run db:migrate                             (local ./.pglite database)
import { openDb } from "../src/lib/db.ts";
import { loadMigrations, runMigrations } from "../src/lib/migrations.ts";

const target = process.env.DATABASE_URL ? "DATABASE_URL" : `local ${process.env.PGLITE_DIR ?? "./.pglite"}`;
const migrations = loadMigrations();
const db = await openDb();
const applied = await runMigrations(db, migrations);

if (applied.length) {
  for (const name of applied) console.log(`[migrate] applied ${name}`);
} else {
  console.log(`[migrate] ${target} is up to date (${migrations.length} migrations).`);
}
process.exit(0);
