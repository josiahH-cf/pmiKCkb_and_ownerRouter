import { createHash } from "node:crypto";

import { DRAFT_BANNER } from "@/lib/constants";
import {
  getGovernedArtifact,
  GMAIL_MANUAL_LABEL_RULE_REF,
} from "@/lib/gmail-hub/governed-artifacts";
import type {
  ExternalActionInput,
  ExternalActionReceipt,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import { externalActionIdempotencyKey } from "@/lib/external-execution/identity";
import { ExternalExecutionError } from "@/lib/external-execution/types";

function stringValue(input: ExternalActionInput, key: string) {
  const value = input.values[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ExternalExecutionError(`Authoritative ${key} is required.`, "blocked");
  }
  return value.trim();
}

function stringBlocker(input: ExternalActionInput, ...keys: string[]) {
  const missing = keys.find((key) => {
    const value = input.values[key];
    return typeof value !== "string" || !value.trim();
  });
  return missing ? `Authoritative ${missing} is required.` : null;
}

function isRfcMessageId(value: unknown): value is string {
  return typeof value === "string" && /^<[^<>\s@]+@[^<>\s@]+>$/.test(value.trim());
}

function receipt(
  input: ExternalActionInput,
  providerRef: string,
  result: unknown,
  outcome: ExternalActionReceipt["outcome"] = "succeeded",
  reconciled = false,
): ExternalActionReceipt {
  return {
    actionKey: input.actionKey,
    providerRef,
    resultHash: createHash("sha256").update(JSON.stringify(result)).digest("hex"),
    reconciled,
    outcome,
    createdAt: new Date().toISOString(),
  };
}

export type WorkflowMessageOperation =
  | "draft"
  | "send"
  | "reply"
  | "label"
  | "portal"
  | "sms";

export interface WorkflowMessagePayload {
  operation: WorkflowMessageOperation;
  artifactRef?: string;
  recipient?: string;
  /** Comma-joined authoritative Cc recipients (F-LEASE-6 co-tenants), carried verbatim into the readback. */
  cc?: string;
  sender?: string;
  subject?: string;
  body?: string;
  threadRef?: string;
  label?: string;
  consentRef?: string;
}

export interface WorkflowMessageReadback {
  providerRef: string;
  rfcMessageId?: string;
  consentRef?: string;
  /** Payload fetched back from the provider after the mutation or lookup. */
  payload: WorkflowMessagePayload;
}

export interface WorkflowMessageProvider {
  execute(
    input: WorkflowMessagePayload & {
      expectedRfcMessageId?: string;
      idempotencyKey: string;
    },
  ): Promise<WorkflowMessageReadback>;
  reconcile(input: {
    actionKey: string;
    idempotencyKey: string;
  }): Promise<WorkflowMessageReadback | null>;
  verifySmsConsent(input: {
    consentRef: string;
    recipient: string;
    sender: string;
    workflowContext: string;
  }): Promise<boolean>;
}

const GOVERNED_LABELS = new Set([
  "Waiting on Outside",
  "Waiting on Team",
  "Dan Decision",
  "Draft Ready",
]);

export class LeaseGmailExecutor implements ExternalExecutor {
  constructor(private readonly provider: WorkflowMessageProvider) {}

  validate(input: ExternalActionInput) {
    const operation = operationFor(input.actionKey);
    if (!operation) return "Unsupported governed communication action.";
    if (operation === "label") {
      const missing = stringBlocker(
        input,
        "thread_ref",
        "workflow_context",
        "suggested_label",
        "rule_ref",
        "reason",
      );
      if (missing) return missing;
      if (!GOVERNED_LABELS.has(String(input.values.suggested_label))) {
        return "The label is outside the governed allowlist.";
      }
      if (input.values.rule_ref !== GMAIL_MANUAL_LABEL_RULE_REF) {
        return "The approved manual label rule is required.";
      }
      return null;
    }

    const recipientKey =
      input.actionKey === "gmail.thread.reply" ||
      input.actionKey === "gmail.maintenance_owner_notice.send"
        ? "recipients"
        : "recipient";
    // The renewal draft/send and the maintenance owner-notice DRAFT both key the recipient as `to`
    // (matching their Action Registry preview schemas); every other governed action uses recipient(s).
    const actualRecipientKey =
      input.actionKey.startsWith("gmail.renewal_notice") ||
      input.actionKey === "gmail.maintenance_owner_notice.draft_create"
        ? "to"
        : recipientKey;
    const missing = stringBlocker(
      input,
      "workflow_context",
      "template_ref",
      actualRecipientKey,
      "body",
    );
    if (missing) return missing;
    try {
      getGovernedArtifact(String(input.values.template_ref));
    } catch {
      return "An exact approved S24 artifact is required.";
    }
    const body = String(input.values.body);
    if (body.length > 20_000) return "The governed message body is too large.";
    if (operation === "sms" && body.length > 1_600) {
      return "The governed SMS body exceeds the bounded message limit.";
    }
    if ((operation === "reply" || operation === "portal") && !text(input, "thread_ref")) {
      return "The linked workflow thread is required.";
    }
    if (
      operation === "draft" &&
      (input.values.draft_banner_present !== true ||
        !body.startsWith(`${DRAFT_BANNER}\n\n`))
    ) {
      return "The review-before-sending draft banner is required.";
    }
    if (
      (operation === "send" || operation === "reply") &&
      !isRfcMessageId(input.values.rfc_message_id)
    ) {
      return "An exact RFC Message-ID is required for send readback.";
    }
    if (operation === "sms" && stringBlocker(input, "consent_ref", "sender")) {
      return "Trusted SMS consent and sender references are required.";
    }
    if (
      (operation === "draft" || operation === "send") &&
      (!text(input, "recipient_source_ref") || !text(input, "mailbox_source_ref"))
    ) {
      return "Authoritative recipient and mailbox sources are required.";
    }
    return null;
  }

  async execute(input: ExternalActionInput) {
    const blocker = this.validate(input);
    if (blocker) throw new ExternalExecutionError(blocker, "blocked");
    const operation = operationFor(input.actionKey)!;
    const expectedPayload = workflowMessagePayload(input, operation);
    const recipient = expectedPayload.recipient;
    const expectedRfcMessageId =
      operation === "send" || operation === "reply"
        ? text(input, "rfc_message_id")
        : undefined;
    const consentRef = text(input, "consent_ref");
    if (operation === "sms") {
      const sender = stringValue(input, "sender");
      const smsRecipient = stringValue(input, "recipient");
      const consentVerified = await this.provider.verifySmsConsent({
        consentRef: stringValue(input, "consent_ref"),
        recipient: smsRecipient,
        sender,
        workflowContext: stringValue(input, "workflow_context"),
      });
      if (!consentVerified) {
        throw new ExternalExecutionError(
          "The SMS consent source did not authorize this exact recipient and sender.",
          "provider",
        );
      }
    }
    const result = await this.provider.execute({
      ...expectedPayload,
      ...(expectedRfcMessageId ? { expectedRfcMessageId } : {}),
      idempotencyKey: externalActionIdempotencyKey(input),
    });
    if (expectedRfcMessageId && result.rfcMessageId !== expectedRfcMessageId) {
      throw new ExternalExecutionError(
        "The provider readback did not match the exact RFC Message-ID.",
        "ambiguous",
      );
    }
    if (consentRef && result.consentRef !== consentRef) {
      throw new ExternalExecutionError(
        "The provider readback did not bind the trusted SMS consent reference.",
        "ambiguous",
      );
    }
    assertWorkflowMessageReadback(expectedPayload, result.payload);
    return receipt(input, result.providerRef, {
      operation,
      artifactRef: text(input, "template_ref"),
      payloadHash: digest(stableJson(result.payload)),
      recipientHash: recipient ? digest(recipient) : undefined,
    });
  }

  async reconcile(input: ExternalActionInput) {
    const result = await this.provider.reconcile({
      actionKey: input.actionKey,
      idempotencyKey: externalActionIdempotencyKey(input),
    });
    if (!result) return null;
    const operation = operationFor(input.actionKey);
    if (!operation) {
      throw new ExternalExecutionError(
        "Unsupported governed communication action.",
        "blocked",
      );
    }
    const expectedPayload = workflowMessagePayload(input, operation);
    const expectedRfcMessageId =
      operation === "send" || operation === "reply"
        ? text(input, "rfc_message_id")
        : undefined;
    if (expectedRfcMessageId && result.rfcMessageId !== expectedRfcMessageId) {
      throw new ExternalExecutionError(
        "Reconciliation found a different RFC Message-ID.",
        "ambiguous",
      );
    }
    if (
      input.actionKey === "sms.renewal_message.send" &&
      result.consentRef !== text(input, "consent_ref")
    ) {
      throw new ExternalExecutionError(
        "Reconciliation did not bind the trusted SMS consent reference.",
        "ambiguous",
      );
    }
    assertWorkflowMessageReadback(expectedPayload, result.payload);
    return receipt(
      input,
      result.providerRef,
      { payloadHash: digest(stableJson(result.payload)), reconciled: true },
      "succeeded",
      true,
    );
  }
}

export interface SheetCellProvider {
  resolveCell(input: {
    tab: string;
    rowKey: string;
    column: string;
  }): Promise<{ cell: string; value: string }>;
  compareAndSetCell(input: {
    cell: string;
    expectedValue: string;
    value: string;
    idempotencyKey: string;
  }): Promise<{ applied: boolean }>;
  readCell(cell: string): Promise<string>;
}

export class RenewalSheetExecutor implements ExternalExecutor {
  constructor(private readonly provider: SheetCellProvider) {}

  validate(input: ExternalActionInput) {
    return stringBlocker(
      input,
      "tab",
      "row_key",
      "column",
      "before_value",
      "after_value",
      "source_of_value",
      "verification_link",
    );
  }

  async execute(input: ExternalActionInput) {
    const blocker = this.validate(input);
    if (blocker) throw new ExternalExecutionError(blocker, "blocked");
    const expected = stringValue(input, "before_value");
    const next = stringValue(input, "after_value");
    const resolved = await this.provider.resolveCell({
      tab: stringValue(input, "tab"),
      rowKey: stringValue(input, "row_key"),
      column: stringValue(input, "column"),
    });
    if (
      resolved.value !== expected ||
      (await this.provider.readCell(resolved.cell)) !== expected
    ) {
      throw new ExternalExecutionError("Sheet cell drifted before write.", "provider");
    }
    const write = await this.provider.compareAndSetCell({
      cell: resolved.cell,
      expectedValue: expected,
      value: next,
      idempotencyKey: externalActionIdempotencyKey(input),
    });
    if (!write.applied) {
      throw new ExternalExecutionError(
        "Sheet cell changed before the conditional write.",
        "provider",
      );
    }
    if ((await this.provider.readCell(resolved.cell)) !== next) {
      throw new ExternalExecutionError(
        "Sheet write requires reconciliation.",
        "ambiguous",
      );
    }
    return receipt(input, resolved.cell, {
      before: digest(expected),
      after: digest(next),
      rowKey: digest(stringValue(input, "row_key")),
    });
  }

  async reconcile(input: ExternalActionInput) {
    const resolved = await this.provider.resolveCell({
      tab: stringValue(input, "tab"),
      rowKey: stringValue(input, "row_key"),
      column: stringValue(input, "column"),
    });
    return (await this.provider.readCell(resolved.cell)) ===
      stringValue(input, "after_value")
      ? receipt(input, resolved.cell, { reconciled: true }, "succeeded", true)
      : null;
  }
}

export interface RenewalMutationProvider {
  compareAndSetRenewal(input: {
    recordRef: string;
    expectedLeaseRef: string;
    expectedCurrentRent: number;
    values: Readonly<Record<string, string | number | boolean>>;
    idempotencyKey: string;
  }): Promise<{ providerRef: string; applied: boolean }>;
  read(providerRef: string): Promise<Readonly<Record<string, unknown>> | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<{
    providerRef: string;
    values: Readonly<Record<string, unknown>>;
  } | null>;
}

export class RentvineRenewalExecutor implements ExternalExecutor {
  constructor(private readonly provider: RenewalMutationProvider) {}

  validate(input: ExternalActionInput) {
    const missing = stringBlocker(input, "lease_ref", "effective_date", "lease_end_date");
    if (missing) return missing;
    for (const key of ["current_rent", "new_rent", "fee_cents"] as const) {
      const value = input.values[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return `Authoritative ${key} must be a non-negative number.`;
      }
    }
    return null;
  }

  async execute(input: ExternalActionInput) {
    const blocker = this.validate(input);
    if (blocker) throw new ExternalExecutionError(blocker, "blocked");
    const recordRef = stringValue(input, "lease_ref");
    const before = await this.provider.read(recordRef);
    if (
      !before ||
      before.lease_ref !== recordRef ||
      before.current_rent !== input.values.current_rent
    ) {
      throw new ExternalExecutionError(
        "Rentvine lease or current rent drifted before write.",
        "provider",
      );
    }
    const idempotencyKey = externalActionIdempotencyKey(input);
    const result = await this.provider.compareAndSetRenewal({
      recordRef,
      expectedLeaseRef: recordRef,
      expectedCurrentRent: input.values.current_rent as number,
      values: input.values,
      idempotencyKey,
    });
    if (!result.applied) {
      throw new ExternalExecutionError(
        "Rentvine lease changed before the conditional renewal write.",
        "provider",
      );
    }
    const observed = await this.provider.read(result.providerRef);
    if (!observed)
      throw new ExternalExecutionError("Rentvine result is ambiguous.", "ambiguous");
    if (observed.lease_ref !== recordRef) {
      throw new ExternalExecutionError("Rentvine lease identity drifted.", "ambiguous");
    }
    for (const key of [
      "new_rent",
      "effective_date",
      "lease_end_date",
      "fee_cents",
    ] as const) {
      if (observed[key] !== input.values[key]) {
        throw new ExternalExecutionError("Rentvine readback drifted.", "ambiguous");
      }
    }
    return receipt(input, result.providerRef, observed);
  }

  async reconcile(input: ExternalActionInput) {
    const found = await this.provider.findByIdempotencyKey(
      externalActionIdempotencyKey(input),
    );
    if (!found) return null;
    const leaseRef = stringValue(input, "lease_ref");
    if (
      found.values.lease_ref !== leaseRef ||
      ["new_rent", "effective_date", "lease_end_date", "fee_cents"].some(
        (key) => found.values[key] !== input.values[key],
      )
    ) {
      throw new ExternalExecutionError(
        "Rentvine reconciliation readback did not match the exact renewal.",
        "ambiguous",
      );
    }
    return receipt(input, found.providerRef, found.values, "succeeded", true);
  }
}

export interface DotloopProvider {
  createLoop(input: {
    templateRef: string;
    participantRefs: readonly string[];
    idempotencyKey: string;
  }): Promise<{ loopRef: string }>;
  uploadDocument(input: {
    loopRef: string;
    documentRef: string;
    documentType: string;
    contentHash: string;
    idempotencyKey: string;
  }): Promise<{ documentRef: string }>;
  reconcile(input: {
    actionKey: string;
    idempotencyKey: string;
  }): Promise<{ providerRef: string } | null>;
}

export class DotloopRenewalExecutor implements ExternalExecutor {
  constructor(private readonly provider: DotloopProvider) {}

  validate(input: ExternalActionInput) {
    if (input.actionKey === "dotloop.loop.create_from_template") {
      const missing = stringBlocker(
        input,
        "workflow_context",
        "template_ref",
        "participant_refs",
      );
      if (missing) return missing;
      return splitRefs(String(input.values.participant_refs)).length
        ? null
        : "Dotloop participants are required.";
    }
    if (input.actionKey === "dotloop.document.upload") {
      return stringBlocker(
        input,
        "loop_ref",
        "document_ref",
        "document_type",
        "content_hash",
      );
    }
    return "Unsupported Dotloop action.";
  }

  async execute(input: ExternalActionInput) {
    const blocker = this.validate(input);
    if (blocker) throw new ExternalExecutionError(blocker, "blocked");
    const idempotencyKey = externalActionIdempotencyKey(input);
    if (input.actionKey === "dotloop.loop.create_from_template") {
      const result = await this.provider.createLoop({
        templateRef: stringValue(input, "template_ref"),
        participantRefs: splitRefs(stringValue(input, "participant_refs")),
        idempotencyKey,
      });
      return receipt(input, result.loopRef, { templateRef: input.values.template_ref });
    }
    const result = await this.provider.uploadDocument({
      loopRef: stringValue(input, "loop_ref"),
      documentRef: stringValue(input, "document_ref"),
      documentType: stringValue(input, "document_type"),
      contentHash: stringValue(input, "content_hash"),
      idempotencyKey,
    });
    return receipt(input, result.documentRef, {
      loopRef: digest(stringValue(input, "loop_ref")),
      contentHash: input.values.content_hash,
    });
  }

  async reconcile(input: ExternalActionInput) {
    const result = await this.provider.reconcile({
      actionKey: input.actionKey,
      idempotencyKey: externalActionIdempotencyKey(input),
    });
    return result
      ? receipt(input, result.providerRef, { reconciled: true }, "succeeded", true)
      : null;
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

  validate(input: ExternalActionInput) {
    if (typeof input.values.applicable !== "boolean") {
      return "Explicit Boom applicability is required.";
    }
    return stringBlocker(input, "resident_ref", "rule_ref");
  }

  async execute(input: ExternalActionInput) {
    const blocker = this.validate(input);
    if (blocker) throw new ExternalExecutionError(blocker, "blocked");
    if (input.values.applicable === false) {
      return receipt(
        input,
        "not-applicable",
        { rule: input.values.rule_ref },
        "not_applicable",
      );
    }
    const result = await this.provider.enroll({
      residentRef: stringValue(input, "resident_ref"),
      idempotencyKey: externalActionIdempotencyKey(input),
    });
    return receipt(input, result.enrollmentRef, { applicable: true });
  }

  async reconcile(input: ExternalActionInput) {
    const result = await this.provider.reconcile(externalActionIdempotencyKey(input));
    return result
      ? receipt(input, result.enrollmentRef, { reconciled: true }, "succeeded", true)
      : null;
  }
}

function operationFor(actionKey: string): WorkflowMessageOperation | null {
  switch (actionKey) {
    case "gmail.renewal_notice.draft_create":
    case "gmail.maintenance_owner_notice.draft_create":
    case "vendor.gmail.draft.create":
      return "draft";
    case "gmail.renewal_notice.send":
    case "gmail.maintenance_owner_notice.send":
      return "send";
    case "gmail.thread.reply":
    case "vendor.gmail.thread.reply":
      return "reply";
    case "gmail.label.apply":
    case "vendor.gmail.label.apply":
      return "label";
    case "rentvine.renewal.portal_message.send":
      return "portal";
    case "sms.renewal_message.send":
      return "sms";
    default:
      return null;
  }
}

function text(input: ExternalActionInput, key: string) {
  const value = input.values[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function workflowMessagePayload(
  input: ExternalActionInput,
  operation: WorkflowMessageOperation,
): WorkflowMessagePayload {
  const recipient =
    text(input, "to") ?? text(input, "recipients") ?? text(input, "recipient");
  return {
    operation,
    ...(text(input, "template_ref") ? { artifactRef: text(input, "template_ref") } : {}),
    ...(recipient ? { recipient } : {}),
    ...(text(input, "cc") ? { cc: text(input, "cc") } : {}),
    ...(text(input, "from") || text(input, "sender")
      ? { sender: text(input, "from") ?? text(input, "sender") }
      : {}),
    ...(text(input, "subject") ? { subject: text(input, "subject") } : {}),
    ...(text(input, "body") ? { body: text(input, "body") } : {}),
    ...(text(input, "thread_ref") ? { threadRef: text(input, "thread_ref") } : {}),
    ...(text(input, "suggested_label") ? { label: text(input, "suggested_label") } : {}),
    ...(text(input, "consent_ref") ? { consentRef: text(input, "consent_ref") } : {}),
  };
}

function assertWorkflowMessageReadback(
  expected: WorkflowMessagePayload,
  actual: WorkflowMessagePayload,
) {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new ExternalExecutionError(
      "The provider-fetched message payload did not match the exact reviewed payload.",
      "ambiguous",
    );
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function splitRefs(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
