import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

const maxWorkers = Math.min(8, Math.max(1, availableParallelism() - 1));

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
