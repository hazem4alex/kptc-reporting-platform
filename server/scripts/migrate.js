import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
    if (applied.rowCount) continue;
    const sql = await fs.readFile(path.join(directory, file), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    console.log(`Applied ${file}`);
  }
} finally {
  await pool.end();
}
