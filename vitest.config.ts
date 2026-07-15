import { defineConfig } from "vitest/config";

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
    // Vitest's CPU-count default can spawn 31 forks on developer hosts and starve
    // jsdom/user-event tests. Bound the suite without relaxing real test timeouts.
    maxWorkers: 8,
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
