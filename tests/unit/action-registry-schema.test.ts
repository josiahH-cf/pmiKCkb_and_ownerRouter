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

  it("parses a structured preview payload schema and defaults required to false", () => {
    const parsed = CreateActionRegistryInputSchema.parse({
      ...baseInput,
      preview_payload_schema: [
        {
          name: "property_unit",
          label: "Property / unit",
          type: "reference",
          source_system: "Rentvine",
        },
      ],
    });

    expect(parsed.preview_payload_schema).toEqual([
      {
        name: "property_unit",
        label: "Property / unit",
        type: "reference",
        required: false,
        source_system: "Rentvine",
        note: undefined,
      },
    ]);
  });

  it("rejects an unknown preview field type", () => {
    expect(() =>
      CreateActionRegistryInputSchema.parse({
        ...baseInput,
        preview_payload_schema: [
          {
            name: "amount",
            label: "Amount",
            type: "currency",
            source_system: "QuickBooks",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects a non-snake_case preview field name", () => {
    expect(() =>
      CreateActionRegistryInputSchema.parse({
        ...baseInput,
        preview_payload_schema: [
          {
            name: "PropertyUnit",
            label: "Property / unit",
            type: "reference",
            source_system: "Rentvine",
          },
        ],
      }),
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

  it("contains the expanded 14-entry catalog", () => {
    expect(ACTION_REGISTRY_SEED).toHaveLength(14);
    expect(ACTION_REGISTRY_SEED.map((entry) => entry.key)).toEqual(
      expect.arrayContaining([
        "rentvine.lease.read",
        "rentvine.work_order.read",
        "leadsimple.task.create",
        "gmail.label.apply",
        "gmail.draft.create",
      ]),
    );
  });

  it("keeps Gmail entries Planned until the access model is approved", () => {
    const gmailEntries = ACTION_REGISTRY_SEED.filter(
      (entry) => entry.target_system === "Gmail",
    );

    expect(gmailEntries).toHaveLength(2);

    for (const entry of gmailEntries) {
      expect(entry.readiness).toBe("Planned");
      expect(entry.product_lane).toBe("Gmail Inbox 0");
    }
  });

  it("keeps LeadSimple task creation behind vendor confirmation", () => {
    const task = ACTION_REGISTRY_SEED.find(
      (entry) => entry.key === "leadsimple.task.create",
    );

    expect(task?.evidence_status).toBe("Vendor-Confirmation-Required");
    expect(task?.required_plan).toBe("LeadSimple Operations plan");
  });

  it("gives every maintenance-chain entry a structured preview payload schema", () => {
    const maintenanceChainKeys = [
      "rentvine.work_order.create",
      "rentvine.work_order.update_status",
      "leadsimple.process.update_stage",
      "quickbooks.bill.create_draft",
      "google_sheets.audit_snapshot.append",
    ];

    for (const key of maintenanceChainKeys) {
      const entry = ACTION_REGISTRY_SEED.find((candidate) => candidate.key === key);
      expect(entry?.preview_payload_schema?.length, key).toBeGreaterThan(0);
    }
  });

  it("references a connection health check on every entry", () => {
    for (const entry of ACTION_REGISTRY_SEED) {
      expect(entry.connection_health_check_ref, entry.key).toMatch(/^health\./);
    }
  });
});
