import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const exists = (relative: string) => fs.existsSync(path.join(root, relative));
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("retired Test Vendor audit route", () => {
  it("removes the Test-only audit endpoint", () => {
    expect(exists("app/api/admin/vendors/test/[vendorId]/audit/route.ts")).toBe(false);
  });

  it("retains bodyless audit storage for ordinary Vendor lifecycle evidence", () => {
    expect(read("lib/firestore/vendors.ts")).toContain("listBodylessAudit");
  });

  it("retains focused ordinary bodyless-audit coverage", () => {
    expect(exists("tests/unit/vendor-bodyless-audit.test.ts")).toBe(true);
  });
});
