import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDB, pool } from "./db/index.js";

// How long a shutdown is given to finish in-flight requests and close the
// pool before the process is killed outright.
const SHUTDOWN_TIMEOUT_MS = 10_000;

/*
 * The entry point that actually listens. Kept apart from app.ts so importing
 * the app — which the tests do — never has starting a server as a side effect.
 */
async function startServer() {
  try {
    await connectDB();

    const server = app.listen(env.PORT, function () {
      logger.info(`Server is running on port ${env.PORT}`);
    });

    /*
     * Render sends SIGTERM before killing an instance -- on every deploy and
     * when scaling down. SIGINT is the same path for Ctrl+C during local dev.
     * Without this, in-flight requests get cut off mid-response and the DB
     * pool's sockets are left for the OS to close instead of released
     * cleanly.
     */
    function shutdown(signal: NodeJS.Signals) {
      logger.info(`${signal} received, shutting down`);

      // Stops the server accepting new connections; requests already in
      // flight are allowed to finish. The callback fires once the last one
      // has and the server is fully closed.
      server.close(function () {
        pool
          .end()
          .then(function () {
            logger.info("Shutdown complete");
            process.exit(0);
          })
          .catch(function (error) {
            logger.error(error, "Error closing DB pool during shutdown");
            process.exit(1);
          });
      });

      // A request that never finishes would otherwise hold the process open
      // forever -- force it after a grace period instead.
      setTimeout(function () {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS).unref();
    }

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (error) {
    logger.error(error, "Failed to connect to DB");
    process.exit(1);
  }
}

startServer();
