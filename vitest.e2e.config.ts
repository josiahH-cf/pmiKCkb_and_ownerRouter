import { defineConfig } from "vitest/config";

// HTTP-level end-to-end flow tests. They drive a real `next dev` server (spawned by
// tests/e2e/global-setup.mjs) and share one server plus, optionally, one seeded
// Firestore emulator — so files must run serially.
export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: ["tests/e2e/global-setup.mjs"],
    globals: true,
    hookTimeout: 240_000,
    include: ["tests/e2e/**/*.e2e.test.mjs"],
    testTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
