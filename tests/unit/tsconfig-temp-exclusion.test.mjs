import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("root TypeScript build hygiene", () => {
  it("excludes disposable E2E build output from the application typecheck", () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), "tsconfig.json"), "utf8"));

    expect(config.exclude).toContain("temp");
  });
});
