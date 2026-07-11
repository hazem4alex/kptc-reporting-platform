import "dotenv/config";
import { initDb, pool } from "../src/db.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

try {
  await initDb();
  console.log("Seed data is ready");
} finally {
  await pool.end();
}
