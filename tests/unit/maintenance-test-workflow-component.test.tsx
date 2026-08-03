import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const queue = read("components/maintenance/MaintenanceQueue.tsx");

describe("retired Maintenance Test workspace controls", () => {
  it("removes the Create Test ticket control", () => {
    expect(queue).not.toContain("Create Test ticket");
  });

  it("removes the Test data filter", () => {
    expect(queue).not.toContain('value="test"');
    expect(queue).not.toContain('aria-label="Data"');
  });

  it("removes Test action controls and receipts", () => {
    expect(queue).not.toContain("test-actions");
    expect(queue).not.toContain("MaintenanceTestActionReceipt");
  });

  it("removes the simulated Vendor handoff control", () => {
    expect(queue).not.toContain("vendor-handoff");
    expect(queue).not.toContain("Assign Test Vendor");
  });

  it("filters legacy Test records before rendering", () => {
    expect(queue).toContain('ticket.data_mode === "live"');
  });

  it("retains the ordinary Live queue lifecycle", () => {
    expect(queue).toContain("async function patch");
    expect(queue).toContain("Reopen ticket");
    expect(queue).toContain("MaintenanceOwnerNoticeDraftComposer");
  });
});
