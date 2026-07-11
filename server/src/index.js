import "dotenv/config";
import cors from "cors";
import express from "express";
import { initDb, pool } from "./db.js";
import { errorHandler, notFoundHandler } from "./middleware.js";
import { router } from "./routes.js";

export const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(router);
app.use(notFoundHandler);
app.use(errorHandler);

export async function start() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  await initDb();

  app.listen(port, () => {
    console.log(`KPTC Reporting API listening on port ${port}`);
  });
}

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await pool.end();
  process.exit(0);
});

if (process.env.NODE_ENV !== "test") {
  start().catch((err) => {
    console.error("Failed to start server", err);
    process.exit(1);
  });
}
