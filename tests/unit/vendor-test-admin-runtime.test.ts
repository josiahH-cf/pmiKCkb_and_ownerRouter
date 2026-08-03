import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const exists = (relative: string) => fs.existsSync(path.join(root, relative));
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const store = read("lib/firestore/vendors.ts");
const service = read("lib/vendor/live-lifecycle-service.ts");

describe("retired Test Vendor Admin runtime mapping", () => {
  it("has no production Test Admin runtime module", () => {
    expect(exists("lib/vendor/admin-runtime.ts")).toBe(false);
  });

  it("keeps the Live lifecycle prepare operation", () => {
    expect(service).toContain("prepareLiveVendorLifecycle");
  });

  it("keeps the Live lifecycle execute operation", () => {
    expect(service).toContain("executeLiveVendorLifecycle");
  });

  it("keeps the Live lifecycle reconcile operation", () => {
    expect(service).toContain("reconcileLiveVendorLifecycle");
  });

  it("keeps generic Vendor lookup", () => {
    expect(store).toContain("async getVendorById(");
  });

  it("keeps bodyless Vendor audit projection", () => {
    expect(store).toContain("async listBodylessAudit(");
  });

  it("keeps exact Live activation", () => {
    expect(store).toContain("async activateVendor(");
  });

  it("keeps exact Live active-state validation", () => {
    expect(store).toContain("async isVendorActive(");
  });

  it("keeps the disable off switch", () => {
    expect(store).toContain("async disableVendor(");
  });

  it("moves deterministic Test identity behavior under tests/helpers", () => {
    expect(exists("tests/helpers/vendor-test-identity.ts")).toBe(true);
    expect(exists("tests/helpers/firestore-test-vendors.ts")).toBe(true);
  });
});
