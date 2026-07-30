import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Live Vendor lifecycle adapter import boundary", () => {
  it("has no Test or synthetic dependency", async () => {
    const source = await readFile("lib/vendor/live-lifecycle-adapters.ts", "utf8");
    expect(source).not.toMatch(
      /@\/lib\/(?:release\/synthetic|maintenance\/test-workflow|vendor\/test-)/,
    );
  });
});
