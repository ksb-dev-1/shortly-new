import { Pool } from "pg";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export const pool = new Pool({ connectionString: env.DATABASE_URL });

pool.on("error", function (err) {
  logger.error(err, "Unexpected error on idle DB client");
});

export async function connectDB() {
  const client = await pool.connect();
  try {
    logger.info("Database connected successfully");
  } finally {
    client.release();
  }
}
