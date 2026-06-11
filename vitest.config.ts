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
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
