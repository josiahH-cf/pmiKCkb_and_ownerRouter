import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/firestore/**/*.test.ts"],
    // Every test here talks to the real emulator, and tests that race transactions for one
    // document wait out its nondeterministic contention backoff. The 5 s default bounded that
    // backoff rather than the behaviour: two such tests timed out on exact-main CI on 2026-10-07
    // (5,008 and 5,006 ms) while passing at about 3.5 s locally. This bounds only how long a test
    // may take; a genuine hang still fails, and no assertion changes.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
