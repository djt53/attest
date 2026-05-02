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

  // Split by semicolons and run each statement
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const statement of statements) {
    try {
      await sql.unsafe(statement);
    } catch (err: unknown) {
      const pgErr = err as { code?: string; message?: string };
      // Skip "already exists" errors for idempotency
      if (pgErr.code === "42P07" || pgErr.code === "42710") {
        console.log(`  Skipped (already exists): ${statement.slice(0, 60)}...`);
        continue;
      }
      console.error(`  Failed: ${statement.slice(0, 60)}...`);
      console.error(`  Error: ${pgErr.message}`);
      throw err;
    }
  }

  console.log("Migrations complete.");
  await sql.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
