import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const exists = (path: string) => existsSync(join(root, path));
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("retired sample owner-notice draft path", () => {
  it("keeps the sample-backed API route absent", () => {
    expect(exists("app/api/lease-renewal/owner-notice-draft/route.ts")).toBe(false);
  });

  it("keeps the obsolete browser button absent", () => {
    expect(exists("components/lease-renewal/PrepareOwnerEmailButton.tsx")).toBe(false);
  });

  it("keeps the Production sample-desk module absent", () => {
    expect(exists("lib/lease-renewal/sample-desk.ts")).toBe(false);
  });

  it("keeps the Live workspace free of the retired owner route and button", () => {
    expect(source("components/lease-renewal/RenewalWorkspace.tsx")).not.toMatch(
      /PrepareOwnerEmailButton|owner-notice-draft|sample-desk/,
    );
  });

  it("preserves deterministic desk constructors only as an automated-test helper", () => {
    expect(exists("tests/helpers/sample-desk.ts")).toBe(true);
    expect(source("tests/helpers/sample-desk.ts")).toContain(
      "export function getRenewalLeaseWorkspace",
    );
  });
});
