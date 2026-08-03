import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("retired sample tenant-email button", () => {
  it("has no Production component or caller while the Live composer remains", () => {
    const root = process.cwd();
    expect(
      existsSync(join(root, "components/lease-renewal/PrepareTenantEmailButton.tsx")),
    ).toBe(false);
    const workspace = readFileSync(
      join(root, "components/lease-renewal/RenewalWorkspace.tsx"),
      "utf8",
    );
    expect(workspace).not.toMatch(/PrepareTenantEmailButton|tenant-notice-draft/);
    expect(workspace).toContain("RenewalNoticeDraftComposer");
  });
});
