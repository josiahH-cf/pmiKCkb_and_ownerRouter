import { describe, expect, it } from "vitest";

import { shouldDetachDevServer } from "@/tests/e2e/global-setup.mjs";

describe("e2e dev-server process ownership", () => {
  it("keeps Windows Next as a direct child while retaining POSIX process-group cleanup", () => {
    expect(shouldDetachDevServer("win32")).toBe(false);
    expect(shouldDetachDevServer("linux")).toBe(true);
    expect(shouldDetachDevServer("darwin")).toBe(true);
  });
});
