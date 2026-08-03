import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("retired V1 Production Test workspace route", () => {
  it("keeps the browser endpoint absent", () => {
    expect(existsSync(join(root, "app/api/admin/v1/fake-acceptance/route.ts"))).toBe(
      false,
    );
  });

  it("keeps the panel and executor harness outside the Production graph", () => {
    expect(
      existsSync(join(root, "components/admin/V1ProductionTestWorkspacePanel.tsx")),
    ).toBe(false);
    expect(existsSync(join(root, "lib/release/fake-acceptance.ts"))).toBe(false);
  });

  it("preserves reusable acceptance behavior only under tests/helpers", () => {
    expect(existsSync(join(root, "tests/helpers/fake-acceptance.ts"))).toBe(true);
    expect(
      readFileSync(join(root, "tests/helpers/fake-acceptance.ts"), "utf8"),
    ).toContain("runIntegratedFakeV1Acceptance");
  });
});
