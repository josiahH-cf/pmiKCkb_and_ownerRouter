import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const exists = (relative: string) => fs.existsSync(path.join(root, relative));
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("retired Test Vendor workspace components", () => {
  it("removes the Test Vendor Admin panel", () => {
    expect(exists("components/admin/VendorAdminPanel.tsx")).toBe(false);
  });

  it("removes the Test Vendor mailbox panel", () => {
    expect(exists("components/vendor/VendorTestMailboxPanel.tsx")).toBe(false);
  });

  it("keeps the Vendor portal explicitly Live", () => {
    expect(read("components/vendor/VendorPortal.tsx")).toContain(
      "External Vendor portal · Live workspace",
    );
  });

  it("removes Test data-mode branches from the Vendor portal", () => {
    const source = read("components/vendor/VendorPortal.tsx");
    expect(source).not.toContain("dataMode");
    expect(source).not.toContain("Test workspace");
  });

  it("removes Test mode props from the Vendor page", () => {
    expect(read("app/vendor/page.tsx")).not.toContain("dataMode=");
  });

  it("removes Test mailbox imports from the Vendor ticket page", () => {
    expect(read("app/vendor/tickets/[ticketId]/page.tsx")).not.toContain(
      "VendorTestMailboxPanel",
    );
  });

  it("retains focused Live portal component coverage", () => {
    expect(exists("tests/unit/vendor-live-lifecycle-page.test.tsx")).toBe(true);
    expect(exists("tests/unit/vendor-gmail-boundary.test.ts")).toBe(true);
  });
});
