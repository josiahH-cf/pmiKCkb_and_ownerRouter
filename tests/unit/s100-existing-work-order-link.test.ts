import { describe, expect, it } from "vitest";
import {
  buildExistingWorkOrderLinkPreview,
  confirmExistingWorkOrderLinkPreview,
} from "@/lib/maintenance/existing-work-order-link";

const source = () => ({
  actorUid: "editor",
  ticket: {
    id: "ticket-a",
    updated_at: "2026-09-07T00:00:00.000Z",
    unit: { unitId: "unit:42", label: "Verified unit" },
  },
  mapping: { propertyId: "21", unitId: "42" },
  workOrder: {
    workOrderId: "63",
    propertyId: "21",
    unitId: "42",
    workOrderStatusId: "2",
  },
  accountRef: "pmikcmetro",
});

describe("S100 existing-work-order linking", () => {
  it("previews a verified account, ticket, property, unit, and existing work order", () => {
    const preview = buildExistingWorkOrderLinkPreview(source());
    expect(preview.values).toMatchObject({
      ticket_ref: "ticket-a",
      property_id: "21",
      unit_id: "42",
      work_order_id: "63",
      account_ref: "pmikcmetro",
    });
    expect(preview).not.toHaveProperty("execution_id");
    expect(preview).not.toHaveProperty("receipt_result_hash");
  });
  it("rejects a work order from a different property or unit", () => {
    const input = source();
    input.workOrder.propertyId = "22";
    expect(() => buildExistingWorkOrderLinkPreview(input)).toThrow("does not match");
  });
  it("requires confirmation of the freshly rederived identity and ticket version", () => {
    const input = source();
    const preview = buildExistingWorkOrderLinkPreview(input);
    expect(() =>
      confirmExistingWorkOrderLinkPreview(preview.previewHash, input),
    ).not.toThrow();
    input.ticket.updated_at = "2026-09-07T01:00:00.000Z";
    expect(() => confirmExistingWorkOrderLinkPreview(preview.previewHash, input)).toThrow(
      "changed",
    );
  });
  it("binds confirmation to the staff actor", () => {
    const input = source();
    const preview = buildExistingWorkOrderLinkPreview(input);
    input.actorUid = "other-editor";
    expect(() => confirmExistingWorkOrderLinkPreview(preview.previewHash, input)).toThrow(
      "changed",
    );
  });
});
