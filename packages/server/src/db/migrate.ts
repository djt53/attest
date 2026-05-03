/**
 * Database migration runner.
 * Reads schema.sql and executes it against the configured database.
 *
 * Usage: npx tsx packages/server/src/db/migrate.ts
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const sql = postgres(databaseUrl);

  console.log("Running migrations...");

  const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");

  // Run the entire schema as one batch
  await sql.unsafe(schema);

  console.log("Migrations complete.");
  await sql.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
