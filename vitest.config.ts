import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/.next/**",
      "**/dist/**",
      "**/node_modules/**",
      "tests/firestore/**/*.test.ts",
    ],
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.mjs"],
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
