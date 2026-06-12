import { describe, expect, it } from "vitest";
import {
  HEALTH_CHECK_CONTRACTS,
  getHealthCheckContract,
  runHealthCheck,
  type HealthCheckTransport,
} from "@/lib/integrations/health-checks";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { createMockHealthCheckTransport } from "../helpers/mock-connectors";

describe("health-check contracts", () => {
  it("uses unique contract ids", () => {
    const ids = HEALTH_CHECK_CONTRACTS.map((contract) => contract.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses unique step ids within each contract", () => {
    for (const contract of HEALTH_CHECK_CONTRACTS) {
      const stepIds = contract.steps.map((step) => step.id);
      expect(new Set(stepIds).size, contract.id).toBe(stepIds.length);
    }
  });

  it("resolves every seed connection_health_check_ref to a matching-system contract", () => {
    for (const entry of ACTION_REGISTRY_SEED) {
      expect(entry.connection_health_check_ref, entry.key).toBeDefined();
      const contract = getHealthCheckContract(entry.connection_health_check_ref ?? "");
      expect(
        contract,
        `${entry.key} -> ${entry.connection_health_check_ref}`,
      ).toBeDefined();
      expect(contract?.system, entry.key).toBe(entry.target_system);
    }
  });
});

describe("runHealthCheck", () => {
  const rentvine = getHealthCheckContract("health.rentvine.api_key");

  if (!rentvine) {
    throw new Error("Expected the Rentvine health-check contract to exist.");
  }

  it("returns one ordered result per step when all probes pass", async () => {
    const result = await runHealthCheck(rentvine, createMockHealthCheckTransport());

    expect(result.ok).toBe(true);
    expect(result.contract_id).toBe("health.rentvine.api_key");
    expect(result.system).toBe("Rentvine");
    expect(result.steps.map((step) => step.step_id)).toEqual(
      rentvine.steps.map((step) => step.id),
    );
    expect(result.steps.every((step) => step.ok)).toBe(true);
  });

  it("marks steps after the first failure as not attempted", async () => {
    const result = await runHealthCheck(
      rentvine,
      createMockHealthCheckTransport({ failStepIds: ["rentvine.auth"] }),
    );

    expect(result.ok).toBe(false);
    expect(result.steps[0]).toMatchObject({ step_id: "rentvine.config", ok: true });
    expect(result.steps[1]).toMatchObject({ step_id: "rentvine.auth", ok: false });
    expect(result.steps[2]).toMatchObject({
      step_id: "rentvine.probe",
      ok: false,
      detail: "not attempted",
    });
    expect(result.steps[3]).toMatchObject({
      step_id: "rentvine.rate_limit",
      ok: false,
      detail: "not attempted",
    });
  });

  it("refuses to run without an injected transport (no live calls ever)", async () => {
    await expect(
      runHealthCheck(rentvine, undefined as unknown as HealthCheckTransport),
    ).rejects.toThrow(/never performs live network calls/);
    await expect(runHealthCheck(rentvine, {} as HealthCheckTransport)).rejects.toThrow(
      /never performs live network calls/,
    );
  });
});
