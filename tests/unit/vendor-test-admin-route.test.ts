import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const exists = (relative: string) => fs.existsSync(path.join(root, relative));
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("retired Production Test Vendor Admin route", () => {
  it("removes the Test Vendor collection route", () => {
    expect(exists("app/api/admin/vendors/test/route.ts")).toBe(false);
  });

  it("removes the per-Vendor Test audit route", () => {
    expect(exists("app/api/admin/vendors/test/[vendorId]/audit/route.ts")).toBe(false);
  });

  it("removes the Test Vendor Admin runtime", () => {
    expect(exists("lib/vendor/admin-runtime.ts")).toBe(false);
  });

  it("removes the shipped Test Vendor identity adapter", () => {
    expect(exists("lib/vendor/test-identity.ts")).toBe(false);
  });

  it("removes Test Vendor controls from People and Access", () => {
    expect(read("app/admin/users/page.tsx")).not.toContain("VendorAdminPanel");
  });

  it("removes Test Vendor controls from the Admin landing page", () => {
    expect(read("app/admin/page.tsx")).not.toContain("VendorAdminPanel");
  });

  it("retains the exact Live Vendor action route", () => {
    expect(exists("app/api/admin/vendors/live/actions/route.ts")).toBe(true);
  });

  it("retains test-only deterministic identity coverage outside runtime", () => {
    expect(exists("tests/helpers/vendor-test-identity.ts")).toBe(true);
  });
});
