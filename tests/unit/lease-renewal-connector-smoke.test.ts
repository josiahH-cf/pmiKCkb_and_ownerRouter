import { describe, expect, it } from "vitest";
import {
  getHealthCheckContract,
  runHealthCheck,
  type HealthCheckTransport,
} from "@/lib/integrations/health-checks";
import { createMockHealthCheckTransport } from "../helpers/mock-connectors";
import { createMockLeaseRenewalReadConnector } from "../helpers/mock-lease-renewal-connector";

describe("lease-renewal connector health smokes (mocked transport only)", () => {
  it("passes the Rentvine and Sheets health contracts through the mock transport", async () => {
    const transport = createMockHealthCheckTransport();

    for (const id of ["health.rentvine.api_key", "health.google_sheets.api"]) {
      const contract = getHealthCheckContract(id);
      expect(contract, id).toBeDefined();
      const result = await runHealthCheck(contract!, transport);
      expect(result.ok, id).toBe(true);
      expect(result.steps.every((step) => step.ok)).toBe(true);
    }
  });

  it("surfaces an injected probe failure and stops attempting later steps", async () => {
    const contract = getHealthCheckContract("health.rentvine.api_key")!;
    const transport = createMockHealthCheckTransport({ failStepIds: ["rentvine.probe"] });

    const result = await runHealthCheck(contract, transport);

    expect(result.ok).toBe(false);
    const probe = result.steps.find((step) => step.step_id === "rentvine.probe");
    expect(probe?.ok).toBe(false);
    const rateLimit = result.steps.find((step) => step.step_id === "rentvine.rate_limit");
    expect(rateLimit?.detail).toBe("not attempted");
  });

  it("has NO live transport default — runHealthCheck requires an injected transport", async () => {
    const contract = getHealthCheckContract("health.google_sheets.api")!;
    await expect(
      runHealthCheck(contract, undefined as unknown as HealthCheckTransport),
    ).rejects.toThrow(/injected transport/);
  });
});

describe("lease-renewal mocked read smokes", () => {
  it("reads a renewal-candidate lease list (validated, PII-free)", () => {
    const connector = createMockLeaseRenewalReadConnector();
    const candidates = connector.listRenewalCandidates({
      lease_end_before: "2026-12-31",
    });

    expect(candidates).toEqual([{ lease_id: "unit-1041" }, { lease_id: "unit-1042" }]);
    expect(connector.events).toHaveLength(1);
    expect(connector.events[0].action).toBe("rentvine.lease.read");
  });

  it("rejects a read payload that does not match the registry preview schema", () => {
    const connector = createMockLeaseRenewalReadConnector();
    expect(() => connector.listRenewalCandidates({ unexpected: true } as never)).toThrow(
      /Invalid rentvine\.lease\.read/,
    );
    expect(() =>
      connector.readChecklistStructure({ tab_scope: "renewals" } as never),
    ).toThrow(/Invalid google_sheets\.renewal_checklist\.read/);
  });

  it("reads sheet structure, hard-excludes tabs 4 & 7, and returns no cell values", () => {
    const connector = createMockLeaseRenewalReadConnector();
    const structure = connector.readChecklistStructure({
      target_sheet: "renewal-checklist",
      tab_scope: "mapped renewal tabs",
    });

    const tabNumbers = structure.map((tab) => tab.tabNumber);
    expect(tabNumbers).not.toContain(4);
    expect(tabNumbers).not.toContain(7);
    expect(structure.some((tab) => tab.recognizedAs === "Renewals")).toBe(true);

    // Structure only — no cell value (PII or credential placeholder) is ever returned.
    const serialized = JSON.stringify(structure);
    expect(serialized).not.toContain("PLACEHOLDER");
    expect(serialized).not.toContain("Jordan");
  });
});
