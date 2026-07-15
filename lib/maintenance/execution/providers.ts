import { createHash } from "node:crypto";

import type {
  ExternalActionInput,
  ExternalActionReceipt,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import { externalActionIdempotencyKey } from "@/lib/external-execution/identity";
import { ExternalExecutionError } from "@/lib/external-execution/types";
import {
  LeaseGmailExecutor,
  type WorkflowMessageProvider,
} from "@/lib/lease-renewal/execution/providers";
import { VENDOR_OAUTH_SCOPES, type VendorOAuthScope } from "@/lib/vendor/model";

function value(input: ExternalActionInput, key: string) {
  const current = input.values[key];
  if (typeof current !== "string" || !current.trim()) {
    throw new ExternalExecutionError(`Authoritative ${key} is required.`, "blocked");
  }
  return current.trim();
}

function stringBlocker(input: ExternalActionInput, key: string) {
  const current = input.values[key];
  return typeof current !== "string" || !current.trim()
    ? `Authoritative ${key} is required.`
    : null;
}

function firstBlocker(...blockers: Array<string | null | false | undefined>) {
  return (
    blockers.find((blocker): blocker is string => typeof blocker === "string") ?? null
  );
}

function assertValid(blocker: string | null) {
  if (blocker) throw new ExternalExecutionError(blocker, "blocked");
}

function idempotencyKey(input: ExternalActionInput) {
  return externalActionIdempotencyKey(input);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function payloadHash(value: unknown) {
  return sha256(JSON.stringify(value));
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^@\s]+@[^@\s]+$/.test(value.trim());
}

function isRfcMessageId(value: unknown): value is string {
  return typeof value === "string" && /^<[^<>\s@]+@[^<>\s@]+>$/.test(value.trim());
}

function isSafePathSegment(value: string) {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== "." && value !== "..";
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

function receipt(
  input: ExternalActionInput,
  providerRef: string,
  observed: unknown,
  reconciled = false,
): ExternalActionReceipt {
  const normalizedProviderRef = providerRef.trim();
  if (!normalizedProviderRef) {
    throw new ExternalExecutionError(
      "The provider returned no stable result reference.",
      "ambiguous",
    );
  }
  return {
    actionKey: input.actionKey,
    providerRef: normalizedProviderRef,
    resultHash: payloadHash(observed),
    reconciled,
    createdAt: new Date().toISOString(),
  };
}

export const PHOTO_MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export interface StoredMaintenancePhoto {
  fileRef: string;
  folderId: string;
  filename: string;
  contentHash: string;
}

export interface MaintenancePhotoProvider {
  append(input: {
    ticketRef: string;
    folderId: string;
    filename: string;
    mimeType: keyof typeof PHOTO_MIME_EXTENSIONS;
    sizeBytes: number;
    contentHash: string;
    idempotencyKey: string;
  }): Promise<StoredMaintenancePhoto>;
  reconcile(idempotencyKey: string): Promise<StoredMaintenancePhoto | null>;
}

export class MaintenancePhotoExecutor implements ExternalExecutor {
  constructor(private readonly provider: MaintenancePhotoProvider) {}

  validate(input: ExternalActionInput) {
    if (input.actionKey !== "google_drive.maintenance_photo.store") {
      return "Maintenance photo executor received the wrong action key.";
    }
    const basic = firstBlocker(
      stringBlocker(input, "ticket_ref"),
      stringBlocker(input, "folder_ref"),
      stringBlocker(input, "server_filename"),
      stringBlocker(input, "mime_type"),
      stringBlocker(input, "content_hash"),
    );
    if (basic) return basic;
    const ticketRef = String(input.values.ticket_ref).trim();
    const folderId = String(input.values.folder_ref).trim();
    const filename = String(input.values.server_filename).trim();
    const mimeType = String(input.values.mime_type).trim();
    const contentHash = String(input.values.content_hash).trim();
    const sizeBytes = input.values.size_bytes;
    if (!isSafePathSegment(ticketRef) || input.workflowId !== ticketRef) {
      return "Maintenance photo ticket reference must be the current workflow ticket.";
    }
    if (!isSafePathSegment(input.actionId)) {
      return "Maintenance photo action reference is not path-safe.";
    }
    if (input.mappingRef !== `mapping:ticket-folder:${ticketRef}:${folderId}`) {
      return "Maintenance photo folder does not match the configured ticket folder.";
    }
    if (!(mimeType in PHOTO_MIME_EXTENSIONS)) {
      return "Maintenance photo MIME type is not allowed.";
    }
    const extension =
      PHOTO_MIME_EXTENSIONS[mimeType as keyof typeof PHOTO_MIME_EXTENSIONS];
    if (filename !== `${ticketRef}/${input.actionId}.${extension}`) {
      return "Maintenance photo filename must be server-derived from ticket and action.";
    }
    if (
      !Number.isSafeInteger(sizeBytes) ||
      Number(sizeBytes) <= 0 ||
      Number(sizeBytes) > 10_000_000
    ) {
      return "Maintenance photo size is not allowed.";
    }
    if (!/^[a-f0-9]{64}$/.test(contentHash)) {
      return "Maintenance photo content hash is required.";
    }
    if (
      input.values.malware_scan_passed !== true ||
      input.values.sensitivity_scan_passed !== true ||
      input.values.append_only !== true
    ) {
      return "Append-only malware- and sensitivity-scanned photo is required.";
    }
    if (
      input.authority?.actor.role === "Vendor" &&
      input.values.assigned_ticket !== true
    ) {
      return "The Vendor must be assigned to the photo ticket.";
    }
    return null;
  }

  async execute(input: ExternalActionInput) {
    assertValid(this.validate(input));
    const mimeType = value(input, "mime_type") as keyof typeof PHOTO_MIME_EXTENSIONS;
    const expected = {
      folderId: value(input, "folder_ref"),
      filename: value(input, "server_filename"),
      contentHash: value(input, "content_hash"),
    };
    const result = await this.provider.append({
      ticketRef: value(input, "ticket_ref"),
      ...expected,
      mimeType,
      sizeBytes: Number(input.values.size_bytes),
      idempotencyKey: idempotencyKey(input),
    });
    if (!photoMatches(result, expected)) {
      throw new ExternalExecutionError(
        "Maintenance photo readback does not match the reviewed target.",
        "ambiguous",
      );
    }
    return receipt(input, result.fileRef, result);
  }

  async reconcile(input: ExternalActionInput) {
    assertValid(this.validate(input));
    const result = await this.provider.reconcile(idempotencyKey(input));
    const expected = {
      folderId: value(input, "folder_ref"),
      filename: value(input, "server_filename"),
      contentHash: value(input, "content_hash"),
    };
    return result && photoMatches(result, expected)
      ? receipt(input, result.fileRef, result, true)
      : null;
  }
}

function photoMatches(
  result: StoredMaintenancePhoto,
  expected: Pick<StoredMaintenancePhoto, "folderId" | "filename" | "contentHash">,
) {
  return (
    Boolean(result.fileRef.trim()) &&
    result.folderId === expected.folderId &&
    result.filename === expected.filename &&
    result.contentHash === expected.contentHash
  );
}

export interface RentvineWorkOrderState {
  workOrderRef: string;
  status: string;
  vendorRef?: string;
  propertyUnitRef?: string;
  vendorTradeRef?: string;
  descriptionHash?: string;
  priority?: string;
}

export interface RentvineWorkOrderProvider {
  create(input: {
    propertyUnitRef: string;
    vendorTradeRef: string;
    description: string;
    priority: string;
    expectedStatus: string;
    idempotencyKey: string;
  }): Promise<{ workOrderRef: string }>;
  assignVendor(input: {
    workOrderRef: string;
    expectedStatus: string;
    expectedVendorRef: string;
    vendorRef: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<{ workOrderRef: string; applied: boolean }>;
  updateStatus(input: {
    workOrderRef: string;
    expectedStatus: string;
    targetStatus: string;
    idempotencyKey: string;
  }): Promise<{ workOrderRef: string; applied: boolean }>;
  read(workOrderRef: string): Promise<RentvineWorkOrderState | null>;
  reconcile(idempotencyKey: string): Promise<RentvineWorkOrderState | null>;
}

const RENTVINE_STATUSES = new Set(["Open", "Waiting on Vendor", "Scheduled", "Closed"]);
const ALLOWED_TRANSITIONS = new Set([
  "Open->Waiting on Vendor",
  "Waiting on Vendor->Scheduled",
  "Scheduled->Closed",
  "Open->Closed",
]);

export class RentvineWorkOrderExecutor implements ExternalExecutor {
  constructor(private readonly provider: RentvineWorkOrderProvider) {}

  validate(input: ExternalActionInput) {
    switch (input.actionKey) {
      case "rentvine.work_order.create": {
        const blocker = firstBlocker(
          stringBlocker(input, "property_unit"),
          stringBlocker(input, "vendor_trade"),
          stringBlocker(input, "description"),
          stringBlocker(input, "priority"),
          stringBlocker(input, "expected_status"),
        );
        if (blocker) return blocker;
        return RENTVINE_STATUSES.has(String(input.values.expected_status))
          ? null
          : "Unknown Rentvine resulting status.";
      }
      case "rentvine.work_order.assign_vendor": {
        const blocker = firstBlocker(
          stringBlocker(input, "work_order_id"),
          stringBlocker(input, "current_vendor"),
          stringBlocker(input, "target_vendor"),
          stringBlocker(input, "current_status"),
          stringBlocker(input, "reason"),
        );
        if (blocker) return blocker;
        if (!RENTVINE_STATUSES.has(String(input.values.current_status))) {
          return "Unknown Rentvine current status.";
        }
        return String(input.values.current_vendor) === String(input.values.target_vendor)
          ? "Rentvine target Vendor must differ from the current Vendor."
          : null;
      }
      case "rentvine.work_order.update_status": {
        const blocker = firstBlocker(
          stringBlocker(input, "work_order_id"),
          stringBlocker(input, "current_status"),
          stringBlocker(input, "target_status"),
        );
        if (blocker) return blocker;
        const transition = `${input.values.current_status}->${input.values.target_status}`;
        if (!ALLOWED_TRANSITIONS.has(transition)) {
          return "Rentvine work-order transition is not allowed.";
        }
        if (
          input.values.target_status === "Closed" &&
          (input.values.completion_evidence !== true ||
            input.values.financial_checks_passed !== true ||
            input.values.owner_checks_passed !== true)
        ) {
          return "Completion evidence and configured financial/owner checks are required before close.";
        }
        return null;
      }
      default:
        return "Rentvine work-order executor received the wrong action key.";
    }
  }

  async execute(input: ExternalActionInput) {
    assertValid(this.validate(input));
    switch (input.actionKey) {
      case "rentvine.work_order.create":
        return this.create(input);
      case "rentvine.work_order.assign_vendor":
        return this.assign(input);
      case "rentvine.work_order.update_status":
        return this.updateStatus(input);
      default:
        throw new ExternalExecutionError("Unsupported Rentvine action.", "blocked");
    }
  }

  async reconcile(input: ExternalActionInput) {
    assertValid(this.validate(input));
    const observed = await this.provider.reconcile(idempotencyKey(input));
    return observed && rentvineOutcomeMatches(input, observed)
      ? receipt(input, observed.workOrderRef, observed, true)
      : null;
  }

  private async create(input: ExternalActionInput) {
    const result = await this.provider.create({
      propertyUnitRef: value(input, "property_unit"),
      vendorTradeRef: value(input, "vendor_trade"),
      description: value(input, "description"),
      priority: value(input, "priority"),
      expectedStatus: value(input, "expected_status"),
      idempotencyKey: idempotencyKey(input),
    });
    return this.readAfterWrite(input, result.workOrderRef);
  }

  private async assign(input: ExternalActionInput) {
    const workOrderRef = value(input, "work_order_id");
    const current = await this.provider.read(workOrderRef);
    if (!current) {
      throw new ExternalExecutionError("Rentvine work order was not found.", "blocked");
    }
    const expectedVendor = value(input, "current_vendor");
    if (
      current.status !== value(input, "current_status") ||
      (current.vendorRef ?? "unassigned") !== expectedVendor
    ) {
      throw new ExternalExecutionError("Rentvine work-order state drifted.", "provider");
    }
    const result = await this.provider.assignVendor({
      workOrderRef,
      expectedStatus: value(input, "current_status"),
      expectedVendorRef: expectedVendor,
      vendorRef: value(input, "target_vendor"),
      reason: value(input, "reason"),
      idempotencyKey: idempotencyKey(input),
    });
    if (!result.applied) {
      throw new ExternalExecutionError(
        "Rentvine work order changed before the conditional assignment.",
        "provider",
      );
    }
    if (result.workOrderRef !== workOrderRef) {
      throw new ExternalExecutionError(
        "Rentvine assignment returned a different work order.",
        "ambiguous",
      );
    }
    return this.readAfterWrite(input, workOrderRef);
  }

  private async updateStatus(input: ExternalActionInput) {
    const workOrderRef = value(input, "work_order_id");
    const current = await this.provider.read(workOrderRef);
    if (!current) {
      throw new ExternalExecutionError("Rentvine work order was not found.", "blocked");
    }
    if (current.status !== value(input, "current_status")) {
      throw new ExternalExecutionError("Rentvine work-order state drifted.", "provider");
    }
    const result = await this.provider.updateStatus({
      workOrderRef,
      expectedStatus: value(input, "current_status"),
      targetStatus: value(input, "target_status"),
      idempotencyKey: idempotencyKey(input),
    });
    if (!result.applied) {
      throw new ExternalExecutionError(
        "Rentvine work order changed before the conditional status update.",
        "provider",
      );
    }
    if (result.workOrderRef !== workOrderRef) {
      throw new ExternalExecutionError(
        "Rentvine status update returned a different work order.",
        "ambiguous",
      );
    }
    return this.readAfterWrite(input, workOrderRef);
  }

  private async readAfterWrite(input: ExternalActionInput, workOrderRef: string) {
    if (!workOrderRef.trim()) {
      throw new ExternalExecutionError(
        "Rentvine returned no stable work-order reference.",
        "ambiguous",
      );
    }
    const observed = await this.provider.read(workOrderRef);
    if (
      !observed ||
      observed.workOrderRef !== workOrderRef ||
      !rentvineOutcomeMatches(input, observed)
    ) {
      throw new ExternalExecutionError(
        "Rentvine result requires reconciliation.",
        "ambiguous",
      );
    }
    return receipt(input, workOrderRef, observed);
  }
}

function rentvineOutcomeMatches(
  input: ExternalActionInput,
  observed: RentvineWorkOrderState,
) {
  switch (input.actionKey) {
    case "rentvine.work_order.create":
      return (
        observed.status === input.values.expected_status &&
        observed.propertyUnitRef === input.values.property_unit &&
        observed.vendorTradeRef === input.values.vendor_trade &&
        observed.priority === input.values.priority &&
        observed.descriptionHash === sha256(String(input.values.description).trim())
      );
    case "rentvine.work_order.assign_vendor":
      return (
        observed.workOrderRef === input.values.work_order_id &&
        observed.status === input.values.current_status &&
        observed.vendorRef === input.values.target_vendor
      );
    case "rentvine.work_order.update_status":
      return (
        observed.workOrderRef === input.values.work_order_id &&
        observed.status === input.values.target_status
      );
    default:
      return false;
  }
}

export class MaintenanceOwnerEmailExecutor extends LeaseGmailExecutor {
  constructor(provider: WorkflowMessageProvider) {
    super(provider);
  }

  validate(input: ExternalActionInput) {
    if (
      input.actionKey !== "gmail.maintenance_owner_notice.send" &&
      input.actionKey !== "gmail.thread.reply"
    ) {
      return "Maintenance owner-email executor received the wrong action key.";
    }
    const blocker = firstBlocker(
      stringBlocker(input, "workflow_context"),
      stringBlocker(input, "template_ref"),
      stringBlocker(input, "from"),
      stringBlocker(input, "recipients"),
      stringBlocker(input, "subject"),
      stringBlocker(input, "body"),
      stringBlocker(input, "rfc_message_id"),
      input.actionKey === "gmail.maintenance_owner_notice.send"
        ? stringBlocker(input, "ticket_ref")
        : stringBlocker(input, "thread_ref"),
      input.actionKey === "gmail.maintenance_owner_notice.send"
        ? stringBlocker(input, "recipient_source_ref")
        : null,
      input.actionKey === "gmail.maintenance_owner_notice.send"
        ? stringBlocker(input, "mailbox_source_ref")
        : null,
    );
    if (blocker) return blocker;
    if (
      input.actionKey === "gmail.maintenance_owner_notice.send" &&
      input.values.ticket_ref !== input.workflowId
    ) {
      return "Maintenance owner notice must bind to the current ticket.";
    }
    if (!isEmail(input.values.from) || !isEmail(input.values.recipients)) {
      return "Authoritative owner mailbox and recipient are required.";
    }
    const expectedContextPrefix = `maintenance:${input.workflowId}:`;
    if (
      !String(input.values.workflow_context).startsWith(expectedContextPrefix) ||
      String(input.values.workflow_context).slice(expectedContextPrefix.length).length ===
        0
    ) {
      return "Maintenance workflow context must bind the current ticket and property/unit.";
    }
    if (input.values.template_ref !== "maintenance-owner:v1.0") {
      return "maintenance-owner:v1.0 is required.";
    }
    if (String(input.values.body).length > 20_000) {
      return "Maintenance owner message exceeds the bounded body limit.";
    }
    if (!isRfcMessageId(input.values.rfc_message_id)) {
      return "A server-derived RFC Message-ID is required.";
    }
    return null;
  }

  override async execute(input: ExternalActionInput) {
    assertValid(this.validate(input));
    const result = await super.execute(input);
    if (!result.providerRef.trim()) {
      throw new ExternalExecutionError(
        "Gmail returned no stable message reference.",
        "ambiguous",
      );
    }
    return result;
  }

  override async reconcile(input: ExternalActionInput) {
    assertValid(this.validate(input));
    const result = await super.reconcile(input);
    if (!result) return null;
    if (!result.providerRef.trim()) {
      throw new ExternalExecutionError(
        "Gmail returned no stable reconciliation reference.",
        "ambiguous",
      );
    }
    return { ...result, reconciled: true };
  }
}

export function assertMaintenanceCommunicationNoAuthority(input: {
  proposedEffects?: readonly string[];
}) {
  if (input.proposedEffects?.length) {
    throw new ExternalExecutionError(
      "Communication cannot choose a Vendor, approve cost, or transition a ticket.",
      "blocked",
    );
  }
}

export interface LeadSimpleProcessState {
  processRef: string;
  stageRef: string;
}

export interface LeadSimpleTaskState {
  taskRef: string;
  processRef: string;
  title: string;
  assigneeRef: string;
  dueDate: string;
}

export interface LeadSimpleProvider {
  readProcess(processRef: string): Promise<LeadSimpleProcessState | null>;
  updateStage(input: {
    processRef: string;
    expectedStageRef: string;
    targetStageRef: string;
    idempotencyKey: string;
  }): Promise<{ processRef: string; applied: boolean }>;
  createTask(input: {
    processRef: string;
    taskRef: string;
    title: string;
    assigneeRef: string;
    dueDate: string;
    idempotencyKey: string;
  }): Promise<{ taskRef: string }>;
  readTask(taskRef: string): Promise<LeadSimpleTaskState | null>;
  reconcileStage(idempotencyKey: string): Promise<LeadSimpleProcessState | null>;
  reconcileTask(idempotencyKey: string): Promise<LeadSimpleTaskState | null>;
}

export class LeadSimpleMaintenanceExecutor implements ExternalExecutor {
  constructor(private readonly provider: LeadSimpleProvider) {}

  validate(input: ExternalActionInput) {
    if (input.actionKey === "leadsimple.process.update_stage") {
      const blocker = firstBlocker(
        stringBlocker(input, "process_id"),
        stringBlocker(input, "current_stage"),
        stringBlocker(input, "target_stage"),
      );
      if (blocker) return blocker;
      return input.values.current_stage === input.values.target_stage
        ? "LeadSimple target stage must differ from the current stage."
        : null;
    }
    if (input.actionKey === "leadsimple.task.create") {
      const blocker = firstBlocker(
        stringBlocker(input, "process_id"),
        stringBlocker(input, "task_ref"),
        stringBlocker(input, "task_title"),
        stringBlocker(input, "assignee_ref"),
        stringBlocker(input, "due_date"),
      );
      if (blocker) return blocker;
      return isIsoDate(input.values.due_date)
        ? null
        : "LeadSimple task due date must be an ISO date.";
    }
    return "LeadSimple executor received the wrong action key.";
  }

  async execute(input: ExternalActionInput) {
    assertValid(this.validate(input));
    if (input.actionKey === "leadsimple.process.update_stage") {
      const processRef = value(input, "process_id");
      const current = await this.provider.readProcess(processRef);
      if (
        !current ||
        current.processRef !== processRef ||
        current.stageRef !== input.values.current_stage
      ) {
        throw new ExternalExecutionError("LeadSimple process stage drifted.", "provider");
      }
      const result = await this.provider.updateStage({
        processRef,
        expectedStageRef: value(input, "current_stage"),
        targetStageRef: value(input, "target_stage"),
        idempotencyKey: idempotencyKey(input),
      });
      if (!result.applied) {
        throw new ExternalExecutionError(
          "LeadSimple process changed before the conditional stage update.",
          "provider",
        );
      }
      if (result.processRef !== processRef) {
        throw new ExternalExecutionError(
          "LeadSimple returned a different process.",
          "ambiguous",
        );
      }
      const observed = await this.provider.readProcess(processRef);
      if (!leadSimpleStageMatches(input, observed)) {
        throw new ExternalExecutionError("LeadSimple result is ambiguous.", "ambiguous");
      }
      return receipt(input, result.processRef, observed);
    }

    const processRef = value(input, "process_id");
    const parent = await this.provider.readProcess(processRef);
    if (!parent || parent.processRef !== processRef) {
      throw new ExternalExecutionError(
        "LeadSimple parent process was not found.",
        "blocked",
      );
    }
    const result = await this.provider.createTask({
      processRef,
      taskRef: value(input, "task_ref"),
      title: value(input, "task_title"),
      assigneeRef: value(input, "assignee_ref"),
      dueDate: value(input, "due_date"),
      idempotencyKey: idempotencyKey(input),
    });
    const reviewedTaskRef = value(input, "task_ref");
    if (result.taskRef !== reviewedTaskRef) {
      throw new ExternalExecutionError(
        "LeadSimple returned a different task.",
        "ambiguous",
      );
    }
    const observed = await this.provider.readTask(reviewedTaskRef);
    if (!leadSimpleTaskMatches(input, observed)) {
      throw new ExternalExecutionError(
        "LeadSimple task result is ambiguous.",
        "ambiguous",
      );
    }
    return receipt(input, result.taskRef, observed);
  }

  async reconcile(input: ExternalActionInput) {
    assertValid(this.validate(input));
    if (input.actionKey === "leadsimple.process.update_stage") {
      const observed = await this.provider.reconcileStage(idempotencyKey(input));
      return leadSimpleStageMatches(input, observed)
        ? receipt(input, observed!.processRef, observed, true)
        : null;
    }
    const observed = await this.provider.reconcileTask(idempotencyKey(input));
    return leadSimpleTaskMatches(input, observed)
      ? receipt(input, observed!.taskRef, observed, true)
      : null;
  }
}

function leadSimpleStageMatches(
  input: ExternalActionInput,
  state: LeadSimpleProcessState | null,
) {
  return (
    state?.processRef === input.values.process_id &&
    state.stageRef === input.values.target_stage
  );
}

function leadSimpleTaskMatches(
  input: ExternalActionInput,
  state: LeadSimpleTaskState | null,
) {
  return (
    state?.taskRef === input.values.task_ref &&
    state.processRef === input.values.process_id &&
    state.title === input.values.task_title &&
    state.assigneeRef === input.values.assignee_ref &&
    state.dueDate === input.values.due_date
  );
}

export interface QuickBooksDraftBillState {
  billRef: string;
  status: string;
  vendorRef: string;
  accountRef: string;
  workOrderRef: string;
  propertyUnitRef: string;
  amountCents: number;
  currency: string;
}

export interface QuickBooksDraftBillProvider {
  createDraftBill(input: {
    vendorRef: string;
    accountRef: string;
    workOrderRef: string;
    propertyUnitRef: string;
    amountCents: number;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<{ billRef: string; status: string }>;
  readDraftBill(idempotencyKey: string): Promise<QuickBooksDraftBillState | null>;
}

export class QuickBooksDraftBillExecutor implements ExternalExecutor {
  constructor(private readonly provider: QuickBooksDraftBillProvider) {}

  validate(input: ExternalActionInput) {
    if (input.actionKey !== "quickbooks.bill.create_draft") {
      return "QuickBooks draft-Bill executor received the wrong action key.";
    }
    const blocker = firstBlocker(
      stringBlocker(input, "vendor"),
      stringBlocker(input, "account"),
      stringBlocker(input, "rentvine_work_order_number"),
      stringBlocker(input, "property_unit"),
      stringBlocker(input, "currency"),
    );
    if (blocker) return blocker;
    const amount = input.values.amount;
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > Number.MAX_SAFE_INTEGER
    ) {
      return "Verified positive draft-Bill amount in exact cents is required.";
    }
    return input.values.currency === "USD"
      ? null
      : "QuickBooks draft Bill currency must be USD.";
  }

  async execute(input: ExternalActionInput) {
    assertValid(this.validate(input));
    const expected = quickBooksExpected(input);
    const result = await this.provider.createDraftBill({
      ...expected,
      currency: "USD",
      idempotencyKey: idempotencyKey(input),
    });
    if (result.status !== "Draft") {
      throw new ExternalExecutionError(
        "QuickBooks returned a non-draft Bill state.",
        "ambiguous",
      );
    }
    const observed = await this.provider.readDraftBill(idempotencyKey(input));
    if (
      !observed ||
      observed.billRef !== result.billRef ||
      !quickBooksMatches(observed, expected)
    ) {
      throw new ExternalExecutionError(
        "QuickBooks draft Bill readback does not match the reviewed values.",
        "ambiguous",
      );
    }
    return receipt(input, result.billRef, observed);
  }

  async reconcile(input: ExternalActionInput) {
    assertValid(this.validate(input));
    const expected = quickBooksExpected(input);
    const result = await this.provider.readDraftBill(idempotencyKey(input));
    return result && quickBooksMatches(result, expected)
      ? receipt(input, result.billRef, result, true)
      : null;
  }
}

function quickBooksExpected(input: ExternalActionInput) {
  return {
    vendorRef: value(input, "vendor"),
    accountRef: value(input, "account"),
    workOrderRef: value(input, "rentvine_work_order_number"),
    propertyUnitRef: value(input, "property_unit"),
    amountCents: Number(input.values.amount),
    currency: "USD" as const,
  };
}

function quickBooksMatches(
  result: QuickBooksDraftBillState,
  expected: ReturnType<typeof quickBooksExpected>,
) {
  return (
    result.status === "Draft" &&
    result.vendorRef === expected.vendorRef &&
    result.accountRef === expected.accountRef &&
    result.workOrderRef === expected.workOrderRef &&
    result.propertyUnitRef === expected.propertyUnitRef &&
    result.amountCents === expected.amountCents &&
    result.currency === expected.currency
  );
}

export type VendorLifecycleActionKey =
  | "vendor.account.invite"
  | "vendor.account.disable"
  | "vendor.assignment.change";

export interface VendorInviteResult {
  providerRef: string;
  state: "pending_setup";
  vendorEmail: string;
  ticketRef: string;
}

export interface VendorDisableResult {
  providerRef: string;
  state: "disabled";
  vendorRef: string;
  vendorUid: string;
}

export interface VendorAssignmentResult {
  providerRef: string;
  state: "assigned" | "removed";
  vendorRef: string;
  ticketRef: string;
  operation: "assign" | "remove";
}

export type VendorLifecycleResult =
  | VendorInviteResult
  | VendorDisableResult
  | VendorAssignmentResult;

export interface VendorLifecycleProvider {
  invite(input: {
    email: string;
    ticketRef: string;
    artifactRef: "vendor-invite:v1.0";
    reason: string;
    idempotencyKey: string;
  }): Promise<VendorInviteResult>;
  disable(input: {
    vendorRef: string;
    vendorUid: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<VendorDisableResult>;
  changeAssignment(input: {
    vendorRef: string;
    ticketRef: string;
    operation: "assign" | "remove";
    reason: string;
    idempotencyKey: string;
  }): Promise<VendorAssignmentResult>;
  reconcile(
    actionKey: VendorLifecycleActionKey,
    idempotencyKey: string,
  ): Promise<VendorLifecycleResult | null>;
}

export class VendorLifecycleExecutor implements ExternalExecutor {
  constructor(private readonly provider: VendorLifecycleProvider) {}

  validate(input: ExternalActionInput) {
    const reason = stringBlocker(input, "reason");
    if (reason) return reason;
    if (String(input.values.reason).trim().length < 3) {
      return "A plain-English Vendor lifecycle reason is required.";
    }
    switch (input.actionKey) {
      case "vendor.account.invite":
        if (!isEmail(input.values.vendor_email))
          return "A valid Vendor email is required.";
        {
          const blocker = firstBlocker(
            stringBlocker(input, "ticket_ref"),
            input.values.artifact_ref === "vendor-invite:v1.0"
              ? null
              : "vendor-invite:v1.0 is required.",
          );
          if (blocker) return blocker;
          return input.values.ticket_ref === input.workflowId
            ? null
            : "Vendor invite must bind to the current ticket.";
        }
      case "vendor.account.disable":
        return firstBlocker(
          stringBlocker(input, "vendor_ref"),
          stringBlocker(input, "vendor_uid"),
        );
      case "vendor.assignment.change": {
        const blocker = firstBlocker(
          stringBlocker(input, "vendor_ref"),
          stringBlocker(input, "ticket_ref"),
          stringBlocker(input, "assignment_operation"),
        );
        if (blocker) return blocker;
        if (!["assign", "remove"].includes(String(input.values.assignment_operation))) {
          return "Vendor assignment operation must be assign or remove.";
        }
        return input.values.ticket_ref === input.workflowId
          ? null
          : "Vendor assignment must bind to the current ticket.";
      }
      default:
        return "Vendor lifecycle executor received the wrong action key.";
    }
  }

  async execute(input: ExternalActionInput) {
    assertValid(this.validate(input));
    const reason = value(input, "reason");
    let result: VendorLifecycleResult;
    switch (input.actionKey) {
      case "vendor.account.invite":
        result = await this.provider.invite({
          email: value(input, "vendor_email").toLowerCase(),
          ticketRef: value(input, "ticket_ref"),
          artifactRef: "vendor-invite:v1.0",
          reason,
          idempotencyKey: idempotencyKey(input),
        });
        break;
      case "vendor.account.disable":
        result = await this.provider.disable({
          vendorRef: value(input, "vendor_ref"),
          vendorUid: value(input, "vendor_uid"),
          reason,
          idempotencyKey: idempotencyKey(input),
        });
        break;
      case "vendor.assignment.change":
        result = await this.provider.changeAssignment({
          vendorRef: value(input, "vendor_ref"),
          ticketRef: value(input, "ticket_ref"),
          operation: value(input, "assignment_operation") as "assign" | "remove",
          reason,
          idempotencyKey: idempotencyKey(input),
        });
        break;
      default:
        throw new ExternalExecutionError(
          "Unsupported Vendor lifecycle action.",
          "blocked",
        );
    }
    if (!vendorLifecycleMatches(input, result)) {
      throw new ExternalExecutionError(
        "Vendor lifecycle result is ambiguous.",
        "ambiguous",
      );
    }
    return receipt(input, result.providerRef, result);
  }

  async reconcile(input: ExternalActionInput) {
    assertValid(this.validate(input));
    const result = await this.provider.reconcile(
      input.actionKey as VendorLifecycleActionKey,
      idempotencyKey(input),
    );
    return result && vendorLifecycleMatches(input, result)
      ? receipt(input, result.providerRef, result, true)
      : null;
  }
}

function vendorLifecycleMatches(
  input: ExternalActionInput,
  result: VendorLifecycleResult,
) {
  if (input.actionKey === "vendor.account.invite") {
    return (
      result.state === "pending_setup" &&
      "vendorEmail" in result &&
      result.vendorEmail.toLowerCase() ===
        String(input.values.vendor_email).toLowerCase() &&
      result.ticketRef === input.values.ticket_ref
    );
  }
  if (input.actionKey === "vendor.account.disable") {
    return (
      result.state === "disabled" &&
      "vendorUid" in result &&
      result.vendorRef === input.values.vendor_ref &&
      result.vendorUid === input.values.vendor_uid
    );
  }
  const operation = input.values.assignment_operation;
  return (
    "operation" in result &&
    result.state === (operation === "assign" ? "assigned" : "removed") &&
    result.vendorRef === input.values.vendor_ref &&
    result.ticketRef === input.values.ticket_ref &&
    result.operation === operation
  );
}

export type VendorMailboxActionKey =
  | "vendor.gmail.connect"
  | "vendor.gmail.revoke"
  | "vendor.gmail.health"
  | "vendor.gmail.thread.read"
  | "vendor.gmail.draft.create"
  | "vendor.gmail.thread.reply"
  | "vendor.gmail.label.apply";

export interface VendorMailboxResult {
  providerRef: string;
  vendorRef: string;
  mailbox: string;
  ticketRef?: string;
  threadRef?: string;
  status?: "connected" | "revocation_pending" | "revoked";
  scopes?: readonly VendorOAuthScope[];
  label?: string;
  payloadHash?: string;
  messageId?: string;
}

export interface VendorMailboxExecutionProvider {
  connect(input: {
    vendorRef: string;
    mailbox: string;
    oauthScopes: readonly VendorOAuthScope[];
    redirectUri: string;
    idempotencyKey: string;
  }): Promise<VendorMailboxResult>;
  revoke(input: {
    vendorRef: string;
    mailbox: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<VendorMailboxResult>;
  health(input: {
    vendorRef: string;
    mailbox: string;
    idempotencyKey: string;
  }): Promise<VendorMailboxResult>;
  readThread(input: {
    vendorRef: string;
    mailbox: string;
    ticketRef: string;
    threadRef: string;
    idempotencyKey: string;
  }): Promise<VendorMailboxResult>;
  createDraft(input: {
    vendorRef: string;
    mailbox: string;
    ticketRef: string;
    threadRef: string;
    recipient: string;
    templateRef: string;
    body: string;
    payloadHash: string;
    idempotencyKey: string;
  }): Promise<VendorMailboxResult>;
  sendReply(input: {
    vendorRef: string;
    mailbox: string;
    ticketRef: string;
    threadRef: string;
    recipient: string;
    templateRef: string;
    body: string;
    messageId: string;
    payloadHash: string;
    idempotencyKey: string;
  }): Promise<VendorMailboxResult>;
  applyLabel(input: {
    vendorRef: string;
    mailbox: string;
    ticketRef: string;
    threadRef: string;
    label: string;
    ruleRef: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<VendorMailboxResult>;
  reconcile(
    actionKey: VendorMailboxActionKey,
    idempotencyKey: string,
  ): Promise<VendorMailboxResult | null>;
}

const VENDOR_LABELS = new Set(["PMI/Vendor/Waiting", "PMI/Vendor/Complete"]);
export const VENDOR_TICKET_REPLY_TEMPLATE_REF = "vendor-ticket-reply:v1.0";
export const VENDOR_ASSIGNED_TICKET_LABEL_RULE_REF = "vendor-assigned-ticket-label:v1";
const VENDOR_THREAD_ACTIONS = new Set<VendorMailboxActionKey>([
  "vendor.gmail.thread.read",
  "vendor.gmail.draft.create",
  "vendor.gmail.thread.reply",
  "vendor.gmail.label.apply",
]);

export interface VendorMailboxExecutorOptions {
  /** Exact server-configured OAuth callback. Required whenever this adapter runs in production. */
  expectedRedirectUri?: string;
}

export class VendorMailboxExecutor implements ExternalExecutor {
  constructor(
    private readonly provider: VendorMailboxExecutionProvider,
    private readonly options: VendorMailboxExecutorOptions = {},
  ) {}

  validate(input: ExternalActionInput) {
    if (!isVendorMailboxAction(input.actionKey)) {
      return "Vendor mailbox executor received the wrong action key.";
    }
    const common = firstBlocker(
      stringBlocker(input, "vendor_ref"),
      stringBlocker(input, "mailbox_email"),
    );
    if (common) return common;
    if (!isEmail(input.values.mailbox_email))
      return "A valid Vendor mailbox is required.";
    if (input.actionKey === "vendor.gmail.connect") {
      const blocker = firstBlocker(
        stringBlocker(input, "oauth_scopes"),
        stringBlocker(input, "redirect_uri"),
      );
      if (blocker) return blocker;
      if (!exactVendorOAuthScopes(input.values.oauth_scopes)) {
        return "Vendor OAuth requires the exact approved four-scope set.";
      }
      return isAllowedRedirectUri(
        input.values.redirect_uri,
        this.options.expectedRedirectUri,
      )
        ? null
        : "Vendor OAuth redirect URI must exactly match the approved callback.";
    }
    if (input.actionKey === "vendor.gmail.revoke") {
      return stringBlocker(input, "reason");
    }
    if (VENDOR_THREAD_ACTIONS.has(input.actionKey)) {
      const linked = firstBlocker(
        stringBlocker(input, "ticket_ref"),
        stringBlocker(input, "thread_ref"),
      );
      if (linked) return linked;
      if (input.values.ticket_ref !== input.workflowId) {
        return "Vendor mailbox action must bind to the current assigned ticket.";
      }
      if (
        input.authority?.actor.role === "Vendor" &&
        input.authority.vendor?.assignedTicket !== true
      ) {
        return "Assigned Vendor ticket context is required.";
      }
    }
    if (
      input.actionKey === "vendor.gmail.draft.create" ||
      input.actionKey === "vendor.gmail.thread.reply"
    ) {
      if (!isEmail(input.values.recipient))
        return "A valid linked recipient is required.";
      const body = stringBlocker(input, "body");
      if (body) return body;
      const template = stringBlocker(input, "template_ref");
      if (template) return template;
      if (input.values.template_ref !== VENDOR_TICKET_REPLY_TEMPLATE_REF) {
        return `${VENDOR_TICKET_REPLY_TEMPLATE_REF} is required.`;
      }
      if (String(input.values.body).trim().length > 20_000) {
        return "Vendor mailbox body exceeds the bounded reply limit.";
      }
    }
    if (
      input.actionKey === "vendor.gmail.thread.reply" &&
      !isRfcMessageId(input.values.rfc_message_id)
    ) {
      return "A server-derived RFC Message-ID is required.";
    }
    if (
      input.actionKey === "vendor.gmail.label.apply" &&
      !VENDOR_LABELS.has(String(input.values.suggested_label))
    ) {
      return "Vendor Gmail label is not governed.";
    }
    if (input.actionKey === "vendor.gmail.label.apply") {
      if (input.values.rule_ref !== VENDOR_ASSIGNED_TICKET_LABEL_RULE_REF) {
        return `${VENDOR_ASSIGNED_TICKET_LABEL_RULE_REF} is required.`;
      }
      return firstBlocker(
        stringBlocker(input, "rule_ref"),
        stringBlocker(input, "reason"),
      );
    }
    return null;
  }

  async execute(input: ExternalActionInput) {
    assertValid(this.validate(input));
    const actionKey = input.actionKey as VendorMailboxActionKey;
    const common = {
      vendorRef: value(input, "vendor_ref"),
      mailbox: value(input, "mailbox_email").toLowerCase(),
      idempotencyKey: idempotencyKey(input),
    };
    let result: VendorMailboxResult;
    switch (actionKey) {
      case "vendor.gmail.connect":
        result = await this.provider.connect({
          ...common,
          oauthScopes: exactVendorOAuthScopes(input.values.oauth_scopes)!,
          redirectUri: value(input, "redirect_uri"),
        });
        break;
      case "vendor.gmail.revoke":
        result = await this.provider.revoke({
          ...common,
          reason: value(input, "reason"),
        });
        break;
      case "vendor.gmail.health":
        result = await this.provider.health(common);
        break;
      case "vendor.gmail.thread.read":
        result = await this.provider.readThread({ ...common, ...threadInput(input) });
        break;
      case "vendor.gmail.draft.create": {
        const message = messageInput(input);
        result = await this.provider.createDraft({
          ...common,
          ...threadInput(input),
          ...message,
          templateRef: value(input, "template_ref"),
          payloadHash: vendorPayloadHash(
            common.vendorRef,
            common.mailbox,
            input,
            message,
          ),
        });
        break;
      }
      case "vendor.gmail.thread.reply": {
        const message = messageInput(input);
        result = await this.provider.sendReply({
          ...common,
          ...threadInput(input),
          ...message,
          templateRef: value(input, "template_ref"),
          messageId: value(input, "rfc_message_id"),
          payloadHash: vendorPayloadHash(
            common.vendorRef,
            common.mailbox,
            input,
            message,
          ),
        });
        break;
      }
      case "vendor.gmail.label.apply":
        result = await this.provider.applyLabel({
          ...common,
          ...threadInput(input),
          label: value(input, "suggested_label"),
          ruleRef: value(input, "rule_ref"),
          reason: value(input, "reason"),
        });
        break;
    }
    if (!vendorMailboxMatches(input, result)) {
      throw new ExternalExecutionError(
        "Vendor mailbox result is ambiguous.",
        "ambiguous",
      );
    }
    return receipt(input, result.providerRef, result);
  }

  async reconcile(input: ExternalActionInput) {
    assertValid(this.validate(input));
    const result = await this.provider.reconcile(
      input.actionKey as VendorMailboxActionKey,
      idempotencyKey(input),
    );
    return result && vendorMailboxMatches(input, result)
      ? receipt(input, result.providerRef, result, true)
      : null;
  }
}

function isVendorMailboxAction(key: string): key is VendorMailboxActionKey {
  return (
    key === "vendor.gmail.connect" ||
    key === "vendor.gmail.revoke" ||
    key === "vendor.gmail.health" ||
    key === "vendor.gmail.thread.read" ||
    key === "vendor.gmail.draft.create" ||
    key === "vendor.gmail.thread.reply" ||
    key === "vendor.gmail.label.apply"
  );
}

function threadInput(input: ExternalActionInput) {
  return {
    ticketRef: value(input, "ticket_ref"),
    threadRef: value(input, "thread_ref"),
  };
}

function messageInput(input: ExternalActionInput) {
  return {
    recipient: value(input, "recipient").toLowerCase(),
    body: value(input, "body"),
  };
}

function vendorPayloadHash(
  vendorRef: string,
  mailbox: string,
  input: ExternalActionInput,
  message: ReturnType<typeof messageInput>,
) {
  return payloadHash({
    vendorRef,
    mailbox,
    ticketRef: input.values.ticket_ref,
    threadRef: input.values.thread_ref,
    ...message,
    templateRef: input.values.template_ref,
    ...(input.actionKey === "vendor.gmail.thread.reply"
      ? { messageId: input.values.rfc_message_id }
      : {}),
  });
}

function vendorMailboxMatches(input: ExternalActionInput, result: VendorMailboxResult) {
  if (
    result.vendorRef !== input.values.vendor_ref ||
    result.mailbox.toLowerCase() !== String(input.values.mailbox_email).toLowerCase()
  ) {
    return false;
  }
  if (VENDOR_THREAD_ACTIONS.has(input.actionKey as VendorMailboxActionKey)) {
    if (
      result.ticketRef !== input.values.ticket_ref ||
      result.threadRef !== input.values.thread_ref
    ) {
      return false;
    }
  }
  if (
    input.actionKey === "vendor.gmail.draft.create" ||
    input.actionKey === "vendor.gmail.thread.reply"
  ) {
    const message = messageInput(input);
    if (
      result.payloadHash !==
      vendorPayloadHash(
        String(input.values.vendor_ref),
        String(input.values.mailbox_email).toLowerCase(),
        input,
        message,
      )
    ) {
      return false;
    }
  }
  if (input.actionKey === "vendor.gmail.thread.reply") {
    return result.messageId === input.values.rfc_message_id;
  }
  if (input.actionKey === "vendor.gmail.label.apply") {
    return result.label === input.values.suggested_label;
  }
  if (input.actionKey === "vendor.gmail.connect") {
    return (
      result.status === "connected" && Boolean(exactVendorOAuthScopes(result.scopes))
    );
  }
  if (input.actionKey === "vendor.gmail.revoke") return result.status === "revoked";
  if (input.actionKey === "vendor.gmail.health") {
    return (
      result.status === "connected" ||
      result.status === "revocation_pending" ||
      result.status === "revoked"
    );
  }
  return true;
}

function exactVendorOAuthScopes(raw: unknown): readonly VendorOAuthScope[] | null {
  const scopes = Array.isArray(raw)
    ? raw.filter((scope): scope is string => typeof scope === "string")
    : typeof raw === "string"
      ? raw.split(/\s+/).filter(Boolean)
      : [];
  const unique = [...new Set(scopes)].sort();
  const expected = [...VENDOR_OAUTH_SCOPES].sort();
  return unique.length === expected.length &&
    unique.every((scope, index) => scope === expected[index])
    ? VENDOR_OAUTH_SCOPES
    : null;
}

function isAllowedRedirectUri(raw: unknown, expectedRedirectUri?: string) {
  if (typeof raw !== "string") return false;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash) return false;
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const secure =
      url.protocol === "https:" ||
      (process.env.NODE_ENV !== "production" && url.protocol === "http:" && loopback);
    if (!secure) return false;

    if (expectedRedirectUri) {
      const expected = new URL(expectedRedirectUri);
      return url.href === expected.href;
    }
    // Invented/local callback aliases are useful in the fake harness, but production must
    // receive the exact callback from server configuration.
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}
