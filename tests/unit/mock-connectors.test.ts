import { describe, expect, it } from "vitest";
import { validatePreviewPayload } from "@/lib/integrations/preview-payload";
import type { PreviewPayloadField } from "@/lib/firestore/types";
import { createMockMaintenanceChain } from "../helpers/mock-connectors";

const sampleFields: PreviewPayloadField[] = [
  {
    name: "work_order_id",
    label: "Work-order id",
    type: "reference",
    required: true,
    source_system: "Rentvine",
  },
  {
    name: "amount",
    label: "Amount",
    type: "number",
    required: true,
    source_system: "KB Internal",
  },
  {
    name: "scheduled_for",
    label: "Scheduled for",
    type: "date",
    required: false,
    source_system: "KB Internal",
  },
  {
    name: "confirmed",
    label: "Confirmed",
    type: "boolean",
    required: false,
    source_system: "KB Internal",
  },
];

describe("validatePreviewPayload", () => {
  it("accepts a payload that matches the declared fields", () => {
    const result = validatePreviewPayload(sampleFields, {
      work_order_id: "wo-1",
      amount: 125.5,
      scheduled_for: "2026-06-15",
      confirmed: true,
    });

    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("flags a missing required field", () => {
    const result = validatePreviewPayload(sampleFields, { amount: 10 });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Missing required preview field "work_order_id".');
  });

  it("flags wrong value types", () => {
    const result = validatePreviewPayload(sampleFields, {
      work_order_id: "wo-1",
      amount: "not-a-number",
      scheduled_for: "June 15",
      confirmed: "yes",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Preview field "amount" must be a finite number.',
        'Preview field "scheduled_for" must be an ISO date (YYYY-MM-DD) or timestamp.',
        'Preview field "confirmed" must be a boolean.',
      ]),
    );
  });

  it("flags payload keys outside the declared schema", () => {
    const result = validatePreviewPayload(sampleFields, {
      work_order_id: "wo-1",
      amount: 10,
      surprise: "extra",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'Unexpected preview field "surprise" is not in the declared schema.',
    );
  });
});

describe("mock maintenance work-order chain", () => {
  it("runs the documented chain end to end with schema-valid payloads", () => {
    const chain = createMockMaintenanceChain();

    const workOrder = chain.rentvine.createWorkOrder({
      property_unit: "prop-12/unit-3",
      vendor_trade: "vendor-9/plumbing",
      description: "Kitchen sink leaking under the basin.",
      priority: "High",
      expected_status: "Open",
    });
    expect(workOrder.status).toBe("Open");

    const process = chain.leadsimple.startProcess(workOrder.id);
    expect(process.stage).toBe("Scheduled");
    expect(chain.rentvine.getWorkOrder(workOrder.id)?.status).toBe("Open");

    chain.leadsimple.advanceStage(process.processId, "In Progress");
    expect(chain.rentvine.getWorkOrder(workOrder.id)?.status).toBe("In Progress");

    chain.leadsimple.advanceStage(process.processId, "Completed");
    expect(chain.rentvine.getWorkOrder(workOrder.id)?.status).toBe("Completed");

    const bill = chain.quickbooks.createBillDraft({
      vendor: "vendor-9",
      amount: 245,
      currency: "USD",
      account: "repairs-and-maintenance",
      rentvine_work_order_number: workOrder.id,
      property_unit: "prop-12/unit-3",
    });
    expect(bill.billId).toBe("bill-1");

    chain.sheets.appendAuditRow({
      target_sheet: "approved-control-sheet",
      snapshot_kind: "maintenance_exception",
      row_values: `${workOrder.id} | Completed | bill-1`,
    });

    expect(chain.events.map((event) => `${event.system}:${event.action}`)).toEqual([
      "Rentvine:work_order.create",
      "LeadSimple:process.start",
      "LeadSimple:process.update_stage",
      "Rentvine:work_order.status_synced",
      "LeadSimple:process.update_stage",
      "Rentvine:work_order.status_synced",
      "QuickBooks:bill.create_draft",
      "Google Sheets:audit_snapshot.append",
    ]);
  });

  it("rejects a work-order payload that violates the preview schema", () => {
    const chain = createMockMaintenanceChain();

    expect(() =>
      chain.rentvine.createWorkOrder({
        property_unit: "prop-12/unit-3",
        description: "Missing vendor and priority.",
        unexpected_key: true,
      }),
    ).toThrow(/Invalid rentvine\.work_order\.create payload/);
    expect(chain.events).toHaveLength(0);
  });

  it("rejects a bill draft that drops the Rentvine work-order reference", () => {
    const chain = createMockMaintenanceChain();

    expect(() =>
      chain.quickbooks.createBillDraft({
        vendor: "vendor-9",
        amount: 245,
        account: "repairs-and-maintenance",
        property_unit: "prop-12/unit-3",
      }),
    ).toThrow(/rentvine_work_order_number/);
  });
});
