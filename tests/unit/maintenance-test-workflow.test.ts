import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildMaintenanceTestActionReceipt,
  MAINTENANCE_TEST_ACTION_TARGETS,
  MAINTENANCE_TEST_UNIT,
  MAINTENANCE_TEST_VENDOR,
} from "@/lib/maintenance/test-workflow";

describe("Maintenance production Test contract", () => {
  it("uses only the canonical invented unit and non-routable Vendor identity", () => {
    expect(MAINTENANCE_TEST_UNIT.unitId).toBe("unit:test-maple-204");
    expect(MAINTENANCE_TEST_UNIT.label).toMatch(/^TEST/);
    expect(MAINTENANCE_TEST_VENDOR).toEqual({
      id: "vendor:test-summit-plumbing",
      label: "Summit Plumbing Test Vendor",
      email: "service@summit-plumbing.example.invalid",
    });
  });

  it("builds an unmistakably simulated receipt without a provider reference", () => {
    const receipt = buildMaintenanceTestActionReceipt({
      id: "receipt-1",
      ticketId: "ticket-1",
      actionKey: "rentvine.work_order.create",
      actorUid: "editor-1",
      createdAt: "2026-07-15T12:00:00.000Z",
    });

    expect(receipt.target_label).toBe(
      MAINTENANCE_TEST_ACTION_TARGETS["rentvine.work_order.create"],
    );
    expect(receipt).toMatchObject({
      data_mode: "test",
      outcome: "simulated_success",
      provider_contacted: false,
      live_proof_eligible: false,
    });
    expect(receipt).not.toHaveProperty("provider_ref");
  });

  it("keeps the Test adapter structurally disconnected from every live provider module", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/maintenance/test-workflow.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /from\s+["']@\/lib\/(?:rentvine|gmail|google|drive|leadsimple|quickbooks|external-execution)/,
    );
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("providerRef");
  });
});
