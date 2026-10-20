import { defineConfig } from "vitest/config";

// HTTP-level end-to-end flow tests. They drive a real `next dev` server (spawned by
// tests/e2e/global-setup.mjs). The inventory runner warms the original routes once,
// then gives each file a fresh test server with one shared emulator; files run serially.
export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: ["tests/e2e/global-setup.mjs"],
    globals: true,
    hookTimeout: 240_000,
    teardownTimeout: 30_000,
    include: ["tests/e2e/**/*.e2e.test.mjs"],
    testTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
