import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const exists = (relative: string) => fs.existsSync(path.join(root, relative));
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("retired Maintenance Test workflow routes", () => {
  it("removes the Test ticket seed route", () => {
    expect(exists("app/api/maintenance/tickets/test-seed/route.ts")).toBe(false);
  });

  it("removes the Test action route", () => {
    expect(exists("app/api/maintenance/tickets/[ticketId]/test-actions/route.ts")).toBe(
      false,
    );
  });

  it("keeps the remaining ticket route structurally Live-only", () => {
    const source = read("app/api/maintenance/tickets/route.ts");
    expect(source).toContain("CreateLiveMaintenanceTicketInputSchema");
    expect(source).toContain('rawMode !== "live"');
  });

  it("keeps Test workflow construction outside product runtime", () => {
    expect(exists("lib/maintenance/test-workflow.ts")).toBe(false);
    expect(exists("tests/helpers/maintenance-test-workflow.ts")).toBe(true);
  });

  it("retains a negative CLI guard without a Test token constructor", () => {
    const source = read("scripts/mint-maintenance-intake-token.ts");
    expect(source).toContain('hasArg("--test")');
    expect(source).toContain('dataMode: "live"');
    expect(source).not.toContain("MAINTENANCE_TEST_PUBLIC_INTAKE");
  });
});
