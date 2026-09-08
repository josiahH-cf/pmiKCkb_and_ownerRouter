import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { EditableLayerError } from "@/lib/firestore/errors";

export interface ExistingWorkOrderLinkSource {
  actorUid: string;
  accountRef: string;
  ticket: { id: string; updated_at: string; unit: { unitId: string } | null };
  mapping: { propertyId: string; unitId: string };
  workOrder: {
    workOrderId: string;
    propertyId: string;
    unitId: string | null;
    workOrderStatusId: string;
  };
}

/** Inputs are fresh server reads. This creates neither a provider receipt nor correction authority. */
export function buildExistingWorkOrderLinkPreview(input: ExistingWorkOrderLinkSource) {
  const { ticket, mapping, workOrder } = input;
  const ticketUnit = ticket.unit?.unitId.replace(/^unit:/, "");
  if (
    !input.actorUid ||
    input.accountRef !== "pmikcmetro" ||
    !ticket.id ||
    !ticket.updated_at ||
    ticketUnit !== mapping.unitId ||
    workOrder.unitId !== mapping.unitId ||
    workOrder.propertyId !== mapping.propertyId ||
    ![mapping.propertyId, mapping.unitId, workOrder.workOrderId].every((id) =>
      /^[1-9][0-9]*$/.test(id),
    )
  )
    throw new EditableLayerError(
      "The existing work order does not match this ticket's verified account, property, and unit.",
      409,
    );
  const values = {
    ticket_ref: ticket.id,
    ticket_version: ticket.updated_at,
    actor_uid: input.actorUid,
    account_ref: input.accountRef,
    property_id: mapping.propertyId,
    unit_id: mapping.unitId,
    work_order_id: workOrder.workOrderId,
    work_order_status_id: workOrder.workOrderStatusId,
  };
  return { values, previewHash: hashExecutionPreview(values) };
}

export function confirmExistingWorkOrderLinkPreview(
  confirmedPreviewHash: string,
  input: ExistingWorkOrderLinkSource,
) {
  const preview = buildExistingWorkOrderLinkPreview(input);
  if (confirmedPreviewHash !== preview.previewHash)
    throw new EditableLayerError(
      "The ticket or work-order identity changed. Review a fresh link preview.",
      409,
    );
  return preview;
}
