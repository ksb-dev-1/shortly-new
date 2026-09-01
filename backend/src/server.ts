import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./db/index.js";

/*
 * The entry point that actually listens. Kept apart from app.ts so importing
 * the app — which the tests do — never has starting a server as a side effect.
 */
async function startServer() {
  try {
    await connectDB();

    app.listen(env.PORT, function () {
      console.log(`✅ Server is running on port ${env.PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to DB : ", error);
    process.exit(1);
  }
}

startServer();
