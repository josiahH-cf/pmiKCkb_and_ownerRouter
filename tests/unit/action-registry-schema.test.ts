import { describe, expect, it } from "vitest";
import { CreateActionRegistryInputSchema } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";

const baseInput = {
  key: "rentvine.work_order.create",
  label: "Create Rentvine work order",
  target_system: "Rentvine",
  expected_action: "Create a work order.",
  evidence_status: "Documented",
  documented_evidence: "Rentvine API documents work-order create.",
  preview_schema_note: "Show the fields before creating.",
  rollback_note: "Cancel the work order.",
};

describe("Action Registry schema", () => {
  it("applies safe, non-executable defaults", () => {
    const parsed = CreateActionRegistryInputSchema.parse({ ...baseInput });

    expect(parsed).toMatchObject({
      readiness: "Planned",
      event_ingestion_mode: "None",
      required_permissions: [],
      production_allowed: false,
    });
  });

  it("rejects production_allowed without Approved for Execution readiness", () => {
    expect(() =>
      CreateActionRegistryInputSchema.parse({
        ...baseInput,
        readiness: "Needs Connection",
        production_allowed: true,
      }),
    ).toThrow();
  });

  it("rejects production_allowed when evidence is not Documented", () => {
    expect(() =>
      CreateActionRegistryInputSchema.parse({
        ...baseInput,
        readiness: "Approved for Execution",
        evidence_status: "Vendor-Confirmation-Required",
        production_allowed: true,
      }),
    ).toThrow();
  });

  it("allows production_allowed only when Approved for Execution and Documented", () => {
    const parsed = CreateActionRegistryInputSchema.parse({
      ...baseInput,
      readiness: "Approved for Execution",
      evidence_status: "Documented",
      production_allowed: true,
    });

    expect(parsed.production_allowed).toBe(true);
  });

  it("rejects an unknown target system", () => {
    expect(() =>
      CreateActionRegistryInputSchema.parse({ ...baseInput, target_system: "Yardi" }),
    ).toThrow();
  });

  it("rejects a non-slug action key", () => {
    expect(() =>
      CreateActionRegistryInputSchema.parse({ ...baseInput, key: "Rentvine WO" }),
    ).toThrow();
  });
});

describe("Action Registry seed catalog", () => {
  it("parses every entry", () => {
    for (const entry of ACTION_REGISTRY_SEED) {
      expect(() => CreateActionRegistryInputSchema.parse(entry)).not.toThrow();
    }
  });

  it("keeps every entry non-executable (production_allowed=false)", () => {
    for (const entry of ACTION_REGISTRY_SEED) {
      const parsed = CreateActionRegistryInputSchema.parse(entry);
      expect(parsed.production_allowed).toBe(false);
    }
  });

  it("uses unique keys", () => {
    const keys = ACTION_REGISTRY_SEED.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gates the Rentvine lease-renewal writeback as undocumented", () => {
    const writeback = ACTION_REGISTRY_SEED.find(
      (entry) => entry.key === "rentvine.lease.renewal_writeback",
    );

    expect(writeback?.evidence_status).toBe("Undocumented");
    expect(writeback?.production_allowed).toBe(false);
  });
});
