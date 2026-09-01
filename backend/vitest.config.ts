import { defineConfig } from "vitest/config";

// Load .env.test — and only .env.test. Node's own env-file loader, the same
// one behind the --env-file flag the npm scripts use. The real .env is never
// read here, so a variable missing from .env.test fails loudly instead of
// quietly falling back to a production value.
process.loadEnvFile(".env.test");

// The suite truncates every table before every test. If DATABASE_URL were ever
// pointed somewhere real, that would delete real data — so refuse to start
// unless it is unmistakably the local container.
if (!process.env.DATABASE_URL?.includes("localhost:5433")) {
  throw new Error(
    "Refusing to run tests: DATABASE_URL is not the local test database.",
  );
}

export default defineConfig({
  test: {
    // Handed to the test workers explicitly rather than relying on them to
    // inherit it.
    env: process.env as Record<string, string>,

    include: ["src/**/*.test.ts"],

    // Runs before every test file: creates the tables once, then empties them
    // between tests.
    setupFiles: ["src/test/setup.ts"],

    // One file at a time. Every test file shares the single Postgres container,
    // and a file truncating tables while another is mid-run would fail at
    // random. Correctness first; the suite is small enough that the lost
    // parallelism costs nothing yet.
    fileParallelism: false,
  },
});
