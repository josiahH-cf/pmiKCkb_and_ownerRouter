import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const exists = (relative: string) => fs.existsSync(path.join(root, relative));
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("retired Maintenance Test Vendor handoff", () => {
  it("removes the Test Vendor handoff route", () => {
    expect(exists("app/api/maintenance/tickets/[ticketId]/vendor-handoff/route.ts")).toBe(
      false,
    );
  });

  it("removes generic Vendor assignment from the maintenance transition schema", () => {
    const source = read("lib/firestore/maintenance-tickets.ts");
    expect(source).not.toContain('op: z.literal("vendor-assign")');
  });

  it("retains the exact Live Vendor lifecycle route as the supported assignment path", () => {
    expect(exists("app/api/admin/vendors/live/actions/route.ts")).toBe(true);
    expect(exists("lib/vendor/live-lifecycle-service.ts")).toBe(true);
  });
});
