import { Pool } from "pg";

import { env } from "../config/env.js";

export const pool = new Pool({ connectionString: env.DATABASE_URL });

pool.on("error", function (err) {
  console.error("Unexpected error on idle DB client", err);
});

export async function connectDB() {
  const client = await pool.connect();
  try {
    console.log("✅ Database connected successfully");
  } finally {
    client.release();
  }
}
