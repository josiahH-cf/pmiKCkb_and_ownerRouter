import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const exists = (path: string) => existsSync(join(root, path));
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("retired sample tenant-notice draft path", () => {
  it("keeps the sample-backed API route absent", () => {
    expect(exists("app/api/lease-renewal/tenant-notice-draft/route.ts")).toBe(false);
  });

  it("keeps the obsolete browser button absent", () => {
    expect(exists("components/lease-renewal/PrepareTenantEmailButton.tsx")).toBe(false);
  });

  it("keeps the Live workspace free of the retired tenant route", () => {
    expect(source("components/lease-renewal/RenewalWorkspace.tsx")).not.toMatch(
      /PrepareTenantEmailButton|tenant-notice-draft/,
    );
  });

  it("retains the ordinary Live renewal-notice draft route", () => {
    expect(exists("app/api/lease-renewal/renewal-notice-draft/route.ts")).toBe(true);
  });

  it("keeps the ordinary composer pointed only at the Live draft route", () => {
    const composer = source("components/lease-renewal/RenewalNoticeDraftComposer.tsx");
    expect(composer).toContain("/api/lease-renewal/renewal-notice-draft");
    expect(composer).not.toContain("tenant-notice-draft");
  });

  it("keeps deterministic tenant-draft fixtures under tests/helpers", () => {
    expect(source("tests/helpers/sample-desk.ts")).toContain("buildTenantOfferDraft");
    expect(exists("lib/lease-renewal/sample-desk.ts")).toBe(false);
  });
});
