import { createHash } from "node:crypto";

import { ExternalExecutionError } from "@/lib/external-execution/types";

export const LIVE_VENDOR_LIFECYCLE_ACTION_KEYS = [
  "vendor.account.invite",
  "vendor.account.disable",
  "vendor.assignment.change",
] as const;

export const LIVE_VENDOR_IDENTITY_CLAIM_COLLECTION = "vendor_lifecycle_identity_claims";

export const LIVE_VENDOR_NO_ASSIGNMENT_REF = "vendor:none";

export type LiveVendorLifecycleActionKey =
  (typeof LIVE_VENDOR_LIFECYCLE_ACTION_KEYS)[number];

export type LiveVendorInviteMode = "initial" | "delivery_recovery" | "setup_link_reissue";

export type LiveVendorDisableMode = "initial" | "firebase_completion_recovery";

/**
 * One owner must retain the completion claim for longer than a complete bounded Firebase Admin
 * mutation/readback sequence. The pinned client can spend more than two minutes inside one retried
 * Auth RPC, and each adapter method performs several RPCs. Fifteen minutes keeps takeover outside
 * that retry envelope; recovery remains immediate when the current owner is durably ambiguous.
 */
export const LIVE_VENDOR_DISABLE_COMPLETION_LEASE_MS = 15 * 60 * 1000;
export const LIVE_VENDOR_INVITE_READBACK_LEASE_MS = 15 * 60 * 1000;

export const LIVE_VENDOR_DISABLE_INITIAL_SOURCE = {
  accessDisabledAt: "cutoff:new",
  completionGeneration: 0,
  completionLeaseExpiresAt: "lease:new",
  completionOwnerExecutionId: "owner:new",
  completionOwnerS20ExecutionId: "owner-s20:new",
  rootExecutionId: "execution:new",
  rootS20ExecutionId: "s20:new",
} as const;

export interface LiveVendorLifecycleRuntimeContext {
  environment: "production";
  dataMode: "live";
}

export interface LiveVendorInviteInput {
  actorUid: string;
  company: string;
  email: string;
  ticketRef: string;
  ticketUpdatedAt: string;
  artifactRef: "vendor-invite:v1.0";
  inviteMode: LiveVendorInviteMode;
  inviteVersion: number;
  vendorRef: string;
  vendorUid: string;
  vendorStatus: "none" | "pending_setup";
  vendorUpdatedAt: string;
  reason: string;
  idempotencyKey: string;
}

export interface LiveVendorDisableInput {
  actorUid: string;
  disableMode: LiveVendorDisableMode;
  vendorRef: string;
  vendorUid: string;
  company: string;
  email: string;
  currentStatus: string;
  vendorUpdatedAt: string;
  activeAssignmentRefs: string;
  mailboxState: string;
  mailboxTokenRefHash: string;
  rootExecutionId: string;
  rootS20ExecutionId: string;
  accessDisabledAt: string;
  completionGeneration: number;
  completionOwnerExecutionId: string;
  completionOwnerS20ExecutionId: string;
  completionLeaseExpiresAt: string;
  reason: string;
  idempotencyKey: string;
}

export interface LiveVendorAssignmentInput {
  actorUid: string;
  vendorRef: string;
  vendorUid: string;
  company: string;
  email: string;
  vendorUpdatedAt: string;
  ticketRef: string;
  ticketUpdatedAt: string;
  currentVendorRef: string;
  targetVendorRef: string;
  operation: "assign" | "remove";
  reason: string;
  idempotencyKey: string;
}

export type LiveVendorInviteActionProjectionInput = Pick<
  LiveVendorInviteInput,
  | "artifactRef"
  | "company"
  | "email"
  | "inviteMode"
  | "inviteVersion"
  | "reason"
  | "ticketRef"
  | "ticketUpdatedAt"
  | "vendorRef"
  | "vendorStatus"
  | "vendorUid"
  | "vendorUpdatedAt"
>;

export type LiveVendorAssignmentActionProjectionInput = Pick<
  LiveVendorAssignmentInput,
  | "company"
  | "currentVendorRef"
  | "email"
  | "operation"
  | "reason"
  | "targetVendorRef"
  | "ticketRef"
  | "ticketUpdatedAt"
  | "vendorRef"
  | "vendorUid"
  | "vendorUpdatedAt"
>;

export type LiveVendorDisableActionProjectionInput = Pick<
  LiveVendorDisableInput,
  | "accessDisabledAt"
  | "activeAssignmentRefs"
  | "company"
  | "completionGeneration"
  | "completionLeaseExpiresAt"
  | "completionOwnerExecutionId"
  | "completionOwnerS20ExecutionId"
  | "currentStatus"
  | "disableMode"
  | "email"
  | "mailboxState"
  | "mailboxTokenRefHash"
  | "reason"
  | "rootExecutionId"
  | "rootS20ExecutionId"
  | "vendorRef"
  | "vendorUid"
  | "vendorUpdatedAt"
>;

/**
 * Canonical S26 preview projections shared by source resolution, the provider-start guard, and
 * fixtures. Numeric generations are strings because that is the validated external-action shape.
 */
export function liveVendorInviteActionValues(
  input: LiveVendorInviteActionProjectionInput,
) {
  return {
    artifact_ref: input.artifactRef,
    invite_mode: input.inviteMode,
    invite_version: String(input.inviteVersion),
    reason: input.reason,
    ticket_ref: input.ticketRef,
    ticket_updated_at: input.ticketUpdatedAt,
    vendor_company: input.company,
    vendor_email: input.email,
    vendor_ref: input.vendorRef,
    vendor_status: input.vendorStatus,
    vendor_uid: input.vendorUid,
    vendor_updated_at: input.vendorUpdatedAt,
  } as const;
}

export function liveVendorAssignmentActionValues(
  input: LiveVendorAssignmentActionProjectionInput,
) {
  return {
    assignment_operation: input.operation,
    current_vendor_ref: input.currentVendorRef,
    reason: input.reason,
    target_vendor_ref: input.targetVendorRef,
    ticket_ref: input.ticketRef,
    ticket_updated_at: input.ticketUpdatedAt,
    vendor_company: input.company,
    vendor_email: input.email,
    vendor_ref: input.vendorRef,
    vendor_uid: input.vendorUid,
    vendor_updated_at: input.vendorUpdatedAt,
  } as const;
}

export function liveVendorDisableActionValues(
  input: LiveVendorDisableActionProjectionInput,
) {
  return {
    access_disabled_at: input.accessDisabledAt,
    active_assignment_refs: input.activeAssignmentRefs,
    completion_generation: String(input.completionGeneration),
    completion_lease_expires_at: input.completionLeaseExpiresAt,
    completion_owner_execution_ref: input.completionOwnerExecutionId,
    completion_owner_s20_execution_ref: input.completionOwnerS20ExecutionId,
    disable_mode: input.disableMode,
    mailbox_state: input.mailboxState,
    mailbox_token_ref_hash: input.mailboxTokenRefHash,
    reason: input.reason,
    root_execution_ref: input.rootExecutionId,
    root_s20_execution_ref: input.rootS20ExecutionId,
    vendor_company: input.company,
    vendor_email: input.email,
    vendor_ref: input.vendorRef,
    vendor_status: input.currentStatus,
    vendor_uid: input.vendorUid,
    vendor_updated_at: input.vendorUpdatedAt,
  } as const;
}

export interface LiveVendorInviteResult {
  providerRef: string;
  state: "pending_setup";
  vendorCompany: string;
  vendorEmail: string;
  ticketRef: string;
}

/**
 * Terminal, bodyless proof that Gmail accepted the exact invite after the Vendor's Live access
 * cutoff won. The delivery remains historical evidence only: it never reopens setup or changes the
 * disabled Vendor projection.
 */
export interface LiveVendorInviteInvalidatedResult {
  providerRef: string;
  state: "delivery_invalidated";
  reasonCode: "disabled_during_invite_delivery";
  executionId: string;
  s20ExecutionId: string;
  idempotencyKeyHash: string;
  deliveryRefHash: string;
  vendorRef: string;
  ticketRef: string;
}

export interface LiveVendorDisableResult {
  providerRef: string;
  state: "disabled";
  vendorRef: string;
  vendorUid: string;
  vendorCompany: string;
  vendorEmail: string;
  clearedAssignmentRefs: string;
  mailboxState: string;
}

export interface LiveVendorAssignmentResult {
  providerRef: string;
  state: "assigned" | "removed";
  vendorRef: string;
  vendorCompany: string;
  vendorEmail: string;
  ticketRef: string;
  currentVendorRef: string;
  targetVendorRef: string;
  operation: "assign" | "remove";
}

/**
 * Reconciliation-only proof that a consumed corrective invite made no new client-facing delivery:
 * either its exact superseded delivery already exists, or exact absence readback activated only the
 * internal recovery reservation. Every field is a stable identifier or hash; no address, message
 * body, setup link, token, or plaintext reason crosses this boundary.
 */
export interface LiveVendorInviteNotApplicableResult {
  providerRef: string;
  state: "not_applicable";
  outcome: "not_applicable";
  attemptFenced: true;
  reasonCode: "prior_invite_already_delivered" | "prior_invite_absent_recovery_activated";
  correctiveExecutionId: string;
  correctiveS20ExecutionId: string;
  idempotencyKeyHash: string;
  supersededExecutionId: string;
  supersededS20ExecutionId: string;
  supersessionHash: string;
}

export type LiveVendorLifecycleResult =
  | LiveVendorInviteResult
  | LiveVendorInviteInvalidatedResult
  | LiveVendorInviteNotApplicableResult
  | LiveVendorDisableResult
  | LiveVendorAssignmentResult;

export type LiveVendorLifecycleState =
  | "running"
  | "ambiguous"
  | "succeeded"
  | "superseded";

/**
 * Setup challenges expire no later than 24 hours. A second exact-confirmed invite may replace an
 * unobserved delivery claim only after this window, so an old setup link cannot remain usable.
 */
export const LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS = 24 * 60 * 60 * 1000;

export type LiveVendorLifecyclePhase =
  | "identity_reserved"
  | "identity_effect_claimed"
  | "identity_ready"
  | "recovery_readback"
  | "recovery_abandoned"
  | "delivery_claimed"
  | "delivery_effect_started"
  | "delivery_invalidated"
  | "access_disabled"
  | "succeeded";

interface BaseBindings {
  vendorRef: string;
  vendorUid: string;
  emailHash: string;
  companyHash: string;
}

export interface LiveVendorInviteBindings extends BaseBindings {
  kind: "invite";
  inviteMode: LiveVendorInviteMode;
  issuedInviteVersion: number;
  inviteVersion: number;
  vendorUpdatedAt: string;
  ticketRef: string;
  ticketUpdatedAt: string;
  artifactRef: "vendor-invite:v1.0";
  rfcMessageId: string;
  supersededExecutionId?: string;
  supersededS20ExecutionId?: string;
  supersessionHash?: string;
}

export interface LiveVendorAssignmentBindings extends BaseBindings {
  kind: "assignment";
  vendorUpdatedAt: string;
  ticketRef: string;
  ticketUpdatedAt: string;
  currentVendorRef: string;
  targetVendorRef: string;
  operation: "assign" | "remove";
}

export interface LiveVendorDisableBindings extends BaseBindings {
  kind: "disable";
  disableMode: LiveVendorDisableMode;
  currentStatus: string;
  vendorUpdatedAt: string;
  activeAssignmentRefs: string;
  mailboxState: string;
  mailboxTokenRefHash: string;
  rootExecutionId: string;
  rootS20ExecutionId: string;
  accessDisabledAt: string;
  completionGeneration: number;
  completionOwnerExecutionId: string;
  completionOwnerS20ExecutionId: string;
  completionLeaseExpiresAt: string;
  issuedCompletionGeneration: number;
  issuedCompletionLeaseExpiresAt: string;
}

export type LiveVendorLifecycleBindings =
  | LiveVendorInviteBindings
  | LiveVendorAssignmentBindings
  | LiveVendorDisableBindings;

/**
 * This receipt is deliberately bodyless. It stores stable references and hashes only: never a
 * reason, contact-address body, setup URL/token, password, OAuth token, or TOTP material.
 */
export interface LiveVendorLifecycleReceipt {
  schemaVersion: 1;
  id: string;
  executionId: string;
  actionKey: LiveVendorLifecycleActionKey;
  providerRef: string;
  resultHash: string;
  vendorRef: string;
  state: "pending_setup" | "delivery_invalidated" | "assigned" | "removed" | "disabled";
  ticketRef?: string;
  currentVendorRef?: string;
  targetVendorRef?: string;
  operation?: "assign" | "remove";
  clearedAssignmentRefs?: string;
  mailboxState?: string;
  deliveryRefHash?: string;
  reconciled: boolean;
  createdAt: string;
}

/**
 * Server-only idempotency ledger. Raw idempotency keys and contact addresses are excluded; callers
 * resolve the record by recomputing its deterministic document id.
 */
export interface LiveVendorLifecycleExecutionRecord {
  schemaVersion: 1;
  id: string;
  s20ExecutionId: string;
  actionKey: LiveVendorLifecycleActionKey;
  idempotencyKeyHash: string;
  payloadHash: string;
  actorUid: string;
  environment: "production";
  dataMode: "live";
  state: LiveVendorLifecycleState;
  phase: LiveVendorLifecyclePhase;
  attemptCount: 1;
  bindings: LiveVendorLifecycleBindings;
  accessDisabledAt?: string;
  deliveryClaimedAt?: string;
  deliveryEffectStartedAt?: string;
  invalidatedDeliveryRefHash?: string;
  /** Hash-only ownership token for the one exact Gmail recovery readback worker. */
  recoveryReadbackWorkerTokenHash?: string;
  recoveryReadbackWorkerClaimedAt?: string;
  recoveryReadbackWorkerLeaseExpiresAt?: string;
  /** Hash-only ownership token for the single Firebase completion worker. */
  completionWorkerTokenHash?: string;
  completionWorkerClaimedAt?: string;
  supersededByExecutionId?: string;
  lastErrorCode?: string;
  receipt?: LiveVendorLifecycleReceipt;
  createdAt: string;
  updatedAt: string;
}

const LIVE_VENDOR_RECEIPT_HASH = /^[a-f0-9]{64}$/;
const LIVE_VENDOR_S20_EXECUTION_ID = /^exec_[a-f0-9]{40}$/;

/**
 * Strict trust-boundary parser for a persisted terminal lifecycle receipt.
 *
 * A receipt is not authority merely because its discriminant says `succeeded`. Recompute its
 * bodyless result hash from the immutable execution bindings and require every persisted field,
 * deterministic reference, timestamp, and execution link to agree before hydration or S20 can
 * consume it.
 */
export function parseLiveVendorLifecycleReceipt(
  record: Readonly<LiveVendorLifecycleExecutionRecord>,
): Readonly<LiveVendorLifecycleReceipt> {
  const receipt = record.receipt as
    | (LiveVendorLifecycleReceipt & Record<string, unknown>)
    | undefined;
  const createdAt = exactCanonicalReceiptIso(
    record.createdAt,
    "Vendor lifecycle execution creation",
  );
  const updatedAt = exactCanonicalReceiptIso(
    record.updatedAt,
    "Vendor lifecycle execution update",
  );
  if (
    record.state !== "succeeded" ||
    record.phase !== "succeeded" ||
    !receipt ||
    !LIVE_VENDOR_RECEIPT_HASH.test(record.id) ||
    !LIVE_VENDOR_S20_EXECUTION_ID.test(record.s20ExecutionId) ||
    !LIVE_VENDOR_RECEIPT_HASH.test(record.idempotencyKeyHash) ||
    !LIVE_VENDOR_RECEIPT_HASH.test(record.payloadHash) ||
    createdAt > updatedAt ||
    receipt.schemaVersion !== 1 ||
    receipt.id !== liveVendorLifecycleReceiptId(record.id) ||
    receipt.executionId !== record.id ||
    receipt.actionKey !== record.actionKey ||
    receipt.vendorRef !== record.bindings.vendorRef ||
    receipt.createdAt !== record.updatedAt ||
    typeof receipt.reconciled !== "boolean" ||
    !LIVE_VENDOR_RECEIPT_HASH.test(receipt.resultHash)
  ) {
    throw invalidLiveVendorReceipt();
  }
  exactCanonicalReceiptIso(receipt.createdAt, "Vendor lifecycle receipt creation");

  let expectedProviderRef: string;
  let expectedResultHash: string;
  let expectedKeys: readonly string[];

  if (
    record.actionKey === "vendor.account.invite" &&
    record.bindings.kind === "invite" &&
    (receipt.state === "pending_setup" || receipt.state === "delivery_invalidated") &&
    receipt.ticketRef === record.bindings.ticketRef &&
    typeof receipt.deliveryRefHash === "string" &&
    LIVE_VENDOR_RECEIPT_HASH.test(receipt.deliveryRefHash)
  ) {
    expectedKeys = [
      "actionKey",
      "createdAt",
      "deliveryRefHash",
      "executionId",
      "id",
      "providerRef",
      "reconciled",
      "resultHash",
      "schemaVersion",
      "state",
      "ticketRef",
      "vendorRef",
    ];
    if (receipt.state === "pending_setup") {
      if (record.invalidatedDeliveryRefHash !== undefined) {
        throw invalidLiveVendorReceipt();
      }
      expectedProviderRef = record.bindings.vendorRef;
      expectedResultHash = sha256(
        JSON.stringify({
          actionKey: record.actionKey,
          deliveryRefHash: receipt.deliveryRefHash,
          inviteMode: record.bindings.inviteMode,
          inviteVersion: record.bindings.issuedInviteVersion,
          state: "pending_setup",
          ticketRef: record.bindings.ticketRef,
          vendorRef: record.bindings.vendorRef,
        }),
      );
    } else {
      if (
        record.invalidatedDeliveryRefHash !== receipt.deliveryRefHash ||
        record.lastErrorCode !== "disabled_during_invite_delivery"
      ) {
        throw invalidLiveVendorReceipt();
      }
      expectedProviderRef = `vendor-invite-delivery-invalidated:${record.id}`;
      expectedResultHash = sha256(
        JSON.stringify({
          actionKey: record.actionKey,
          deliveryRefHash: receipt.deliveryRefHash,
          executionId: record.id,
          idempotencyKeyHash: record.idempotencyKeyHash,
          reasonCode: "disabled_during_invite_delivery",
          s20ExecutionId: record.s20ExecutionId,
          state: "delivery_invalidated",
          ticketRef: record.bindings.ticketRef,
          vendorRef: record.bindings.vendorRef,
        }),
      );
    }
  } else if (
    record.actionKey === "vendor.assignment.change" &&
    record.bindings.kind === "assignment" &&
    receipt.state === (record.bindings.operation === "assign" ? "assigned" : "removed") &&
    receipt.ticketRef === record.bindings.ticketRef &&
    receipt.currentVendorRef === record.bindings.currentVendorRef &&
    receipt.targetVendorRef === record.bindings.targetVendorRef &&
    receipt.operation === record.bindings.operation
  ) {
    expectedProviderRef = `vendor-assignment-${record.id}`;
    expectedKeys = [
      "actionKey",
      "createdAt",
      "currentVendorRef",
      "executionId",
      "id",
      "operation",
      "providerRef",
      "reconciled",
      "resultHash",
      "schemaVersion",
      "state",
      "targetVendorRef",
      "ticketRef",
      "vendorRef",
    ];
    if (receipt.reconciled) {
      throw invalidLiveVendorReceipt();
    }
    expectedResultHash = sha256(
      JSON.stringify({
        actionKey: record.actionKey,
        currentVendorRef: record.bindings.currentVendorRef,
        operation: record.bindings.operation,
        providerRef: expectedProviderRef,
        state: receipt.state,
        targetVendorRef: record.bindings.targetVendorRef,
        ticketRef: record.bindings.ticketRef,
        vendorRef: record.bindings.vendorRef,
      }),
    );
  } else if (
    record.actionKey === "vendor.account.disable" &&
    record.bindings.kind === "disable" &&
    receipt.state === "disabled" &&
    receipt.clearedAssignmentRefs === record.bindings.activeAssignmentRefs &&
    receipt.mailboxState === record.bindings.mailboxState
  ) {
    expectedProviderRef = record.bindings.vendorRef;
    expectedKeys = [
      "actionKey",
      "clearedAssignmentRefs",
      "createdAt",
      "executionId",
      "id",
      "mailboxState",
      "providerRef",
      "reconciled",
      "resultHash",
      "schemaVersion",
      "state",
      "vendorRef",
    ];
    expectedResultHash = sha256(
      JSON.stringify({
        accessDisabledAt: record.bindings.accessDisabledAt,
        actionKey: record.actionKey,
        clearedAssignmentRefs: record.bindings.activeAssignmentRefs,
        disableMode: record.bindings.disableMode,
        mailboxState: record.bindings.mailboxState,
        mailboxTokenRefHash: record.bindings.mailboxTokenRefHash,
        rootExecutionId: record.bindings.rootExecutionId,
        rootS20ExecutionId: record.bindings.rootS20ExecutionId,
        state: "disabled",
        vendorRef: record.bindings.vendorRef,
      }),
    );
  } else {
    throw invalidLiveVendorReceipt();
  }

  if (
    receipt.providerRef !== expectedProviderRef ||
    receipt.resultHash !== expectedResultHash ||
    !sameExactKeys(receipt, expectedKeys)
  ) {
    throw invalidLiveVendorReceipt();
  }
  return Object.freeze({ ...receipt });
}

/**
 * Validates terminal topology on every persisted execution read while allowing nonterminal
 * one-attempt records to continue through their existing fail-closed state machine.
 */
export function parseOptionalLiveVendorLifecycleReceipt(
  record: Readonly<LiveVendorLifecycleExecutionRecord>,
): Readonly<LiveVendorLifecycleReceipt> | undefined {
  if (
    record.state !== "succeeded" &&
    record.phase !== "succeeded" &&
    record.receipt === undefined
  ) {
    return undefined;
  }
  return parseLiveVendorLifecycleReceipt(record);
}

function exactCanonicalReceiptIso(value: unknown, label: string): number {
  if (typeof value !== "string") {
    throw new LiveVendorLifecycleConflictError(`${label} timestamp is invalid.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new LiveVendorLifecycleConflictError(`${label} timestamp is invalid.`);
  }
  return timestamp;
}

function sameExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
) {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function invalidLiveVendorReceipt() {
  return new LiveVendorLifecycleConflictError(
    "Vendor lifecycle receipt does not match its immutable source snapshot.",
  );
}

export interface LiveVendorProjection {
  id: string;
  uid: string;
  email: string;
  company: string;
  status: "pending_setup" | "active" | "disabled";
  inviteVersion: number;
  dataMode: "live";
  updatedAt: string;
}

export interface LiveVendorAuthPrincipal {
  uid: string;
  email: string;
  emailVerified: boolean;
  disabled: boolean;
  customClaims: Readonly<Record<string, unknown>>;
}

/**
 * The Firebase adapter must create/read the deterministic uid and refuse to adopt an email already
 * owned by any other uid. It may repair missing exact Vendor claims only for that deterministic,
 * server-reserved uid.
 */
export interface LiveVendorAuthAdapter {
  ensureVendorPrincipal(input: {
    uid: string;
    email: string;
    vendorRef: string;
    customClaims: {
      vendor: true;
      vendor_id: string;
      data_mode: "live";
    };
  }): Promise<LiveVendorAuthPrincipal>;
  disableUser(uid: string, expectedEmail: string): Promise<void>;
  revokeRefreshTokens(uid: string, expectedEmail: string): Promise<void>;
  readDisableState(
    uid: string,
    expectedEmail: string,
    revokedAfter: string,
  ): Promise<{ disabled: boolean; refreshTokensRevoked: boolean }>;
}

export interface LiveVendorInviteDelivery {
  providerMessageRef: string;
  rfcMessageId: string;
  recipientHash: string;
}

/**
 * This is intentionally narrower than GmailRuntimeClient. The adapter owns setup-challenge
 * creation and MIME construction; neither a setup URL nor a message body may cross back into the
 * lifecycle provider or ledger.
 */
export interface LiveVendorInviteDeliveryAdapter {
  sendInvite(input: {
    recipientEmail: string;
    recipientHash: string;
    company: string;
    vendorRef: string;
    vendorUid: string;
    inviteVersion: number;
    lifecycleExecutionId: string;
    challengeExpiresAt: string;
    ticketRef: string;
    artifactRef: "vendor-invite:v1.0";
    rfcMessageId: string;
  }): Promise<LiveVendorInviteDelivery>;
  /**
   * A Gmail ids-only search is insufficient. Implementations must fetch/inspect the found
   * message's headers and return only after both RFC Message-ID and exact To recipient match.
   */
  findInviteByRfcMessageId(input: {
    rfcMessageId: string;
    recipientEmail: string;
    recipientHash: string;
  }): Promise<LiveVendorInviteDelivery | null>;
}

export interface ClaimLiveVendorInviteInput {
  command: LiveVendorInviteInput;
  executionId: string;
  payloadHash: string;
  vendorRef: string;
  vendorUid: string;
  rfcMessageId: string;
  nowIso: string;
}

export interface CommitLiveVendorAssignmentInput {
  command: LiveVendorAssignmentInput;
  executionId: string;
  payloadHash: string;
  providerRef: string;
  nowIso: string;
}

export interface DisableLiveVendorAccessInput {
  command: LiveVendorDisableInput;
  executionId: string;
  payloadHash: string;
  nowIso: string;
}

export interface LiveVendorLifecycleStore {
  readonly persistence: "firestore";
  getExecution(
    actionKey: LiveVendorLifecycleActionKey,
    idempotencyKey: string,
  ): Promise<LiveVendorLifecycleExecutionRecord | null>;
  getExecutionByS20ExecutionId(
    s20ExecutionId: string,
  ): Promise<LiveVendorLifecycleExecutionRecord | null>;
  getInviteReservation(email: string): Promise<LiveVendorLifecycleExecutionRecord | null>;
  getVendor(vendorRef: string): Promise<LiveVendorProjection | null>;
  claimInvite(
    input: ClaimLiveVendorInviteInput,
  ): Promise<LiveVendorLifecycleExecutionRecord>;
  supersedeInvite(
    input: ClaimLiveVendorInviteInput & {
      supersededExecutionId: string;
    },
  ): Promise<LiveVendorLifecycleExecutionRecord>;
  reissueSetupLink(
    input: ClaimLiveVendorInviteInput & {
      predecessorExecutionId: string;
    },
  ): Promise<LiveVendorLifecycleExecutionRecord>;
  claimInviteRecovery(
    input: ClaimLiveVendorInviteInput & {
      supersededExecutionId: string;
    },
  ): Promise<LiveVendorLifecycleExecutionRecord>;
  activateInviteRecovery(input: {
    executionId: string;
    payloadHash: string;
    workerToken: string;
    nowIso: string;
  }): Promise<LiveVendorLifecycleExecutionRecord>;
  claimInviteRecoveryReadbackWorker(input: {
    executionId: string;
    payloadHash: string;
    workerToken: string;
    nowIso: string;
  }): Promise<{
    claimed: boolean;
    record: LiveVendorLifecycleExecutionRecord;
  }>;
  releaseInviteRecoveryReadbackWorker(input: {
    executionId: string;
    payloadHash: string;
    workerToken: string;
    nowIso: string;
  }): Promise<boolean>;
  resolveInviteRecoveryDelivered(input: {
    executionId: string;
    payloadHash: string;
    deliveryRefHash: string;
    workerToken: string;
    nowIso: string;
  }): Promise<{
    recovery: LiveVendorLifecycleExecutionRecord;
    delivered: LiveVendorLifecycleExecutionRecord;
  }>;
  abandonActivatedInviteRecovery(input: {
    executionId: string;
    payloadHash: string;
    nowIso: string;
  }): Promise<{
    abandoned: boolean;
    record: LiveVendorLifecycleExecutionRecord;
  }>;
  claimInvitePrincipalEffect(input: {
    executionId: string;
    payloadHash: string;
    nowIso: string;
  }): Promise<{
    claimed: boolean;
    record: LiveVendorLifecycleExecutionRecord;
  }>;
  markInvitePrincipalReady(input: {
    executionId: string;
    payloadHash: string;
    nowIso: string;
  }): Promise<LiveVendorLifecycleExecutionRecord>;
  claimInviteDelivery(input: {
    executionId: string;
    payloadHash: string;
    nowIso: string;
  }): Promise<{
    record: LiveVendorLifecycleExecutionRecord;
    claimed: boolean;
  }>;
  claimInviteDeliveryEffect(input: {
    executionId: string;
    payloadHash: string;
    nowIso: string;
  }): Promise<{
    record: LiveVendorLifecycleExecutionRecord;
    claimed: boolean;
  }>;
  completeInvite(input: {
    executionId: string;
    payloadHash: string;
    deliveryRefHash: string;
    reconciled: boolean;
    nowIso: string;
  }): Promise<LiveVendorLifecycleExecutionRecord>;
  commitAssignment(
    input: CommitLiveVendorAssignmentInput,
  ): Promise<LiveVendorLifecycleExecutionRecord>;
  disableAccess(
    input: DisableLiveVendorAccessInput,
  ): Promise<LiveVendorLifecycleExecutionRecord>;
  claimDisableCompletionRecovery(
    input: DisableLiveVendorAccessInput,
  ): Promise<LiveVendorLifecycleExecutionRecord>;
  claimDisableCompletionWorker(input: {
    executionId: string;
    payloadHash: string;
    workerToken: string;
    nowIso: string;
  }): Promise<{
    claimed: boolean;
    record: LiveVendorLifecycleExecutionRecord;
  }>;
  renewDisableCompletionLease(input: {
    executionId: string;
    payloadHash: string;
    workerToken: string;
    nowIso: string;
  }): Promise<LiveVendorLifecycleExecutionRecord>;
  completeDisable(input: {
    executionId: string;
    payloadHash: string;
    workerToken: string;
    reconciled: boolean;
    nowIso: string;
  }): Promise<LiveVendorLifecycleExecutionRecord>;
  completeDisableFromReadback(input: {
    executionId: string;
    payloadHash: string;
    nowIso: string;
  }): Promise<LiveVendorLifecycleExecutionRecord>;
  markAmbiguous(input: {
    executionId: string;
    payloadHash: string;
    errorCode: string;
    nowIso: string;
  }): Promise<LiveVendorLifecycleExecutionRecord>;
}

export class LiveVendorLifecycleConflictError extends ExternalExecutionError {
  readonly status = 409;

  constructor(message: string) {
    super(message, "provider");
    this.name = "LiveVendorLifecycleConflictError";
  }
}

export class LiveVendorLifecycleAmbiguousError extends Error {
  readonly code = "vendor_lifecycle_ambiguous";

  constructor(message = "Vendor lifecycle outcome requires reconciliation.") {
    super(message);
    this.name = "LiveVendorLifecycleAmbiguousError";
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeLiveVendorEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^@\s]+@[^@\s]+$/.test(normalized)) {
    throw new LiveVendorLifecycleConflictError("A valid Vendor email is required.");
  }
  return normalized;
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new LiveVendorLifecycleConflictError(`${label} is required.`);
  }
  return normalized;
}

function canonicalHash(value: Readonly<Record<string, unknown>>): string {
  return sha256(JSON.stringify(value));
}

export function liveVendorLifecycleExecutionId(
  actionKey: LiveVendorLifecycleActionKey,
  idempotencyKey: string,
): string {
  required(idempotencyKey, "Vendor lifecycle idempotency key");
  // Do not trim the key before hashing. The document id binds the exact byte sequence supplied by
  // the S20 execution identity: action key + NUL + idempotency key.
  return sha256(`${actionKey}\0${idempotencyKey}`);
}

export function liveVendorS20ExecutionId(
  actionKey: LiveVendorLifecycleActionKey,
  idempotencyKey: string,
): string {
  required(idempotencyKey, "Vendor lifecycle idempotency key");
  return `exec_${sha256(`external-action:v1\0${actionKey}\0${idempotencyKey}`).slice(
    0,
    40,
  )}`;
}

export function liveVendorLifecycleReceiptId(executionId: string): string {
  return sha256(`${required(executionId, "Execution id")}\0receipt`);
}

export function liveVendorLifecycleAuditId(executionId: string, event: string): string {
  return sha256(
    `${required(executionId, "Execution id")}\0${required(event, "Audit event")}`,
  );
}

export function liveVendorIdentityClaimId(email: string): string {
  return sha256(normalizeLiveVendorEmail(email));
}

export function liveVendorInviteDerivedRefs(idempotencyKey: string): {
  executionId: string;
  vendorRef: string;
  vendorUid: string;
  rfcMessageId: string;
} {
  const executionId = liveVendorLifecycleExecutionId(
    "vendor.account.invite",
    idempotencyKey,
  );
  return {
    executionId,
    vendorRef: `vendor-live-${executionId.slice(0, 32)}`,
    vendorUid: `vendor_live_${executionId.slice(0, 32)}`,
    rfcMessageId: liveVendorInviteRfcMessageId(executionId),
  };
}

export function liveVendorInviteRfcMessageId(executionId: string): string {
  if (!/^[a-f0-9]{64}$/.test(executionId)) {
    throw new LiveVendorLifecycleConflictError(
      "Vendor invite execution identity is invalid.",
    );
  }
  return `<vendor-invite-${executionId}@pmikcmetro.com>`;
}

export function liveVendorAssignmentProviderRef(idempotencyKey: string): string {
  return `vendor-assignment-${liveVendorLifecycleExecutionId(
    "vendor.assignment.change",
    idempotencyKey,
  )}`;
}

export function hashLiveVendorInvitePayload(input: LiveVendorInviteInput): string {
  return canonicalHash({
    actionKey: "vendor.account.invite",
    actorUid: required(input.actorUid, "Vendor lifecycle actor"),
    artifactRef: input.artifactRef,
    company: required(input.company, "Vendor company"),
    dataMode: "live",
    email: normalizeLiveVendorEmail(input.email),
    environment: "production",
    inviteMode: input.inviteMode,
    inviteVersion: input.inviteVersion,
    reasonHash: sha256(required(input.reason, "Vendor invite reason")),
    ticketRef: required(input.ticketRef, "Initial ticket"),
    ticketUpdatedAt: required(input.ticketUpdatedAt, "Ticket generation"),
    vendorRef: required(input.vendorRef, "Vendor"),
    vendorStatus: input.vendorStatus,
    vendorUid: required(input.vendorUid, "Vendor uid"),
    vendorUpdatedAt: required(input.vendorUpdatedAt, "Vendor generation"),
  });
}

export function hashLiveVendorAssignmentPayload(
  input: LiveVendorAssignmentInput,
): string {
  return canonicalHash({
    actionKey: "vendor.assignment.change",
    actorUid: required(input.actorUid, "Vendor lifecycle actor"),
    company: required(input.company, "Vendor company"),
    currentVendorRef: required(input.currentVendorRef, "Current Vendor"),
    dataMode: "live",
    email: normalizeLiveVendorEmail(input.email),
    environment: "production",
    operation: input.operation,
    reasonHash: sha256(required(input.reason, "Vendor assignment reason")),
    targetVendorRef: required(input.targetVendorRef, "Target Vendor"),
    ticketRef: required(input.ticketRef, "Maintenance ticket"),
    ticketUpdatedAt: required(input.ticketUpdatedAt, "Ticket generation"),
    vendorRef: required(input.vendorRef, "Vendor"),
    vendorUid: required(input.vendorUid, "Vendor uid"),
    vendorUpdatedAt: required(input.vendorUpdatedAt, "Vendor generation"),
  });
}

export function hashLiveVendorDisablePayload(input: LiveVendorDisableInput): string {
  return canonicalHash({
    accessDisabledAt: required(input.accessDisabledAt, "Vendor access cutoff generation"),
    actionKey: "vendor.account.disable",
    activeAssignmentRefs: required(
      input.activeAssignmentRefs,
      "Active assignment references",
    ),
    actorUid: required(input.actorUid, "Vendor lifecycle actor"),
    company: required(input.company, "Vendor company"),
    completionGeneration: input.completionGeneration,
    completionLeaseExpiresAt: required(
      input.completionLeaseExpiresAt,
      "Vendor disable completion lease",
    ),
    completionOwnerExecutionId: required(
      input.completionOwnerExecutionId,
      "Vendor disable completion owner",
    ),
    completionOwnerS20ExecutionId: required(
      input.completionOwnerS20ExecutionId,
      "Vendor disable completion S20 owner",
    ),
    currentStatus: required(input.currentStatus, "Current Vendor status"),
    dataMode: "live",
    disableMode: input.disableMode,
    email: normalizeLiveVendorEmail(input.email),
    environment: "production",
    mailboxState: required(input.mailboxState, "Vendor mailbox state"),
    mailboxTokenRefHash: required(
      input.mailboxTokenRefHash,
      "Vendor mailbox token reference hash",
    ),
    reasonHash: sha256(required(input.reason, "Vendor disable reason")),
    rootExecutionId: required(input.rootExecutionId, "Vendor disable root execution"),
    rootS20ExecutionId: required(
      input.rootS20ExecutionId,
      "Vendor disable root S20 execution",
    ),
    vendorRef: required(input.vendorRef, "Vendor"),
    vendorUid: required(input.vendorUid, "Vendor uid"),
    vendorUpdatedAt: required(input.vendorUpdatedAt, "Vendor generation"),
  });
}

export function canonicalLiveAssignmentRefs(ticketRefs: readonly string[]): string {
  const refs = Array.from(
    new Set(ticketRefs.map((ref) => required(ref, "Ticket reference"))),
  ).sort();
  return JSON.stringify(refs);
}

export function hashLiveVendorContact(value: string): string {
  return sha256(value.trim());
}

export function assertExactLiveVendorClaims(
  principal: LiveVendorAuthPrincipal,
  input: { uid: string; email: string; vendorRef: string },
): void {
  const claims = principal.customClaims;
  const keys = Object.keys(claims).sort();
  if (
    principal.uid !== input.uid ||
    normalizeLiveVendorEmail(principal.email) !== normalizeLiveVendorEmail(input.email) ||
    principal.disabled ||
    keys.length !== 3 ||
    keys[0] !== "data_mode" ||
    keys[1] !== "vendor" ||
    keys[2] !== "vendor_id" ||
    claims.vendor !== true ||
    claims.vendor_id !== input.vendorRef ||
    claims.data_mode !== "live"
  ) {
    throw new LiveVendorLifecycleConflictError(
      "Firebase did not return the exact scoped Live Vendor authority.",
    );
  }
}
