import { defineConfig } from "vitest/config";
import { workersForCheckout } from "./scripts/run-unit-tests.mjs";

// One worker per logical CPU but one, at most eight and bounded by memory; two when files are
// read straight from a WSL Windows mount. `npm test` passes the same count explicitly.
const maxWorkers = workersForCheckout({ cwd: process.cwd() });

export default defineConfig({
  test: {
    exclude: [
      "**/.next/**",
      "**/dist/**",
      "**/node_modules/**",
      "tests/firestore/**/*.test.ts",
      "tests/e2e/**",
    ],
    environment: "node",
    setupFiles: ["tests/setup/unit-firestore-isolation.ts"],
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "tests/**/*.test.mjs"],
    // Threads retain Vitest's per-file isolation while avoiding hundreds of process starts. The
    // WSL runner also moves reads off /mnt/c; native and CI runs use this same bounded pool.
    pool: "threads",
    maxWorkers,
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
