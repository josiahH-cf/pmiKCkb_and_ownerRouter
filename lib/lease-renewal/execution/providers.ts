import { createHash } from "node:crypto";

import type {
  ExternalActionInput,
  ExternalActionReceipt,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import { ExternalExecutionError } from "@/lib/external-execution/types";

function stringValue(input: ExternalActionInput, key: string) {
  const value = input.values[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ExternalExecutionError(`Authoritative ${key} is required.`, "blocked");
  }
  return value.trim();
}

function receipt(
  input: ExternalActionInput,
  providerRef: string,
  result: unknown,
  outcome: ExternalActionReceipt["outcome"] = "succeeded",
): ExternalActionReceipt {
  return {
    actionKey: input.actionKey,
    providerRef,
    resultHash: createHash("sha256").update(JSON.stringify(result)).digest("hex"),
    reconciled: false,
    outcome,
    createdAt: new Date().toISOString(),
  };
}

export interface WorkflowMessageProvider {
  execute(input: {
    recipient: string;
    body: string;
    threadRef?: string;
    idempotencyKey: string;
  }): Promise<{ providerRef: string }>;
  reconcile(idempotencyKey: string): Promise<{ providerRef: string } | null>;
}

export class LeaseGmailExecutor implements ExternalExecutor {
  constructor(private readonly provider: WorkflowMessageProvider) {}

  async execute(input: ExternalActionInput) {
    const recipient = stringValue(input, "recipient");
    const body = stringValue(input, "body");
    const artifactRef = stringValue(input, "artifact_ref");
    if (!artifactRef.endsWith(":v1.0")) {
      throw new ExternalExecutionError("Approved S24 artifact is required.", "blocked");
    }
    const result = await this.provider.execute({
      recipient,
      body,
      ...(typeof input.values.thread_ref === "string"
        ? { threadRef: input.values.thread_ref }
        : {}),
      idempotencyKey: `${input.workflowId}:${input.actionId}`,
    });
    return receipt(input, result.providerRef, { recipient, artifactRef });
  }

  async reconcile(input: ExternalActionInput) {
    const result = await this.provider.reconcile(`${input.workflowId}:${input.actionId}`);
    return result ? receipt(input, result.providerRef, { reconciled: true }) : null;
  }
}

export interface SheetCellProvider {
  readCell(cell: string): Promise<string>;
  writeCell(input: {
    cell: string;
    value: string;
    idempotencyKey: string;
  }): Promise<void>;
}

export class RenewalSheetExecutor implements ExternalExecutor {
  constructor(private readonly provider: SheetCellProvider) {}

  async execute(input: ExternalActionInput) {
    const cell = stringValue(input, "cell");
    const expected = stringValue(input, "expected_value");
    const next = stringValue(input, "next_value");
    if ((await this.provider.readCell(cell)) !== expected) {
      throw new ExternalExecutionError("Sheet cell drifted before write.", "provider");
    }
    await this.provider.writeCell({
      cell,
      value: next,
      idempotencyKey: `${input.workflowId}:${input.actionId}`,
    });
    if ((await this.provider.readCell(cell)) !== next) {
      throw new ExternalExecutionError(
        "Sheet write requires reconciliation.",
        "ambiguous",
      );
    }
    return receipt(input, cell, {
      before: createHash("sha256").update(expected).digest("hex"),
      after: createHash("sha256").update(next).digest("hex"),
    });
  }

  async reconcile(input: ExternalActionInput) {
    const cell = stringValue(input, "cell");
    const next = stringValue(input, "next_value");
    return (await this.provider.readCell(cell)) === next
      ? receipt(input, cell, { reconciled: true })
      : null;
  }
}

export interface RenewalMutationProvider {
  mutate(input: {
    recordRef: string;
    values: Readonly<Record<string, string | number | boolean>>;
    idempotencyKey: string;
  }): Promise<{ providerRef: string }>;
  read(providerRef: string): Promise<Readonly<Record<string, unknown>> | null>;
}

export class RentvineRenewalExecutor implements ExternalExecutor {
  constructor(private readonly provider: RenewalMutationProvider) {}

  async execute(input: ExternalActionInput) {
    if (!input.contractRef?.startsWith("documented:")) {
      throw new ExternalExecutionError("Blocked: vendor contract required.", "blocked");
    }
    const recordRef = stringValue(input, "lease_ref");
    const result = await this.provider.mutate({
      recordRef,
      values: input.values,
      idempotencyKey: `${input.workflowId}:${input.actionId}`,
    });
    const observed = await this.provider.read(result.providerRef);
    if (!observed)
      throw new ExternalExecutionError("Rentvine result is ambiguous.", "ambiguous");
    return receipt(input, result.providerRef, observed);
  }

  async reconcile(input: ExternalActionInput) {
    const providerRef = stringValue(input, "lease_ref");
    const observed = await this.provider.read(providerRef);
    return observed ? receipt(input, providerRef, observed) : null;
  }
}

export interface DotloopProvider {
  createLoop(input: {
    templateRef: string;
    participantRefs: readonly string[];
    documentRefs: readonly string[];
    idempotencyKey: string;
  }): Promise<{ loopRef: string }>;
  reconcile(idempotencyKey: string): Promise<{ loopRef: string } | null>;
}

export class DotloopRenewalExecutor implements ExternalExecutor {
  constructor(private readonly provider: DotloopProvider) {}

  async execute(input: ExternalActionInput) {
    const templateRef = stringValue(input, "template_ref");
    const participantRefs = stringValue(input, "participant_refs")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const documentRefs = stringValue(input, "document_refs")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!participantRefs.length || !documentRefs.length) {
      throw new ExternalExecutionError(
        "Dotloop participants and documents are required.",
        "blocked",
      );
    }
    const idempotencyKey = `${input.workflowId}:${input.actionId}`;
    const result = await this.provider.createLoop({
      templateRef,
      participantRefs,
      documentRefs,
      idempotencyKey,
    });
    return receipt(input, result.loopRef, { templateRef, participantRefs, documentRefs });
  }

  async reconcile(input: ExternalActionInput) {
    const result = await this.provider.reconcile(`${input.workflowId}:${input.actionId}`);
    return result ? receipt(input, result.loopRef, { reconciled: true }) : null;
  }
}

export class RenewalChannelExecutor extends LeaseGmailExecutor {}

export interface BoomProvider {
  enroll(input: {
    residentRef: string;
    idempotencyKey: string;
  }): Promise<{ enrollmentRef: string }>;
  reconcile(idempotencyKey: string): Promise<{ enrollmentRef: string } | null>;
}

export class BoomRenewalExecutor implements ExternalExecutor {
  constructor(private readonly provider: BoomProvider) {}

  async execute(input: ExternalActionInput) {
    const applicable = input.values.applicable;
    if (applicable === false) {
      return receipt(
        input,
        "not-applicable",
        { rule: input.mappingRef },
        "not_applicable",
      );
    }
    if (applicable !== true) {
      throw new ExternalExecutionError(
        "Explicit Boom applicability is required.",
        "blocked",
      );
    }
    const result = await this.provider.enroll({
      residentRef: stringValue(input, "resident_ref"),
      idempotencyKey: `${input.workflowId}:${input.actionId}`,
    });
    return receipt(input, result.enrollmentRef, { applicable: true });
  }

  async reconcile(input: ExternalActionInput) {
    const result = await this.provider.reconcile(`${input.workflowId}:${input.actionId}`);
    return result ? receipt(input, result.enrollmentRef, { reconciled: true }) : null;
  }
}
