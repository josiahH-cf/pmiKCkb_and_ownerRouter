import { createHash } from "node:crypto";

import type {
  ExternalActionInput,
  ExternalActionReceipt,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import { ExternalExecutionError } from "@/lib/external-execution/types";
import {
  LeaseGmailExecutor,
  type WorkflowMessageProvider,
} from "@/lib/lease-renewal/execution/providers";

function value(input: ExternalActionInput, key: string) {
  const current = input.values[key];
  if (typeof current !== "string" || !current.trim()) {
    throw new ExternalExecutionError(`Authoritative ${key} is required.`, "blocked");
  }
  return current.trim();
}

function receipt(
  input: ExternalActionInput,
  providerRef: string,
  observed: unknown,
): ExternalActionReceipt {
  return {
    actionKey: input.actionKey,
    providerRef,
    resultHash: createHash("sha256").update(JSON.stringify(observed)).digest("hex"),
    reconciled: false,
    createdAt: new Date().toISOString(),
  };
}

export interface MaintenancePhotoProvider {
  append(input: {
    ticketRef: string;
    folderRef: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    idempotencyKey: string;
  }): Promise<{ fileRef: string }>;
  reconcile(idempotencyKey: string): Promise<{ fileRef: string } | null>;
}

export class MaintenancePhotoExecutor implements ExternalExecutor {
  constructor(private readonly provider: MaintenancePhotoProvider) {}

  async execute(input: ExternalActionInput) {
    const mimeType = value(input, "mime_type");
    const sizeBytes = input.values.size_bytes;
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      throw new ExternalExecutionError(
        "Maintenance photo MIME type is not allowed.",
        "blocked",
      );
    }
    if (typeof sizeBytes !== "number" || sizeBytes <= 0 || sizeBytes > 10_000_000) {
      throw new ExternalExecutionError(
        "Maintenance photo size is not allowed.",
        "blocked",
      );
    }
    if (
      input.values.assigned_ticket !== true ||
      input.values.malware_scan_passed !== true ||
      input.values.sensitivity_scan_passed !== true ||
      input.values.append_only !== true
    ) {
      throw new ExternalExecutionError(
        "Assigned append-only scanned photo is required.",
        "blocked",
      );
    }
    const result = await this.provider.append({
      ticketRef: value(input, "ticket_ref"),
      folderRef: value(input, "folder_ref"),
      filename: value(input, "server_filename"),
      mimeType,
      sizeBytes,
      idempotencyKey: `${input.workflowId}:${input.actionId}`,
    });
    return receipt(input, result.fileRef, { mimeType, sizeBytes });
  }

  async reconcile(input: ExternalActionInput) {
    const result = await this.provider.reconcile(`${input.workflowId}:${input.actionId}`);
    return result ? receipt(input, result.fileRef, { reconciled: true }) : null;
  }
}

export interface RentvineWorkOrderProvider {
  read(workOrderRef: string): Promise<{ status: string; vendorRef?: string } | null>;
  mutate(input: {
    operation: "create" | "assign" | "status";
    workOrderRef: string;
    target: string;
    idempotencyKey: string;
  }): Promise<{ workOrderRef: string }>;
}

const ALLOWED_TRANSITIONS = new Set([
  "Open->Waiting on Vendor",
  "Waiting on Vendor->Scheduled",
  "Scheduled->Closed",
  "Open->Closed",
]);

export class RentvineWorkOrderExecutor implements ExternalExecutor {
  constructor(private readonly provider: RentvineWorkOrderProvider) {}

  async execute(input: ExternalActionInput) {
    const operation = value(input, "operation");
    if (!(["create", "assign", "status"] as const).includes(operation as never)) {
      throw new ExternalExecutionError(
        "Unsupported Rentvine work-order operation.",
        "blocked",
      );
    }
    const workOrderRef = value(input, "work_order_ref");
    const current =
      operation === "create" ? null : await this.provider.read(workOrderRef);
    if (operation !== "create" && !current) {
      throw new ExternalExecutionError("Rentvine work order was not found.", "blocked");
    }
    const expectedStatus = value(input, "expected_status");
    if (current && current.status !== expectedStatus) {
      throw new ExternalExecutionError("Rentvine work-order state drifted.", "provider");
    }
    const target = value(input, "target");
    if (
      operation === "status" &&
      !ALLOWED_TRANSITIONS.has(`${expectedStatus}->${target}`)
    ) {
      throw new ExternalExecutionError(
        "Rentvine work-order transition is not allowed.",
        "blocked",
      );
    }
    if (target === "Closed" && input.values.completion_evidence !== true) {
      throw new ExternalExecutionError(
        "Completion evidence is required before close.",
        "blocked",
      );
    }
    const result = await this.provider.mutate({
      operation: operation as "create" | "assign" | "status",
      workOrderRef,
      target,
      idempotencyKey: `${input.workflowId}:${input.actionId}`,
    });
    const observed = await this.provider.read(result.workOrderRef);
    if (!observed)
      throw new ExternalExecutionError("Rentvine result is ambiguous.", "ambiguous");
    if (operation === "status" && observed.status !== target) {
      throw new ExternalExecutionError(
        "Rentvine result requires reconciliation.",
        "ambiguous",
      );
    }
    return receipt(input, result.workOrderRef, observed);
  }

  async reconcile(input: ExternalActionInput) {
    const workOrderRef = value(input, "work_order_ref");
    const observed = await this.provider.read(workOrderRef);
    return observed ? receipt(input, workOrderRef, observed) : null;
  }
}

export class MaintenanceOwnerEmailExecutor extends LeaseGmailExecutor {
  constructor(provider: WorkflowMessageProvider) {
    super(provider);
  }

  override async execute(input: ExternalActionInput) {
    if (input.values.artifact_ref !== "maintenance-owner:v1.0") {
      throw new ExternalExecutionError("maintenance-owner:v1.0 is required.", "blocked");
    }
    return super.execute(input);
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

export interface LeadSimpleProvider {
  update(input: {
    processRef: string;
    stageRef: string;
    taskRef: string;
    idempotencyKey: string;
  }): Promise<{ processRef: string }>;
  read(processRef: string): Promise<{ stageRef: string } | null>;
}

export class LeadSimpleMaintenanceExecutor implements ExternalExecutor {
  constructor(private readonly provider: LeadSimpleProvider) {}

  async execute(input: ExternalActionInput) {
    const processRef = value(input, "process_ref");
    const stageRef = value(input, "stage_ref");
    const result = await this.provider.update({
      processRef,
      stageRef,
      taskRef: value(input, "task_ref"),
      idempotencyKey: `${input.workflowId}:${input.actionId}`,
    });
    const observed = await this.provider.read(result.processRef);
    if (!observed || observed.stageRef !== stageRef) {
      throw new ExternalExecutionError("LeadSimple result is ambiguous.", "ambiguous");
    }
    return receipt(input, result.processRef, observed);
  }

  async reconcile(input: ExternalActionInput) {
    const processRef = value(input, "process_ref");
    const observed = await this.provider.read(processRef);
    return observed ? receipt(input, processRef, observed) : null;
  }
}

export interface QuickBooksDraftBillProvider {
  createDraftBill(input: {
    vendorRef: string;
    accountRef: string;
    workOrderRef: string;
    propertyRef: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<{ billRef: string; status: "Draft" }>;
  readDraftBill(
    idempotencyKey: string,
  ): Promise<{ billRef: string; status: "Draft" } | null>;
}

export class QuickBooksDraftBillExecutor implements ExternalExecutor {
  constructor(private readonly provider: QuickBooksDraftBillProvider) {}

  async execute(input: ExternalActionInput) {
    const amountCents = input.values.amount_cents;
    if (!Number.isInteger(amountCents) || Number(amountCents) <= 0) {
      throw new ExternalExecutionError(
        "Verified positive draft-bill amount is required.",
        "blocked",
      );
    }
    const result = await this.provider.createDraftBill({
      vendorRef: value(input, "vendor_ref"),
      accountRef: value(input, "account_ref"),
      workOrderRef: value(input, "work_order_ref"),
      propertyRef: value(input, "property_ref"),
      amountCents: Number(amountCents),
      idempotencyKey: `${input.workflowId}:${input.actionId}`,
    });
    if (result.status !== "Draft") {
      throw new ExternalExecutionError(
        "QuickBooks returned a non-draft bill state.",
        "ambiguous",
      );
    }
    return receipt(input, result.billRef, { status: result.status });
  }

  async reconcile(input: ExternalActionInput) {
    const result = await this.provider.readDraftBill(
      `${input.workflowId}:${input.actionId}`,
    );
    return result?.status === "Draft" ? receipt(input, result.billRef, result) : null;
  }
}
