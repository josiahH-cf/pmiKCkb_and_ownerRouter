import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const FILES = [
  "lib/vendor/live-setup.ts",
  "lib/vendor/live-setup-runtime.ts",
  "app/api/vendor/setup/route.ts",
  "app/vendor/setup/page.tsx",
  "components/vendor/VendorSetupBridge.tsx",
] as const;

describe("Live Vendor setup import boundary", () => {
  it("has no Test-workflow or synthetic-execution dependency", async () => {
    const source = (await Promise.all(FILES.map((file) => readFile(file, "utf8")))).join(
      "\n",
    );
    expect(source).not.toMatch(
      /@\/lib\/(?:release\/synthetic|maintenance\/test-workflow|vendor\/test-)/,
    );
  });
});
