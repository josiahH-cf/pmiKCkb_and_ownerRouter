import { describe, expect, it } from "vitest";
import { CreateActionRegistryInputSchema } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { validatePreviewPayload } from "@/lib/integrations/preview-payload";

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

  it("keeps every entry non-executable except the workflow-bounded Gmail actions", () => {
    const EXECUTABLE = new Set([
      "gmail.mailbox.read",
      "gmail.thread.reply",
      "gmail.label.apply",
      "gmail.renewal_notice.draft_create",
    ]);
    for (const entry of ACTION_REGISTRY_SEED) {
      const parsed = CreateActionRegistryInputSchema.parse(entry);
      expect(parsed.production_allowed, entry.key).toBe(EXECUTABLE.has(entry.key));
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

  it("contains the expanded 38-entry catalog", () => {
    expect(ACTION_REGISTRY_SEED).toHaveLength(38);
    expect(ACTION_REGISTRY_SEED.map((entry) => entry.key)).toEqual(
      expect.arrayContaining([
        "rentvine.lease.read",
        "rentvine.work_order.read",
        "leadsimple.task.create",
        "gmail.label.apply",
        "gmail.draft.create",
        "gmail.mailbox.read",
        "gmail.message.send",
        "gmail.thread.reply",
        "gmail.renewal_notice.draft_create",
        "gmail.maintenance_owner_notice.draft_create",
        "google_sheets.renewal_checklist.read",
        "google_sheets.renewal_checklist.reconcile",
        "google_sheets.renewal_checklist.writeback",
        "google_drive.maintenance_photo.store",
        "vendor.account.invite",
        "vendor.account.disable",
        "vendor.assignment.change",
        "vendor.gmail.connect",
        "vendor.gmail.revoke",
        "vendor.gmail.health",
        "vendor.gmail.thread.read",
        "vendor.gmail.draft.create",
        "vendor.gmail.thread.reply",
        "vendor.gmail.label.apply",
        "gmail.renewal_notice.send",
        "rentvine.renewal.portal_message.send",
        "sms.renewal_message.send",
        "rentvine.work_order.assign_vendor",
        "gmail.maintenance_owner_notice.send",
      ]),
    );
  });

  it("opens the workflow transport actions plus the authorized renewal-notice draft; other initiations stay gated", () => {
    const gmailEntries = ACTION_REGISTRY_SEED.filter(
      (entry) => entry.target_system === "Gmail",
    );
    expect(gmailEntries).toHaveLength(16);

    // Authorized for production by the 2026-07-19 owner grant (F-SEND-AUTHORIZED): draft-into-Gmail,
    // human sends. The sample-data guard (not the registry gate) keeps sample runs preview-only.
    const renewalNotice = gmailEntries.find(
      (entry) => entry.key === "gmail.renewal_notice.draft_create",
    );
    expect(renewalNotice?.product_lane).toBe("Lease Renewal Agent");
    expect(renewalNotice?.readiness).toBe("Approved for Execution");
    expect(renewalNotice?.evidence_status).toBe("Documented");
    expect(renewalNotice?.production_allowed).toBe(true);

    const workflowTransport = gmailEntries.filter(
      (entry) => entry.product_lane === "Workflow Communications",
    );
    expect(workflowTransport).toHaveLength(12);
    expect(
      workflowTransport
        .filter((entry) => entry.production_allowed)
        .map((entry) => entry.key),
    ).toEqual(["gmail.mailbox.read", "gmail.thread.reply", "gmail.label.apply"]);
    expect(
      gmailEntries.find(
        (entry) => entry.key === "gmail.maintenance_owner_notice.draft_create",
      )?.production_allowed,
    ).toBe(false);
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

describe("Lease-renewal checklist registry entries", () => {
  const renewalEntries = ACTION_REGISTRY_SEED.filter((entry) =>
    entry.key.startsWith("google_sheets.renewal_checklist."),
  );

  // Parse so schema defaults (required_permissions: [], preview field required: false)
  // are applied — the raw seed input leaves those optional.
  function entry(key: string) {
    const found = ACTION_REGISTRY_SEED.find((candidate) => candidate.key === key);
    if (!found) throw new Error(`Missing seed entry ${key}`);
    return CreateActionRegistryInputSchema.parse(found);
  }

  it("seeds exactly read, reconcile, and writeback on the renewal-checklist sheet", () => {
    expect(renewalEntries.map((e) => e.key).sort()).toEqual([
      "google_sheets.renewal_checklist.read",
      "google_sheets.renewal_checklist.reconcile",
      "google_sheets.renewal_checklist.writeback",
    ]);

    for (const e of renewalEntries) {
      expect(e.target_system, e.key).toBe("Google Sheets");
      expect(e.product_lane, e.key).toBe("Lease Renewal Agent");
      expect(e.production_allowed, e.key).toBe(false);
      expect(e.connection_health_check_ref, e.key).toBe("health.google_sheets.api");
      expect(() => CreateActionRegistryInputSchema.parse(e)).not.toThrow();
    }
  });

  it("scopes the read connector to mapped tabs and denies tabs 4 & 7 at the boundary", () => {
    const read = entry("google_sheets.renewal_checklist.read");

    expect(read.readiness).toBe("Needs Connection");
    expect(read.evidence_status).toBe("Documented");
    expect(read.required_permissions.join(" ")).toMatch(/tabs 4 & 7/);
  });

  it("keeps reconcile a flags-only step with no event ingestion", () => {
    const reconcile = entry("google_sheets.renewal_checklist.reconcile");

    expect(reconcile.readiness).toBe("Planned");
    expect(reconcile.event_ingestion_mode).toBe("None");
    expect(reconcile.preview_payload_schema).toBeUndefined();
    expect(reconcile.expected_action).toMatch(/flags only/i);
  });

  it("models writeback as Documented + Planned (not vendor-confirmation-required)", () => {
    const writeback = entry("google_sheets.renewal_checklist.writeback");

    // Review fix #12: mis-coding this Vendor-Confirmation-Required would permanently block
    // the Documented-requiring production gate; Sheets writes have no vendor to confirm.
    expect(writeback.evidence_status).toBe("Documented");
    expect(writeback.readiness).toBe("Planned");
    expect(writeback.production_allowed).toBe(false);
    expect(writeback.required_permissions.join(" ")).toMatch(
      /feature flag \(off by default\)/i,
    );
  });

  it("gives writeback a cell-addressed preview schema that validatePreviewPayload accepts", () => {
    const writeback = entry("google_sheets.renewal_checklist.writeback");
    const fields = writeback.preview_payload_schema ?? [];

    expect(fields.map((f) => f.name)).toEqual([
      "tab",
      "row_key",
      "column",
      "before_value",
      "after_value",
      "source_of_value",
      "verification_link",
    ]);

    const ok = validatePreviewPayload(fields, {
      tab: "Renewals",
      row_key: "unit-1042::lease-2026-08",
      column: "Renewal Date",
      before_value: "2026-08-31",
      after_value: "2026-09-30",
      source_of_value: "Rentvine lease record",
      verification_link: "https://kb.example/runs/abc123",
    });
    expect(ok).toEqual({ ok: true, errors: [] });

    const missing = validatePreviewPayload(fields, {
      tab: "Renewals",
      row_key: "unit-1042::lease-2026-08",
      column: "Renewal Date",
      before_value: "2026-08-31",
      after_value: "2026-09-30",
      source_of_value: "Rentvine lease record",
      // verification_link omitted
    });
    expect(missing.ok).toBe(false);
    expect(missing.errors).toContain(
      'Missing required preview field "verification_link".',
    );
  });
});
