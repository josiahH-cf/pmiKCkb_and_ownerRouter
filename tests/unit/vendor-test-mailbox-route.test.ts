import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const exists = (relative: string) => fs.existsSync(path.join(root, relative));
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("retired Vendor Test mailbox route", () => {
  it("removes the assigned-ticket Test mailbox endpoint", () => {
    expect(exists("app/api/vendor/tickets/[ticketId]/test-mailbox/route.ts")).toBe(false);
  });

  it("removes Test mailbox branching from the Vendor ticket page", () => {
    const source = read("app/vendor/tickets/[ticketId]/page.tsx");
    expect(source).not.toContain("VendorTestMailboxPanel");
    expect(source).not.toContain("test-mailbox");
  });

  it("retains the assigned-thread Live Gmail boundary", () => {
    expect(exists("lib/vendor/gmail.ts")).toBe(true);
    expect(exists("tests/unit/vendor-gmail-boundary.test.ts")).toBe(true);
  });
});
