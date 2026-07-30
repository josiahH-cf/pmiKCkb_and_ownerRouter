import type {
  DocumentData,
  DocumentSnapshot,
  Firestore,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import type { ExecutionTechnicalGates } from "@/lib/execution/risk-policy";
import { canonicalJson, hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  externalActionContextHash,
  externalActionIdempotencyKey,
} from "@/lib/external-execution/identity";
import type {
  ExternalActionPreparationInput,
  TrustedExternalExecutionContext,
} from "@/lib/external-execution/s20-bridge";
import type {
  ExternalActionInput,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  FirestoreLiveVendorLifecycleStore,
  LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS,
  LIVE_VENDOR_LIFECYCLE_COLLECTIONS,
  type LiveVendorDisableCompletionClaim,
  type LiveVendorPreparedAttemptSnapshot,
} from "@/lib/firestore/vendor-lifecycle-executions";
import { normalizeGmailSubject } from "@/lib/gmail-runtime/subject";
import {
  VendorLifecycleExecutor,
  type VendorLifecycleProvider,
} from "@/lib/maintenance/execution/providers";
import { createLiveVendorLifecycleAdapters } from "@/lib/vendor/live-lifecycle-adapters";
import {
  canonicalLiveAssignmentRefs,
  hashLiveVendorAssignmentPayload,
  hashLiveVendorContact,
  hashLiveVendorDisablePayload,
  hashLiveVendorInvitePayload,
  liveVendorAssignmentActionValues,
  liveVendorDisableActionValues,
  LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS,
  LIVE_VENDOR_DISABLE_INITIAL_SOURCE,
  LIVE_VENDOR_NO_ASSIGNMENT_REF,
  liveVendorIdentityClaimId,
  liveVendorInviteActionValues,
  liveVendorInviteDerivedRefs,
  liveVendorLifecycleExecutionId,
  liveVendorS20ExecutionId,
  normalizeLiveVendorEmail,
  parseOptionalLiveVendorLifecycleReceipt,
  sha256,
  type LiveVendorLifecycleActionKey,
  type LiveVendorDisableBindings,
  type LiveVendorLifecycleExecutionRecord,
} from "@/lib/vendor/live-lifecycle-contract";
import { LiveVendorLifecycleProvider } from "@/lib/vendor/live-lifecycle-provider";
import {
  LiveVendorLifecycleError,
  type LiveVendorLifecycleIntent,
  type LiveVendorLifecycleServiceDeps,
  type LiveVendorLifecycleSourceRequest,
  type LiveVendorLifecycleSourceSelection,
} from "@/lib/vendor/live-lifecycle-service";

const CONTRACT_REF = "vendor-lifecycle-contract:v1";
const MAPPING_REF = "vendor-lifecycle-firestore-map:v1";
const CONNECTION_REFS: Readonly<Record<LiveVendorLifecycleActionKey, string>> = {
  "vendor.account.invite": "firebase-gmail-vendor-lifecycle:production",
  "vendor.account.disable": "firebase-firestore-vendor-lifecycle:production",
  "vendor.assignment.change": "firestore-vendor-assignment:production",
};
const APPROVAL_QUEUE_COLLECTION = "approval_queue_items";
const PRODUCTION_PROJECT_ID = "pmi-kc-kb-prod";
const CURRENT_PRODUCTION_APP_HOST = "pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app";

export interface LiveVendorRuntimeTicket {
  readonly dataMode?: unknown;
  readonly id: string;
  readonly updatedAt?: unknown;
  readonly vendorId?: unknown;
}

export interface LiveVendorRuntimeVendor {
  readonly company?: unknown;
  readonly dataMode?: unknown;
  readonly email?: unknown;
  readonly id: string;
  readonly inviteVersion?: unknown;
  readonly status?: unknown;
  readonly setupEffectInFlight?: unknown;
  readonly uid?: unknown;
  readonly updatedAt?: unknown;
}

export interface LiveVendorRuntimeAssignment {
  readonly active?: unknown;
  readonly dataMode?: unknown;
  readonly ticketId: string;
  readonly updatedAt?: unknown;
  readonly vendorId?: unknown;
}

export interface LiveVendorRuntimeMailbox {
  readonly dataMode?: unknown;
  readonly status?: unknown;
  readonly tokenSecretRef?: unknown;
  readonly vendorId: string;
}

export interface LiveVendorRuntimeIdentityClaim {
  readonly dataMode?: unknown;
  readonly emailHash?: unknown;
  readonly executionId?: unknown;
  readonly schemaVersion?: unknown;
  readonly vendorRef?: unknown;
  readonly vendorUid?: unknown;
}

export interface LiveVendorRuntimeDisableCompletionClaim {
  readonly schemaVersion?: unknown;
  readonly vendorRef: string;
  readonly vendorUid?: unknown;
  readonly rootExecutionId?: unknown;
  readonly rootS20ExecutionId?: unknown;
  readonly accessDisabledAt?: unknown;
  readonly completionGeneration?: unknown;
  readonly ownerExecutionId?: unknown;
  readonly ownerS20ExecutionId?: unknown;
  readonly ownerLeaseExpiresAt?: unknown;
  readonly dataMode?: unknown;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
  readonly completedAt?: unknown;
}

export interface LiveVendorLifecycleSourceReader {
  findApprovalQueueItemIds(executionId: string): Promise<readonly string[]>;
  findVendorsByEmail(email: string): Promise<readonly LiveVendorRuntimeVendor[]>;
  getAssignment(ticketId: string): Promise<LiveVendorRuntimeAssignment | null>;
  getExecutionByS20ExecutionId(
    executionId: string,
  ): Promise<LiveVendorLifecycleExecutionRecord | null>;
  getIdentityClaim(emailHash: string): Promise<LiveVendorRuntimeIdentityClaim | null>;
  getLifecycleExecution(
    executionId: string,
  ): Promise<LiveVendorLifecycleExecutionRecord | null>;
  getPreparedAttempt(
    executionId: string,
  ): Promise<LiveVendorPreparedAttemptSnapshot | null>;
  getInviteReservation(email: string): Promise<LiveVendorLifecycleExecutionRecord | null>;
  getDisableCompletionClaim(
    vendorId: string,
  ): Promise<LiveVendorRuntimeDisableCompletionClaim | null>;
  getMailbox(vendorId: string): Promise<LiveVendorRuntimeMailbox | null>;
  listTicketsForVendor(vendorId: string): Promise<readonly LiveVendorRuntimeTicket[]>;
  getTicket(ticketId: string): Promise<LiveVendorRuntimeTicket | null>;
  getVendor(vendorId: string): Promise<LiveVendorRuntimeVendor | null>;
  listAssignmentsForVendor(
    vendorId: string,
  ): Promise<readonly LiveVendorRuntimeAssignment[]>;
}

export interface LiveVendorLifecycleRuntimeDeps {
  /** Called only while resolving authoritative server sources or an exact Queue link. */
  readonly createSourceReader?: () => LiveVendorLifecycleSourceReader;
  /**
   * Called only from the lazy executor's execute/reconcile method. The default constructs
   * the provider ledger, Firebase/Gmail adapters, and provider at that point.
   */
  readonly createProvider?: () => VendorLifecycleProvider;
  /** Server-only prepared-attempt ledger; constructing it creates no Live provider client. */
  readonly createPreparedAttemptStore?: () => Pick<
    FirestoreLiveVendorLifecycleStore,
    "fencePreparedAttempt" | "persistPreparedAttempt" | "requirePreparedAttempt"
  >;
  readonly resolveTechnicalGates?: (
    actionKey: LiveVendorLifecycleActionKey,
  ) => ExecutionTechnicalGates;
  /** Server clock used only to enforce the setup-challenge expiry before S20 claim. */
  readonly now?: () => Date;
}

export function buildLiveVendorLifecycleServiceDeps(
  runtime: LiveVendorLifecycleRuntimeDeps = {},
): LiveVendorLifecycleServiceDeps {
  const createSourceReader =
    runtime.createSourceReader ??
    (() => new FirestoreLiveVendorLifecycleSourceReader(getAdminFirestore()));
  const createProvider = runtime.createProvider ?? createLiveVendorLifecycleProvider;
  const createPreparedAttemptStore =
    runtime.createPreparedAttemptStore ??
    (() => new FirestoreLiveVendorLifecycleStore(getAdminFirestore()));
  const resolveTechnicalGates =
    runtime.resolveTechnicalGates ?? resolveLiveVendorLifecycleTechnicalGates;
  const now = runtime.now ?? (() => new Date());

  return {
    preparedAttempts: {
      persist: async (actor, input) => {
        const contextHash = requiredPreparedContextHash(input.execution.context_hash);
        await createPreparedAttemptStore().persistPreparedAttempt(actor, {
          contextHash,
          createdAt: input.execution.created_at,
          executionId: input.execution.id,
          previewHash: input.execution.preview_hash,
          selection: input.selection,
        });
      },
      requireUnstarted: async (actor, input) => {
        await createPreparedAttemptStore().requirePreparedAttempt(actor, {
          contextHash: externalActionContextHash(input.selection.action),
          executionId: input.executionId,
          previewHash: input.previewHash,
          selection: input.selection,
        });
      },
      fenceForReconciliation: async (actor, input) =>
        createPreparedAttemptStore().fencePreparedAttempt(actor, {
          contextHash: externalActionContextHash(input.selection.action),
          executionId: input.executionId,
          previewHash: input.previewHash,
          selection: input.selection,
        }),
    },
    resolveLazyExecutor: () => new LazyLiveVendorLifecycleExecutor(createProvider),
    resolveValidator: () => (input) => PURE_VENDOR_LIFECYCLE_EXECUTOR.validate(input),
    resolveApprovalQueueHref: async (actor, executionId) => {
      assertAdminActor(actor);
      const ids = await createSourceReader().findApprovalQueueItemIds(executionId);
      if (ids.length !== 1) {
        throw runtimeError(
          "The exact Approval Queue item for this execution is unavailable.",
          "vendor_lifecycle_approval_queue_link_unavailable",
          503,
        );
      }
      return `/approval-queue?item_id=${encodeURIComponent(ids[0]!)}`;
    },
    source: {
      resolve: async (request) =>
        resolveLiveVendorLifecycleSource(
          request,
          createSourceReader(),
          resolveTechnicalGates,
          now,
        ),
    },
  };
}

export class FirestoreLiveVendorLifecycleSourceReader implements LiveVendorLifecycleSourceReader {
  constructor(private readonly db: Firestore) {}

  async getTicket(ticketId: string): Promise<LiveVendorRuntimeTicket | null> {
    const snapshot = await this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets)
      .doc(ticketId)
      .get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() as DocumentData;
    if (data.id !== snapshot.id) {
      throw runtimeError(
        "The Live maintenance ticket document id does not match its record.",
        "vendor_lifecycle_ticket_invalid",
      );
    }
    return {
      id: snapshot.id,
      dataMode: data.data_mode,
      updatedAt: data.updated_at,
      vendorId: data.vendor_id,
    };
  }

  async getVendor(vendorId: string): Promise<LiveVendorRuntimeVendor | null> {
    const snapshot = await this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors)
      .doc(vendorId)
      .get();
    return snapshot.exists ? runtimeVendor(snapshot) : null;
  }

  async getDisableCompletionClaim(
    vendorId: string,
  ): Promise<LiveVendorRuntimeDisableCompletionClaim | null> {
    const snapshot = await this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.disableCompletionClaims)
      .doc(vendorId)
      .get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() as LiveVendorDisableCompletionClaim;
    return {
      schemaVersion: data.schemaVersion,
      vendorRef: snapshot.id,
      vendorUid: data.vendorUid,
      rootExecutionId: data.rootExecutionId,
      rootS20ExecutionId: data.rootS20ExecutionId,
      accessDisabledAt: data.accessDisabledAt,
      completionGeneration: data.completionGeneration,
      ownerExecutionId: data.ownerExecutionId,
      ownerS20ExecutionId: data.ownerS20ExecutionId,
      ownerLeaseExpiresAt: data.ownerLeaseExpiresAt,
      dataMode: data.dataMode,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      completedAt: data.completedAt,
    };
  }

  async findVendorsByEmail(email: string): Promise<readonly LiveVendorRuntimeVendor[]> {
    const snapshot = await this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors)
      .where("email", "==", email)
      .limit(2)
      .get();
    return snapshot.docs.map(runtimeVendor);
  }

  async getAssignment(ticketId: string): Promise<LiveVendorRuntimeAssignment | null> {
    const snapshot = await this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments)
      .doc(ticketId)
      .get();
    return snapshot.exists ? runtimeAssignment(snapshot) : null;
  }

  async listAssignmentsForVendor(
    vendorId: string,
  ): Promise<readonly LiveVendorRuntimeAssignment[]> {
    const snapshot = await this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments)
      .where("vendor_id", "==", vendorId)
      .where("active", "==", true)
      .limit(LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS + 1)
      .get();
    if (snapshot.docs.length > LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS) {
      throw runtimeError(
        "The Vendor has too many active assignments for one bounded disable transaction.",
        "vendor_lifecycle_active_assignment_set_too_large",
      );
    }
    return snapshot.docs.map(runtimeAssignment);
  }

  async listTicketsForVendor(
    vendorId: string,
  ): Promise<readonly LiveVendorRuntimeTicket[]> {
    const snapshot = await this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets)
      .where("vendor_id", "==", vendorId)
      .limit(LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS + 1)
      .get();
    if (snapshot.docs.length > LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS) {
      throw runtimeError(
        "The Vendor has too many assigned tickets for one bounded disable transaction.",
        "vendor_lifecycle_active_assignment_set_too_large",
      );
    }
    return snapshot.docs.map((ticket) => {
      const data = ticket.data() as DocumentData;
      if (data.id !== ticket.id) {
        throw runtimeError(
          "The Live maintenance ticket document id does not match its record.",
          "vendor_lifecycle_ticket_invalid",
        );
      }
      return {
        id: ticket.id,
        dataMode: data.data_mode,
        updatedAt: data.updated_at,
        vendorId: data.vendor_id,
      };
    });
  }

  async getMailbox(vendorId: string): Promise<LiveVendorRuntimeMailbox | null> {
    const snapshot = await this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.mailboxConnections)
      .doc(vendorId)
      .get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() as DocumentData;
    return {
      dataMode: data.dataMode,
      status: data.status,
      tokenSecretRef: data.tokenSecretRef,
      vendorId: snapshot.id,
    };
  }

  async getIdentityClaim(
    emailHash: string,
  ): Promise<LiveVendorRuntimeIdentityClaim | null> {
    if (!/^[a-f0-9]{64}$/.test(emailHash)) {
      throw runtimeError(
        "The Vendor email identity hash is invalid.",
        "vendor_lifecycle_identity_hash_invalid",
      );
    }
    const snapshot = await this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.identityClaims)
      .doc(emailHash)
      .get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() as DocumentData;
    return {
      dataMode: data.dataMode,
      emailHash: data.emailHash,
      executionId: data.executionId,
      schemaVersion: data.schemaVersion,
      vendorRef: data.vendorRef,
      vendorUid: data.vendorUid,
    };
  }

  async getLifecycleExecution(
    executionId: string,
  ): Promise<LiveVendorLifecycleExecutionRecord | null> {
    if (!/^[a-f0-9]{64}$/.test(executionId)) {
      throw runtimeError(
        "The Vendor provider execution identity is invalid.",
        "vendor_lifecycle_provider_execution_invalid",
      );
    }
    const snapshot = await this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions)
      .doc(executionId)
      .get();
    return snapshot.exists ? readLifecycleExecution(snapshot) : null;
  }

  async getPreparedAttempt(
    executionId: string,
  ): Promise<LiveVendorPreparedAttemptSnapshot | null> {
    return new FirestoreLiveVendorLifecycleStore(this.db).getPreparedAttempt(executionId);
  }

  async getInviteReservation(
    email: string,
  ): Promise<LiveVendorLifecycleExecutionRecord | null> {
    const normalizedEmail = exactExternalVendorEmail(email);
    const emailHash = liveVendorIdentityClaimId(normalizedEmail);
    const claim = await this.getIdentityClaim(emailHash);
    if (!claim) return null;
    const parsed = requireLiveIdentityClaim(claim, emailHash);
    const execution = await this.getLifecycleExecution(parsed.executionId);
    if (
      !execution ||
      execution.actionKey !== "vendor.account.invite" ||
      execution.bindings.kind !== "invite" ||
      execution.bindings.vendorRef !== parsed.vendorRef ||
      execution.bindings.vendorUid !== parsed.vendorUid ||
      execution.bindings.emailHash !== emailHash
    ) {
      throw runtimeError(
        "The Live Vendor email claim does not match its immutable invitation.",
        "vendor_lifecycle_invite_reservation_invalid",
      );
    }
    return execution;
  }

  async getExecutionByS20ExecutionId(
    executionId: string,
  ): Promise<LiveVendorLifecycleExecutionRecord | null> {
    if (!/^exec_[a-f0-9]{40}$/.test(executionId)) {
      throw runtimeError(
        "The S20 Vendor lifecycle identity is invalid.",
        "vendor_lifecycle_s20_execution_invalid",
      );
    }
    const indexSnapshot = await this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.s20Index)
      .doc(executionId)
      .get();
    if (!indexSnapshot.exists) return null;
    const index = indexSnapshot.data() as DocumentData;
    if (
      index.schemaVersion !== 1 ||
      index.s20ExecutionId !== executionId ||
      index.dataMode !== "live" ||
      !isLiveVendorLifecycleActionKey(index.actionKey) ||
      typeof index.executionId !== "string" ||
      !/^[a-f0-9]{64}$/.test(index.executionId)
    ) {
      throw runtimeError(
        "The S20 Vendor lifecycle index is malformed.",
        "vendor_lifecycle_s20_index_invalid",
      );
    }
    const execution = await this.getLifecycleExecution(index.executionId);
    if (
      !execution ||
      execution.s20ExecutionId !== executionId ||
      execution.actionKey !== index.actionKey
    ) {
      throw runtimeError(
        "The S20 Vendor lifecycle index does not match its immutable execution.",
        "vendor_lifecycle_s20_index_mismatch",
      );
    }
    return execution;
  }

  async findApprovalQueueItemIds(executionId: string): Promise<readonly string[]> {
    if (!/^exec_[a-f0-9]{40}$/.test(executionId)) return [];
    const snapshot = await this.db
      .collection(APPROVAL_QUEUE_COLLECTION)
      .where("action_execution_id", "==", executionId)
      .limit(2)
      .get();
    return snapshot.docs.flatMap((document) => {
      const data = document.data() as DocumentData;
      return data.action_execution_id === executionId && data.data_mode === "live"
        ? [document.id]
        : [];
    });
  }
}

async function resolveLiveVendorLifecycleSource(
  request: LiveVendorLifecycleSourceRequest,
  reader: LiveVendorLifecycleSourceReader,
  resolveTechnicalGates: (
    actionKey: LiveVendorLifecycleActionKey,
  ) => ExecutionTechnicalGates,
  now: () => Date,
): Promise<LiveVendorLifecycleSourceSelection> {
  assertAdminActor(request.actor);
  if (request.operation === "reconcile") {
    if (!request.executionId) {
      throw runtimeError(
        "Reconciliation requires the exact S20 execution identity.",
        "vendor_lifecycle_s20_execution_required",
      );
    }
    return resolveReconciliationSource(
      request,
      reader,
      resolveTechnicalGates(request.intent.actionKey),
    );
  }

  const selection = await resolveCurrentSource(
    request,
    reader,
    resolveTechnicalGates(request.intent.actionKey),
    now,
  );
  if (request.operation === "execute") {
    if (!request.executionId) {
      throw runtimeError(
        "Execution requires the exact S20 execution identity.",
        "vendor_lifecycle_s20_execution_required",
      );
    }
    assertS20ExecutionMatches(selection.action, request.executionId);
  }
  return selection;
}

async function resolveCurrentSource(
  request: LiveVendorLifecycleSourceRequest,
  reader: LiveVendorLifecycleSourceReader,
  technical: ExecutionTechnicalGates,
  now: () => Date,
) {
  switch (request.intent.actionKey) {
    case "vendor.account.invite":
      return resolveCurrentInvite(request, reader, technical, now);
    case "vendor.assignment.change":
      return resolveCurrentAssignment(request, reader, technical);
    case "vendor.account.disable":
      return resolveCurrentDisable(request, reader, technical, now);
  }
}

async function resolveCurrentInvite(
  request: LiveVendorLifecycleSourceRequest,
  reader: LiveVendorLifecycleSourceReader,
  technical: ExecutionTechnicalGates,
  now: () => Date,
) {
  const intent = request.intent;
  if (intent.actionKey !== "vendor.account.invite") {
    throw runtimeError(
      "The Vendor invitation intent is malformed.",
      "vendor_lifecycle_intent_mismatch",
    );
  }
  const email = exactExternalVendorEmail(intent.email);
  const company = exactText(intent.company, "Vendor company", 160);
  const reason = exactReason(intent.reason);
  const [rawTicket, reservation, existingVendors] = await Promise.all([
    reader.getTicket(intent.ticketId),
    reader.getInviteReservation(email),
    reader.findVendorsByEmail(email),
  ]);
  const ticket = requireLiveTicket(rawTicket, intent.ticketId);
  const supersession = inviteSupersessionSource(
    reservation,
    existingVendors,
    company,
    email,
    now(),
  );
  const action = inviteAction({
    company,
    email,
    reason,
    supersession,
    ticketId: ticket.id,
    ticketUpdatedAt: ticket.updatedAt,
  });

  if (!reservation && existingVendors.length > 0) {
    throw runtimeError(
      "That Vendor email already exists without one exact Live invitation reservation.",
      "vendor_lifecycle_email_already_claimed",
    );
  }

  return selection(
    action,
    technical,
    undefined,
    supersession?.inviteMode === "setup_link_reissue"
      ? "setup_link_reissue"
      : supersession
        ? "invite_correction"
        : "standard",
  );
}

async function resolveCurrentAssignment(
  request: LiveVendorLifecycleSourceRequest,
  reader: LiveVendorLifecycleSourceReader,
  technical: ExecutionTechnicalGates,
) {
  const intent = request.intent;
  if (intent.actionKey !== "vendor.assignment.change") {
    throw runtimeError(
      "The Vendor assignment intent is malformed.",
      "vendor_lifecycle_intent_mismatch",
    );
  }
  const reason = exactReason(intent.reason);
  const rawVendor = await reader.getVendor(intent.vendorId);
  const vendor = requireLiveVendor(rawVendor, intent.vendorId, [
    "pending_setup",
    "active",
  ]);
  assertVendorSetupEffectsIdle(vendor);
  const [rawTicket, rawAssignment] = await Promise.all([
    reader.getTicket(intent.ticketId),
    reader.getAssignment(intent.ticketId),
  ]);
  const ticket = requireLiveTicket(rawTicket, intent.ticketId);
  const currentVendorRef = exactAssignmentJoin(ticket, rawAssignment);
  if (
    intent.assignmentOperation === "assign" &&
    currentVendorRef !== LIVE_VENDOR_NO_ASSIGNMENT_REF &&
    currentVendorRef !== vendor.id
  ) {
    const currentVendor = requireLiveVendor(
      await reader.getVendor(currentVendorRef),
      currentVendorRef,
      ["pending_setup", "active", "disabled"],
    );
    assertVendorSetupEffectsIdle(currentVendor);
  }
  const targetVendorRef =
    intent.assignmentOperation === "assign" ? vendor.id : LIVE_VENDOR_NO_ASSIGNMENT_REF;
  if (
    (intent.assignmentOperation === "assign" && currentVendorRef === vendor.id) ||
    (intent.assignmentOperation === "remove" && currentVendorRef !== vendor.id)
  ) {
    throw runtimeError(
      "The requested Vendor assignment no longer matches the current ticket.",
      "vendor_lifecycle_assignment_drift",
    );
  }
  const action = assignmentAction({
    assignmentOperation: intent.assignmentOperation,
    company: vendor.company,
    currentVendorRef,
    email: vendor.email,
    reason,
    targetVendorRef,
    ticketId: ticket.id,
    ticketUpdatedAt: ticket.updatedAt,
    vendorId: vendor.id,
    vendorUid: vendor.uid,
    vendorUpdatedAt: vendor.updatedAt,
  });

  return selection(action, technical);
}

async function resolveCurrentDisable(
  request: LiveVendorLifecycleSourceRequest,
  reader: LiveVendorLifecycleSourceReader,
  technical: ExecutionTechnicalGates,
  now: () => Date,
) {
  const intent = request.intent;
  if (intent.actionKey !== "vendor.account.disable") {
    throw runtimeError(
      "The Vendor disable intent is malformed.",
      "vendor_lifecycle_intent_mismatch",
    );
  }
  const reason = exactReason(intent.reason);
  const rawVendor = await reader.getVendor(intent.vendorId);
  if (rawVendor?.status === "disabled") {
    const vendor = requireLiveVendor(rawVendor, intent.vendorId, ["disabled"]);
    const rawClaim = await reader.getDisableCompletionClaim(vendor.id);
    const claim = requireDisableCompletionClaim(rawClaim, vendor);
    const [root, owner] = await Promise.all([
      reader.getExecutionByS20ExecutionId(claim.rootS20ExecutionId),
      reader.getExecutionByS20ExecutionId(claim.ownerS20ExecutionId),
    ]);
    const source = requireDisableCompletionRecoverySource(
      claim,
      root,
      owner,
      vendor,
      now(),
    );
    const action = disableAction({
      accessDisabledAt: claim.accessDisabledAt,
      activeAssignmentRefs: source.rootBindings.activeAssignmentRefs,
      company: vendor.company,
      completionGeneration: claim.completionGeneration,
      completionLeaseExpiresAt: claim.ownerLeaseExpiresAt,
      completionOwnerExecutionId: claim.ownerExecutionId,
      completionOwnerS20ExecutionId: claim.ownerS20ExecutionId,
      disableMode: "firebase_completion_recovery",
      email: vendor.email,
      mailboxState: source.rootBindings.mailboxState,
      mailboxTokenRefHash: source.rootBindings.mailboxTokenRefHash,
      reason,
      rootExecutionId: claim.rootExecutionId,
      rootS20ExecutionId: claim.rootS20ExecutionId,
      vendorId: vendor.id,
      vendorStatus: "disabled",
      vendorUid: vendor.uid,
      vendorUpdatedAt: vendor.updatedAt,
    });
    return selection(action, technical, undefined, "disable_completion_recovery");
  }

  const vendor = requireLiveVendor(rawVendor, intent.vendorId, [
    "pending_setup",
    "active",
  ]);
  const [rawAssignments, rawTickets, rawMailbox] = await Promise.all([
    reader.listAssignmentsForVendor(intent.vendorId),
    reader.listTicketsForVendor(intent.vendorId),
    reader.getMailbox(intent.vendorId),
  ]);
  const assignments = rawAssignments.map(requireLiveAssignment);
  const activeAssignments = assignments.filter((assignment) => assignment.active);
  if (activeAssignments.length > LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS) {
    throw runtimeError(
      "The Vendor has too many active assignments for one bounded disable transaction.",
      "vendor_lifecycle_active_assignment_set_too_large",
    );
  }
  const tickets = rawTickets.map((rawTicket) =>
    requireLiveTicket(rawTicket, rawTicket.id),
  );
  tickets.forEach((ticket) => {
    if (ticket.vendorId !== vendor.id) {
      throw runtimeError(
        "A Live Vendor assignment does not match its maintenance ticket.",
        "vendor_lifecycle_assignment_join_invalid",
      );
    }
  });
  const activeAssignmentRefs = canonicalLiveAssignmentRefs(
    activeAssignments.map((assignment) => assignment.ticketId),
  );
  const assignedTicketRefs = canonicalLiveAssignmentRefs(
    tickets.map((ticket) => ticket.id),
  );
  if (assignedTicketRefs !== activeAssignmentRefs) {
    throw runtimeError(
      "The Live Vendor assignment ledger and maintenance tickets disagree.",
      "vendor_lifecycle_assignment_join_invalid",
    );
  }
  const mailbox = exactMailboxProjection(rawMailbox, vendor.id);
  const initial = LIVE_VENDOR_DISABLE_INITIAL_SOURCE;
  const action = disableAction({
    accessDisabledAt: initial.accessDisabledAt,
    activeAssignmentRefs,
    company: vendor.company,
    completionGeneration: initial.completionGeneration,
    completionLeaseExpiresAt: initial.completionLeaseExpiresAt,
    completionOwnerExecutionId: initial.completionOwnerExecutionId,
    completionOwnerS20ExecutionId: initial.completionOwnerS20ExecutionId,
    disableMode: "initial",
    email: vendor.email,
    mailboxState: mailbox.state,
    mailboxTokenRefHash: mailbox.tokenRefHash,
    reason,
    rootExecutionId: initial.rootExecutionId,
    rootS20ExecutionId: initial.rootS20ExecutionId,
    vendorId: vendor.id,
    vendorStatus: vendor.status,
    vendorUid: vendor.uid,
    vendorUpdatedAt: vendor.updatedAt,
  });
  return selection(action, technical);
}

async function resolveReconciliationSource(
  request: LiveVendorLifecycleSourceRequest,
  reader: LiveVendorLifecycleSourceReader,
  technical: ExecutionTechnicalGates,
) {
  const executionId = request.executionId!;
  const record = await reader.getExecutionByS20ExecutionId(executionId);
  if (!record) {
    // S20 claims before invoking the provider. The immutable snapshot was persisted before that
    // claim, so source generations may now drift without obscuring the exact still-unstarted
    // attempt. Rehydrate only the exact reconcile reason after its hash matches; the snapshot never
    // stores that plaintext.
    const prepared = await reader.getPreparedAttempt(executionId);
    if (!prepared) {
      throw runtimeError(
        "The immutable pre-provider Vendor attempt is unavailable.",
        "vendor_lifecycle_prepared_attempt_missing",
      );
    }
    return selectionFromPreparedAttempt(request, prepared);
  }
  if (record.s20ExecutionId !== executionId) {
    throw runtimeError(
      "The S20 Vendor lifecycle index returned the wrong immutable execution.",
      "vendor_lifecycle_s20_index_mismatch",
    );
  }
  if (record.actionKey !== request.intent.actionKey) {
    throw runtimeError(
      "The S20 Vendor lifecycle action does not match its provider execution.",
      "vendor_lifecycle_reconcile_action_mismatch",
    );
  }
  const rawVendor = await reader.getVendor(record.bindings.vendorRef);
  const vendor = requireHashBoundLiveVendor(rawVendor, record);
  const reason = exactReason(request.intent.reason);
  let action: ExternalActionPreparationInput;

  if (
    record.actionKey === "vendor.account.invite" &&
    record.bindings.kind === "invite" &&
    request.intent.actionKey === "vendor.account.invite"
  ) {
    assertIntentContact(request.intent, vendor);
    if (request.intent.ticketId !== record.bindings.ticketRef) {
      throw runtimeError(
        "The Vendor invitation intent does not match the immutable execution.",
        "vendor_lifecycle_reconcile_intent_mismatch",
      );
    }
    action = inviteAction({
      company: vendor.company,
      email: vendor.email,
      reason,
      supersession: inviteSupersessionFromBindings(record),
      ticketId: record.bindings.ticketRef,
      ticketUpdatedAt: record.bindings.ticketUpdatedAt,
    });
  } else if (
    record.actionKey === "vendor.assignment.change" &&
    record.bindings.kind === "assignment" &&
    request.intent.actionKey === "vendor.assignment.change"
  ) {
    if (
      request.intent.vendorId !== record.bindings.vendorRef ||
      request.intent.ticketId !== record.bindings.ticketRef ||
      request.intent.assignmentOperation !== record.bindings.operation
    ) {
      throw runtimeError(
        "The Vendor assignment intent does not match the immutable execution.",
        "vendor_lifecycle_reconcile_intent_mismatch",
      );
    }
    action = assignmentAction({
      assignmentOperation: record.bindings.operation,
      company: vendor.company,
      currentVendorRef: record.bindings.currentVendorRef,
      email: vendor.email,
      reason,
      targetVendorRef: record.bindings.targetVendorRef,
      ticketId: record.bindings.ticketRef,
      ticketUpdatedAt: record.bindings.ticketUpdatedAt,
      vendorId: record.bindings.vendorRef,
      vendorUid: record.bindings.vendorUid,
      vendorUpdatedAt: record.bindings.vendorUpdatedAt,
    });
  } else if (
    record.actionKey === "vendor.account.disable" &&
    record.bindings.kind === "disable" &&
    request.intent.actionKey === "vendor.account.disable"
  ) {
    if (request.intent.vendorId !== record.bindings.vendorRef) {
      throw runtimeError(
        "The Vendor disable intent does not match the immutable execution.",
        "vendor_lifecycle_reconcile_intent_mismatch",
      );
    }
    const disableSource = disableSourceFromBindings(record.bindings);
    action = disableAction({
      accessDisabledAt: disableSource.accessDisabledAt,
      activeAssignmentRefs: record.bindings.activeAssignmentRefs,
      company: vendor.company,
      completionGeneration: disableSource.completionGeneration,
      completionLeaseExpiresAt: disableSource.completionLeaseExpiresAt,
      completionOwnerExecutionId: disableSource.completionOwnerExecutionId,
      completionOwnerS20ExecutionId: disableSource.completionOwnerS20ExecutionId,
      disableMode: record.bindings.disableMode,
      email: vendor.email,
      mailboxState: record.bindings.mailboxState,
      mailboxTokenRefHash: record.bindings.mailboxTokenRefHash,
      reason,
      rootExecutionId: disableSource.rootExecutionId,
      rootS20ExecutionId: disableSource.rootS20ExecutionId,
      vendorId: record.bindings.vendorRef,
      vendorStatus: record.bindings.currentStatus,
      vendorUid: record.bindings.vendorUid,
      vendorUpdatedAt: record.bindings.vendorUpdatedAt,
    });
  } else {
    throw runtimeError(
      "The immutable Vendor lifecycle bindings have the wrong action shape.",
      "vendor_lifecycle_reconcile_bindings_invalid",
    );
  }

  assertProviderLedgerMatchesAction(record, action, reason);
  return selection(
    action,
    technical,
    undefined,
    record.bindings.kind === "invite" && inviteSupersessionFromBindings(record)
      ? record.bindings.inviteMode === "setup_link_reissue"
        ? "setup_link_reissue"
        : "invite_correction"
      : record.bindings.kind === "disable" &&
          record.bindings.disableMode === "firebase_completion_recovery"
        ? "disable_completion_recovery"
        : "standard",
  );
}

function selectionFromPreparedAttempt(
  request: LiveVendorLifecycleSourceRequest,
  prepared: LiveVendorPreparedAttemptSnapshot,
): LiveVendorLifecycleSourceSelection {
  const executionId = request.executionId!;
  const reason = exactReason(request.intent.reason);
  if (
    prepared.s20ExecutionId !== executionId ||
    prepared.actionKey !== request.intent.actionKey ||
    prepared.reasonHash !== sha256(reason)
  ) {
    throw runtimeError(
      "The reconciliation intent does not match the immutable prepared Vendor attempt.",
      "vendor_lifecycle_reconcile_intent_mismatch",
    );
  }
  const action: ExternalActionPreparationInput = Object.freeze({
    ...prepared.action,
    sourceRefs: Object.freeze([...prepared.action.sourceRefs]),
    values: Object.freeze({
      ...prepared.action.values,
      reason,
    }),
  });
  if (
    hashExecutionPreview({ ...action.values }) !== prepared.previewHash ||
    externalActionContextHash(action) !== prepared.contextHash ||
    liveVendorS20ExecutionId(prepared.actionKey, externalActionIdempotencyKey(action)) !==
      executionId
  ) {
    throw runtimeError(
      "The immutable prepared Vendor attempt does not match its S20 preview or context.",
      "vendor_lifecycle_prepared_attempt_mismatch",
    );
  }
  assertPreparedIntentMatches(request.intent, action.values);
  return {
    action,
    ...(prepared.dependencyExecutionIds
      ? { dependencyExecutionIds: { ...prepared.dependencyExecutionIds } }
      : {}),
    trustedContext: prepared.trustedContext,
    variant: prepared.variant,
  };
}

function assertPreparedIntentMatches(
  intent: LiveVendorLifecycleIntent,
  values: Readonly<Record<string, string | number | boolean>>,
) {
  const matches =
    intent.actionKey === "vendor.account.invite"
      ? values.vendor_company === intent.company &&
        values.vendor_email === intent.email &&
        values.ticket_ref === intent.ticketId
      : intent.actionKey === "vendor.assignment.change"
        ? values.vendor_ref === intent.vendorId &&
          values.ticket_ref === intent.ticketId &&
          values.assignment_operation === intent.assignmentOperation
        : values.vendor_ref === intent.vendorId;
  if (!matches) {
    throw runtimeError(
      "The reconciliation intent does not match the immutable prepared Vendor projection.",
      "vendor_lifecycle_reconcile_intent_mismatch",
    );
  }
}

interface InviteSupersessionSource {
  readonly executionId: string;
  readonly inviteMode: "delivery_recovery" | "setup_link_reissue";
  readonly inviteVersion: number;
  readonly s20ExecutionId: string;
  readonly supersessionHash: string;
  readonly vendorRef: string;
  readonly vendorStatus: "pending_setup";
  readonly vendorUid: string;
  readonly vendorUpdatedAt: string;
}

function inviteSupersessionSource(
  reservation: LiveVendorLifecycleExecutionRecord | null,
  rawVendors: readonly LiveVendorRuntimeVendor[],
  company: string,
  email: string,
  now: Date,
): InviteSupersessionSource | null {
  if (!reservation) return null;
  if (
    reservation.actionKey !== "vendor.account.invite" ||
    reservation.bindings.kind !== "invite" ||
    reservation.environment !== "production" ||
    reservation.dataMode !== "live" ||
    reservation.bindings.emailHash !== sha256(email) ||
    reservation.bindings.companyHash !== hashLiveVendorContact(company)
  ) {
    throw runtimeError(
      "That Vendor email is reserved by a different immutable Live identity.",
      "vendor_lifecycle_email_claim_conflict",
    );
  }
  if (reservation.state === "superseded") {
    throw runtimeError(
      "The Vendor invitation reservation points to a superseded execution.",
      "vendor_lifecycle_invite_reservation_invalid",
    );
  }
  if (reservation.phase === "recovery_readback") {
    throw runtimeError(
      "A corrective Vendor invitation is already resolving the prior delivery outcome.",
      "vendor_lifecycle_invite_recovery_in_progress",
    );
  }
  if (
    reservation.phase === "identity_effect_claimed" ||
    reservation.phase === "delivery_effect_started"
  ) {
    throw runtimeError(
      "The current Vendor invitation owns an irreversible provider effect and requires exact readback.",
      "vendor_lifecycle_invite_effect_ambiguous",
    );
  }
  if (reservation.phase === "delivery_claimed") {
    const deliveryClaimedAt = Date.parse(reservation.deliveryClaimedAt ?? "");
    const currentTime = now.getTime();
    if (
      !Number.isFinite(deliveryClaimedAt) ||
      !Number.isFinite(currentTime) ||
      currentTime - deliveryClaimedAt < LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS
    ) {
      throw runtimeError(
        "The prior invitation delivery claim is still inside its 24-hour setup-challenge window.",
        "vendor_lifecycle_invite_recovery_not_yet_eligible",
      );
    }
  }
  if (rawVendors.length !== 1) {
    throw runtimeError(
      "The reserved Live Vendor identity does not have one exact Vendor record.",
      "vendor_lifecycle_email_claim_conflict",
    );
  }
  const vendor = requireHashBoundLiveVendor(rawVendors[0]!, reservation);
  assertVendorSetupEffectsIdle(vendor);
  if (reservation.state === "succeeded" || reservation.receipt) {
    if (
      reservation.state !== "succeeded" ||
      !reservation.receipt ||
      reservation.receipt.state !== "pending_setup" ||
      vendor.status !== "pending_setup"
    ) {
      throw runtimeError(
        "Completed Vendor access requires the separately governed reset lifecycle.",
        "vendor_lifecycle_account_reset_required",
      );
    }
    return inviteSupersession(
      reservation.id,
      reservation.s20ExecutionId,
      vendor,
      "setup_link_reissue",
    );
  }
  if (vendor.status !== "pending_setup") {
    throw runtimeError(
      "A Vendor invite correction requires the exact pending-setup identity.",
      "vendor_lifecycle_invite_reservation_invalid",
    );
  }
  return inviteSupersession(
    reservation.id,
    reservation.s20ExecutionId,
    vendor,
    "delivery_recovery",
  );
}

function inviteSupersession(
  executionId: string,
  s20ExecutionId: string,
  vendor: RequiredLiveVendor,
  inviteMode: "delivery_recovery" | "setup_link_reissue",
): InviteSupersessionSource {
  if (
    !/^[a-f0-9]{64}$/.test(executionId) ||
    !/^exec_[a-f0-9]{40}$/.test(s20ExecutionId)
  ) {
    throw runtimeError(
      "The Vendor invitation supersession source is malformed.",
      "vendor_lifecycle_supersession_binding_invalid",
    );
  }
  return {
    executionId,
    inviteMode,
    inviteVersion: vendor.inviteVersion,
    s20ExecutionId,
    supersessionHash: sha256(`${executionId}\u0000${s20ExecutionId}`),
    vendorRef: vendor.id,
    vendorStatus: "pending_setup",
    vendorUid: vendor.uid,
    vendorUpdatedAt: vendor.updatedAt,
  };
}

function inviteSupersessionFromBindings(
  record: LiveVendorLifecycleExecutionRecord,
): InviteSupersessionSource | null {
  if (record.bindings.kind !== "invite") return null;
  const bindings = record.bindings as typeof record.bindings & {
    supersededExecutionId?: unknown;
    supersededS20ExecutionId?: unknown;
    supersessionHash?: unknown;
  };
  const values = [
    bindings.supersededExecutionId,
    bindings.supersededS20ExecutionId,
    bindings.supersessionHash,
  ];
  if (values.every((value) => value === undefined)) return null;
  if (
    typeof bindings.supersededExecutionId !== "string" ||
    typeof bindings.supersededS20ExecutionId !== "string" ||
    typeof bindings.supersessionHash !== "string"
  ) {
    throw runtimeError(
      "The Vendor invitation supersession binding is incomplete.",
      "vendor_lifecycle_supersession_binding_invalid",
    );
  }
  const source: InviteSupersessionSource = {
    executionId: bindings.supersededExecutionId,
    inviteMode:
      record.bindings.inviteMode === "setup_link_reissue"
        ? "setup_link_reissue"
        : "delivery_recovery",
    inviteVersion: record.bindings.inviteVersion,
    s20ExecutionId: bindings.supersededS20ExecutionId,
    supersessionHash: sha256(
      `${bindings.supersededExecutionId}\u0000${bindings.supersededS20ExecutionId}`,
    ),
    vendorRef: record.bindings.vendorRef,
    vendorStatus: "pending_setup",
    vendorUid: record.bindings.vendorUid,
    vendorUpdatedAt: record.bindings.vendorUpdatedAt,
  };
  if (source.supersessionHash !== bindings.supersessionHash) {
    throw runtimeError(
      "The Vendor invitation supersession binding hash does not match.",
      "vendor_lifecycle_supersession_binding_invalid",
    );
  }
  return source;
}

function disableSourceFromBindings(bindings: LiveVendorDisableBindings) {
  if (bindings.disableMode === "initial") {
    return LIVE_VENDOR_DISABLE_INITIAL_SOURCE;
  }
  return {
    accessDisabledAt: bindings.accessDisabledAt,
    completionGeneration: bindings.completionGeneration,
    completionLeaseExpiresAt: bindings.completionLeaseExpiresAt,
    completionOwnerExecutionId: bindings.completionOwnerExecutionId,
    completionOwnerS20ExecutionId: bindings.completionOwnerS20ExecutionId,
    rootExecutionId: bindings.rootExecutionId,
    rootS20ExecutionId: bindings.rootS20ExecutionId,
  };
}

function inviteAction(input: {
  company: string;
  email: string;
  reason: string;
  supersession: InviteSupersessionSource | null;
  ticketId: string;
  ticketUpdatedAt: string;
}): ExternalActionPreparationInput {
  const inviteMode = input.supersession?.inviteMode ?? "initial";
  const values = liveVendorInviteActionValues({
    artifactRef: "vendor-invite:v1.0",
    inviteMode,
    inviteVersion: input.supersession?.inviteVersion ?? 0,
    reason: input.reason,
    ticketRef: input.ticketId,
    ticketUpdatedAt: input.ticketUpdatedAt,
    company: input.company,
    email: input.email,
    vendorRef: input.supersession?.vendorRef ?? "vendor:new",
    vendorStatus: input.supersession?.vendorStatus ?? "none",
    vendorUid: input.supersession?.vendorUid ?? "identity:new",
    vendorUpdatedAt: input.supersession?.vendorUpdatedAt ?? "generation:new",
  });
  const identity = {
    actionKey: "vendor.account.invite",
    artifactRef: values.artifact_ref,
    companyHash: hashLiveVendorContact(input.company),
    emailHash: sha256(input.email),
    inviteMode,
    inviteVersion: values.invite_version,
    reasonHash: sha256(input.reason),
    ...(input.supersession
      ? {
          supersession: {
            executionId: input.supersession.executionId,
            s20ExecutionId: input.supersession.s20ExecutionId,
            supersessionHash: input.supersession.supersessionHash,
          },
        }
      : {}),
    ticketRef: input.ticketId,
    ticketUpdatedAt: input.ticketUpdatedAt,
  };
  return externalAction(
    "vendor.account.invite",
    input.ticketId,
    identity,
    [
      generationRef("maintenance-ticket", input.ticketId, input.ticketUpdatedAt),
      `vendor-email-hash:${identity.emailHash}`,
      `vendor-company-hash:${identity.companyHash}`,
      ...(input.supersession
        ? [
            generationRef(
              "vendor",
              input.supersession.vendorRef,
              input.supersession.vendorUpdatedAt,
            ),
            `vendor-invite-version:${input.supersession.inviteVersion}`,
            `superseded-vendor-execution:${input.supersession.executionId}`,
            `superseded-s20-execution:${input.supersession.s20ExecutionId}`,
            `vendor-invite-supersession:${input.supersession.supersessionHash}`,
          ]
        : []),
    ],
    values,
  );
}

function assignmentAction(input: {
  assignmentOperation: "assign" | "remove";
  company: string;
  currentVendorRef: string;
  email: string;
  reason: string;
  targetVendorRef: string;
  ticketId: string;
  ticketUpdatedAt: string;
  vendorId: string;
  vendorUid: string;
  vendorUpdatedAt: string;
}): ExternalActionPreparationInput {
  const values = liveVendorAssignmentActionValues({
    operation: input.assignmentOperation,
    currentVendorRef: input.currentVendorRef,
    reason: input.reason,
    targetVendorRef: input.targetVendorRef,
    ticketRef: input.ticketId,
    ticketUpdatedAt: input.ticketUpdatedAt,
    company: input.company,
    email: input.email,
    vendorRef: input.vendorId,
    vendorUid: input.vendorUid,
    vendorUpdatedAt: input.vendorUpdatedAt,
  });
  const identity = {
    actionKey: "vendor.assignment.change",
    currentVendorRef: input.currentVendorRef,
    operation: input.assignmentOperation,
    reasonHash: sha256(input.reason),
    targetVendorRef: input.targetVendorRef,
    ticketRef: input.ticketId,
    ticketUpdatedAt: input.ticketUpdatedAt,
    vendorRef: input.vendorId,
    vendorUpdatedAt: input.vendorUpdatedAt,
  };
  return externalAction(
    "vendor.assignment.change",
    input.ticketId,
    identity,
    [
      generationRef("vendor", input.vendorId, input.vendorUpdatedAt),
      generationRef("maintenance-ticket", input.ticketId, input.ticketUpdatedAt),
      `assignment-transition:${sha256(
        `${input.currentVendorRef}\u0000${input.targetVendorRef}\u0000${input.assignmentOperation}`,
      )}`,
    ],
    values,
  );
}

function disableAction(input: {
  accessDisabledAt: string;
  activeAssignmentRefs: string;
  company: string;
  completionGeneration: number;
  completionLeaseExpiresAt: string;
  completionOwnerExecutionId: string;
  completionOwnerS20ExecutionId: string;
  disableMode: "initial" | "firebase_completion_recovery";
  email: string;
  mailboxState: string;
  mailboxTokenRefHash: string;
  reason: string;
  rootExecutionId: string;
  rootS20ExecutionId: string;
  vendorId: string;
  vendorStatus: string;
  vendorUid: string;
  vendorUpdatedAt: string;
}): ExternalActionPreparationInput {
  const values = liveVendorDisableActionValues({
    accessDisabledAt: input.accessDisabledAt,
    activeAssignmentRefs: input.activeAssignmentRefs,
    completionGeneration: input.completionGeneration,
    completionLeaseExpiresAt: input.completionLeaseExpiresAt,
    completionOwnerExecutionId: input.completionOwnerExecutionId,
    completionOwnerS20ExecutionId: input.completionOwnerS20ExecutionId,
    disableMode: input.disableMode,
    mailboxState: input.mailboxState,
    mailboxTokenRefHash: input.mailboxTokenRefHash,
    reason: input.reason,
    rootExecutionId: input.rootExecutionId,
    rootS20ExecutionId: input.rootS20ExecutionId,
    company: input.company,
    email: input.email,
    vendorRef: input.vendorId,
    currentStatus: input.vendorStatus,
    vendorUid: input.vendorUid,
    vendorUpdatedAt: input.vendorUpdatedAt,
  });
  const identity = {
    accessDisabledAt: input.accessDisabledAt,
    actionKey: "vendor.account.disable",
    activeAssignmentRefs: input.activeAssignmentRefs,
    completionGeneration: input.completionGeneration,
    completionLeaseExpiresAt: input.completionLeaseExpiresAt,
    completionOwnerExecutionId: input.completionOwnerExecutionId,
    completionOwnerS20ExecutionId: input.completionOwnerS20ExecutionId,
    disableMode: input.disableMode,
    mailboxState: input.mailboxState,
    mailboxTokenRefHash: input.mailboxTokenRefHash,
    reasonHash: sha256(input.reason),
    rootExecutionId: input.rootExecutionId,
    rootS20ExecutionId: input.rootS20ExecutionId,
    vendorRef: input.vendorId,
    vendorStatus: input.vendorStatus,
    vendorUpdatedAt: input.vendorUpdatedAt,
  };
  return externalAction(
    "vendor.account.disable",
    `vendor-lifecycle-${input.vendorId}`,
    identity,
    [
      generationRef("vendor", input.vendorId, input.vendorUpdatedAt),
      `active-assignment-set:${sha256(input.activeAssignmentRefs)}`,
      `vendor-mailbox-state:${sha256(input.mailboxState)}`,
      `vendor-mailbox-token-ref:${input.mailboxTokenRefHash}`,
      ...(input.disableMode === "firebase_completion_recovery"
        ? [
            `vendor-disable-root:${input.rootExecutionId}`,
            `vendor-disable-root-s20:${input.rootS20ExecutionId}`,
            `vendor-disable-access-cutoff:${input.accessDisabledAt}`,
            `vendor-disable-completion-generation:${input.completionGeneration}`,
            `vendor-disable-completion-owner:${input.completionOwnerExecutionId}`,
            `vendor-disable-completion-owner-s20:${input.completionOwnerS20ExecutionId}`,
            `vendor-disable-completion-lease:${input.completionLeaseExpiresAt}`,
          ]
        : []),
    ],
    values,
  );
}

function externalAction(
  actionKey: LiveVendorLifecycleActionKey,
  workflowId: string,
  identity: Readonly<Record<string, unknown>>,
  sourceRefs: readonly string[],
  values: Readonly<Record<string, string>>,
): ExternalActionPreparationInput {
  return Object.freeze({
    actionId: `vendor-lifecycle-${sha256(canonicalJson(identity)).slice(0, 48)}`,
    actionKey,
    connectionRef: CONNECTION_REFS[actionKey],
    contractRef: CONTRACT_REF,
    dataMode: "live" as const,
    mappingRef: MAPPING_REF,
    sourceRefs: Object.freeze([...sourceRefs]),
    values: Object.freeze({ ...values }),
    workflowId,
  });
}

function selection(
  action: ExternalActionPreparationInput,
  technical: ExecutionTechnicalGates,
  dependencyExecutionIds?: Readonly<Record<string, string>>,
  variant: LiveVendorLifecycleSourceSelection["variant"] = "standard",
): LiveVendorLifecycleSourceSelection {
  const externalReferences = {
    connectionRef: action.connectionRef!,
    contractRef: action.contractRef!,
    mappingRef: action.mappingRef!,
    sourceRefs: action.sourceRefs,
  };
  const trustedContext: TrustedExternalExecutionContext = {
    connectionReady: technical.connectionReady,
    endpointDocumented: technical.endpointDocumented,
    externalReferences,
    localPreviewValidated: technical.requiredValuesPresent,
    permissionGranted: technical.permissionGranted,
    roleScopeAuthorized: technical.roleScopeAuthorized,
    sourceValidated: technical.sourceValidated,
    technical,
  };
  return {
    action,
    ...(dependencyExecutionIds ? { dependencyExecutionIds } : {}),
    trustedContext,
    variant,
  };
}

function assertProviderLedgerMatchesAction(
  record: LiveVendorLifecycleExecutionRecord,
  action: ExternalActionPreparationInput,
  reason: string,
) {
  const idempotencyKey = externalActionIdempotencyKey(action);
  if (
    record.s20ExecutionId !==
      liveVendorS20ExecutionId(record.actionKey, idempotencyKey) ||
    record.id !== liveVendorLifecycleExecutionId(record.actionKey, idempotencyKey)
  ) {
    throw runtimeError(
      "The provider ledger identity does not match the reconstructed S20 action.",
      "vendor_lifecycle_reconcile_identity_mismatch",
    );
  }

  let payloadHash: string;
  if (record.actionKey === "vendor.account.invite" && record.bindings.kind === "invite") {
    const derived = liveVendorInviteDerivedRefs(idempotencyKey);
    const supersession = inviteSupersessionFromBindings(record);
    if (
      (!supersession &&
        (record.bindings.vendorRef !== derived.vendorRef ||
          record.bindings.vendorUid !== derived.vendorUid)) ||
      record.bindings.rfcMessageId !== derived.rfcMessageId
    ) {
      throw runtimeError(
        "The Vendor invitation ledger bindings are not deterministic.",
        "vendor_lifecycle_reconcile_identity_mismatch",
      );
    }
    payloadHash = hashLiveVendorInvitePayload({
      actorUid: record.actorUid,
      artifactRef: "vendor-invite:v1.0",
      company: String(action.values.vendor_company),
      email: String(action.values.vendor_email),
      idempotencyKey,
      inviteMode: action.values.invite_mode as
        | "initial"
        | "delivery_recovery"
        | "setup_link_reissue",
      inviteVersion: Number(action.values.invite_version),
      reason,
      ticketRef: String(action.values.ticket_ref),
      ticketUpdatedAt: String(action.values.ticket_updated_at),
      vendorRef: String(action.values.vendor_ref),
      vendorStatus: action.values.vendor_status as "none" | "pending_setup",
      vendorUid: String(action.values.vendor_uid),
      vendorUpdatedAt: String(action.values.vendor_updated_at),
    });
  } else if (
    record.actionKey === "vendor.assignment.change" &&
    record.bindings.kind === "assignment"
  ) {
    payloadHash = hashLiveVendorAssignmentPayload({
      actorUid: record.actorUid,
      company: String(action.values.vendor_company),
      currentVendorRef: String(action.values.current_vendor_ref),
      email: String(action.values.vendor_email),
      idempotencyKey,
      operation: action.values.assignment_operation as "assign" | "remove",
      reason,
      targetVendorRef: String(action.values.target_vendor_ref),
      ticketRef: String(action.values.ticket_ref),
      ticketUpdatedAt: String(action.values.ticket_updated_at),
      vendorRef: String(action.values.vendor_ref),
      vendorUid: String(action.values.vendor_uid),
      vendorUpdatedAt: String(action.values.vendor_updated_at),
    });
  } else if (
    record.actionKey === "vendor.account.disable" &&
    record.bindings.kind === "disable"
  ) {
    payloadHash = hashLiveVendorDisablePayload({
      accessDisabledAt: String(action.values.access_disabled_at),
      activeAssignmentRefs: String(action.values.active_assignment_refs),
      actorUid: record.actorUid,
      company: String(action.values.vendor_company),
      completionGeneration: Number(action.values.completion_generation),
      completionLeaseExpiresAt: String(action.values.completion_lease_expires_at),
      completionOwnerExecutionId: String(action.values.completion_owner_execution_ref),
      completionOwnerS20ExecutionId: String(
        action.values.completion_owner_s20_execution_ref,
      ),
      currentStatus: String(action.values.vendor_status),
      disableMode: action.values.disable_mode as
        | "initial"
        | "firebase_completion_recovery",
      email: String(action.values.vendor_email),
      idempotencyKey,
      mailboxState: String(action.values.mailbox_state),
      mailboxTokenRefHash: String(action.values.mailbox_token_ref_hash),
      reason,
      rootExecutionId: String(action.values.root_execution_ref),
      rootS20ExecutionId: String(action.values.root_s20_execution_ref),
      vendorRef: String(action.values.vendor_ref),
      vendorUid: String(action.values.vendor_uid),
      vendorUpdatedAt: String(action.values.vendor_updated_at),
    });
  } else {
    throw runtimeError(
      "The provider ledger action shape is invalid.",
      "vendor_lifecycle_reconcile_bindings_invalid",
    );
  }

  if (record.payloadHash !== payloadHash) {
    throw runtimeError(
      "The reconciliation reason or immutable source projection does not match the provider ledger.",
      "vendor_lifecycle_reconcile_payload_mismatch",
    );
  }
}

function assertS20ExecutionMatches(
  action: ExternalActionPreparationInput,
  executionId: string,
) {
  const expected = liveVendorS20ExecutionId(
    action.actionKey as LiveVendorLifecycleActionKey,
    externalActionIdempotencyKey(action),
  );
  if (expected !== executionId) {
    throw runtimeError(
      "The S20 execution id does not match the immutable Live source projection.",
      "vendor_lifecycle_s20_execution_mismatch",
    );
  }
}

function assertIntentContact(
  intent: Extract<LiveVendorLifecycleIntent, { actionKey: "vendor.account.invite" }>,
  vendor: RequiredLiveVendor,
) {
  if (
    normalizeLiveVendorEmail(intent.email) !== vendor.email ||
    hashLiveVendorContact(intent.company) !== hashLiveVendorContact(vendor.company)
  ) {
    throw runtimeError(
      "The Vendor invitation contact does not match the immutable execution.",
      "vendor_lifecycle_reconcile_intent_mismatch",
    );
  }
}

interface RequiredLiveTicket {
  id: string;
  updatedAt: string;
  vendorId: string | null;
}

function requireLiveTicket(
  raw: LiveVendorRuntimeTicket | null,
  expectedId: string,
): RequiredLiveTicket {
  if (
    !raw ||
    raw.id !== expectedId ||
    raw.id === LIVE_VENDOR_NO_ASSIGNMENT_REF ||
    raw.dataMode !== "live" ||
    typeof raw.updatedAt !== "string" ||
    !raw.updatedAt.trim() ||
    (raw.vendorId !== undefined &&
      (typeof raw.vendorId !== "string" ||
        !raw.vendorId.trim() ||
        raw.vendorId.trim() === LIVE_VENDOR_NO_ASSIGNMENT_REF))
  ) {
    throw runtimeError(
      "The exact Live maintenance ticket is unavailable.",
      "vendor_lifecycle_ticket_invalid",
    );
  }
  return {
    id: raw.id,
    updatedAt: raw.updatedAt.trim(),
    vendorId:
      typeof raw.vendorId === "string" && raw.vendorId.trim()
        ? raw.vendorId.trim()
        : null,
  };
}

interface RequiredLiveVendor {
  company: string;
  email: string;
  id: string;
  inviteVersion: number;
  status: "pending_setup" | "active" | "disabled";
  setupEffectInFlight: boolean;
  uid: string;
  updatedAt: string;
}

interface RequiredDisableCompletionClaim {
  vendorRef: string;
  vendorUid: string;
  rootExecutionId: string;
  rootS20ExecutionId: string;
  accessDisabledAt: string;
  completionGeneration: number;
  ownerExecutionId: string;
  ownerS20ExecutionId: string;
  ownerLeaseExpiresAt: string;
}

function requireDisableCompletionClaim(
  raw: LiveVendorRuntimeDisableCompletionClaim | null,
  vendor: RequiredLiveVendor,
): RequiredDisableCompletionClaim {
  const accessDisabledAt = exactIsoInstant(raw?.accessDisabledAt);
  const ownerLeaseExpiresAt = exactIsoInstant(raw?.ownerLeaseExpiresAt);
  if (
    !raw ||
    raw.schemaVersion !== 1 ||
    raw.vendorRef !== vendor.id ||
    raw.vendorUid !== vendor.uid ||
    raw.dataMode !== "live" ||
    typeof raw.rootExecutionId !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.rootExecutionId) ||
    typeof raw.rootS20ExecutionId !== "string" ||
    !/^exec_[a-f0-9]{40}$/.test(raw.rootS20ExecutionId) ||
    typeof raw.ownerExecutionId !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.ownerExecutionId) ||
    typeof raw.ownerS20ExecutionId !== "string" ||
    !/^exec_[a-f0-9]{40}$/.test(raw.ownerS20ExecutionId) ||
    !Number.isSafeInteger(raw.completionGeneration) ||
    Number(raw.completionGeneration) < 0 ||
    !accessDisabledAt ||
    !ownerLeaseExpiresAt ||
    Date.parse(accessDisabledAt) > Date.parse(ownerLeaseExpiresAt) ||
    raw.completedAt !== undefined
  ) {
    throw runtimeError(
      raw?.completedAt
        ? "The Vendor disable is already complete; no Firebase recovery remains."
        : "The Vendor disable completion claim is unavailable or malformed.",
      raw?.completedAt
        ? "vendor_lifecycle_disable_already_complete"
        : "vendor_lifecycle_disable_completion_invalid",
    );
  }
  return {
    vendorRef: raw.vendorRef,
    vendorUid: raw.vendorUid as string,
    rootExecutionId: raw.rootExecutionId,
    rootS20ExecutionId: raw.rootS20ExecutionId,
    accessDisabledAt,
    completionGeneration: Number(raw.completionGeneration),
    ownerExecutionId: raw.ownerExecutionId,
    ownerS20ExecutionId: raw.ownerS20ExecutionId,
    ownerLeaseExpiresAt,
  };
}

function requireDisableCompletionRecoverySource(
  claim: RequiredDisableCompletionClaim,
  root: LiveVendorLifecycleExecutionRecord | null,
  owner: LiveVendorLifecycleExecutionRecord | null,
  vendor: RequiredLiveVendor,
  now: Date,
): { rootBindings: LiveVendorDisableBindings } {
  if (
    !root ||
    !owner ||
    root.id !== claim.rootExecutionId ||
    root.s20ExecutionId !== claim.rootS20ExecutionId ||
    root.actionKey !== "vendor.account.disable" ||
    root.bindings.kind !== "disable" ||
    root.bindings.disableMode !== "initial" ||
    root.bindings.rootExecutionId !== root.id ||
    root.bindings.rootS20ExecutionId !== root.s20ExecutionId ||
    root.bindings.accessDisabledAt !== claim.accessDisabledAt ||
    root.bindings.vendorRef !== vendor.id ||
    root.bindings.vendorUid !== vendor.uid ||
    root.bindings.emailHash !== sha256(vendor.email) ||
    root.bindings.companyHash !== hashLiveVendorContact(vendor.company) ||
    root.phase !== "access_disabled" ||
    (root.state !== "running" && root.state !== "ambiguous") ||
    root.receipt ||
    owner.id !== claim.ownerExecutionId ||
    owner.s20ExecutionId !== claim.ownerS20ExecutionId ||
    owner.actionKey !== "vendor.account.disable" ||
    owner.bindings.kind !== "disable" ||
    owner.bindings.rootExecutionId !== root.id ||
    owner.bindings.rootS20ExecutionId !== root.s20ExecutionId ||
    owner.bindings.accessDisabledAt !== claim.accessDisabledAt ||
    owner.bindings.issuedCompletionGeneration !== claim.completionGeneration ||
    owner.phase !== "access_disabled" ||
    (owner.state !== "running" && owner.state !== "ambiguous") ||
    owner.receipt
  ) {
    throw runtimeError(
      "The Vendor disable completion lineage is unavailable or inconsistent.",
      "vendor_lifecycle_disable_completion_invalid",
    );
  }
  const nowMs = now.getTime();
  if (
    !Number.isFinite(nowMs) ||
    (owner.state !== "ambiguous" && nowMs < Date.parse(claim.ownerLeaseExpiresAt))
  ) {
    throw runtimeError(
      "The prior Vendor disable completion owner still holds its recovery lease.",
      "vendor_lifecycle_disable_recovery_not_yet_eligible",
    );
  }
  return { rootBindings: root.bindings };
}

function requireLiveVendor(
  raw: LiveVendorRuntimeVendor | null,
  expectedId: string,
  allowedStatuses: readonly RequiredLiveVendor["status"][],
): RequiredLiveVendor {
  const status = raw?.status;
  if (
    !raw ||
    raw.id !== expectedId ||
    raw.id === LIVE_VENDOR_NO_ASSIGNMENT_REF ||
    raw.dataMode !== "live" ||
    typeof raw.uid !== "string" ||
    !raw.uid.trim() ||
    typeof raw.email !== "string" ||
    typeof raw.company !== "string" ||
    !raw.company.trim() ||
    !Number.isSafeInteger(raw.inviteVersion) ||
    Number(raw.inviteVersion) < 1 ||
    typeof raw.updatedAt !== "string" ||
    !raw.updatedAt.trim() ||
    (raw.setupEffectInFlight !== undefined &&
      typeof raw.setupEffectInFlight !== "boolean") ||
    (status !== "pending_setup" && status !== "active" && status !== "disabled") ||
    !allowedStatuses.includes(status)
  ) {
    throw runtimeError(
      "The exact Live Vendor record is unavailable.",
      "vendor_lifecycle_vendor_invalid",
    );
  }
  return {
    company: exactText(raw.company, "Vendor company", 200),
    email: exactExternalVendorEmail(raw.email),
    id: raw.id,
    inviteVersion: Number(raw.inviteVersion),
    status,
    setupEffectInFlight: raw.setupEffectInFlight === true,
    uid: raw.uid.trim(),
    updatedAt: raw.updatedAt.trim(),
  };
}

function assertVendorSetupEffectsIdle(vendor: RequiredLiveVendor) {
  if (vendor.setupEffectInFlight) {
    throw runtimeError(
      "The Vendor setup effect must finish before another lifecycle change.",
      "vendor_lifecycle_setup_effect_in_flight",
      409,
    );
  }
}

function requireHashBoundLiveVendor(
  raw: LiveVendorRuntimeVendor | null,
  record: LiveVendorLifecycleExecutionRecord,
) {
  const vendor = requireLiveVendor(raw, record.bindings.vendorRef, [
    "pending_setup",
    "active",
    "disabled",
  ]);
  if (
    vendor.uid !== record.bindings.vendorUid ||
    sha256(vendor.email) !== record.bindings.emailHash ||
    hashLiveVendorContact(vendor.company) !== record.bindings.companyHash
  ) {
    throw runtimeError(
      "The current Live Vendor does not match the immutable provider bindings.",
      "vendor_lifecycle_reconcile_vendor_mismatch",
    );
  }
  return vendor;
}

interface RequiredLiveAssignment {
  active: boolean;
  ticketId: string;
  vendorId: string;
}

function requireLiveAssignment(raw: LiveVendorRuntimeAssignment): RequiredLiveAssignment {
  if (
    raw.dataMode !== "live" ||
    typeof raw.active !== "boolean" ||
    typeof raw.vendorId !== "string" ||
    !raw.vendorId.trim() ||
    raw.vendorId.trim() === LIVE_VENDOR_NO_ASSIGNMENT_REF ||
    !raw.ticketId.trim()
  ) {
    throw runtimeError(
      "A Vendor assignment is not an explicit Live record.",
      "vendor_lifecycle_assignment_invalid",
    );
  }
  return {
    active: raw.active,
    ticketId: raw.ticketId,
    vendorId: raw.vendorId.trim(),
  };
}

function exactAssignmentJoin(
  ticket: RequiredLiveTicket,
  rawAssignment: LiveVendorRuntimeAssignment | null,
) {
  if (!ticket.vendorId) {
    if (rawAssignment) {
      const assignment = requireLiveAssignment(rawAssignment);
      if (assignment.active) {
        throw runtimeError(
          "The maintenance ticket and Vendor assignment disagree.",
          "vendor_lifecycle_assignment_join_invalid",
        );
      }
    }
    return "vendor:none";
  }
  if (!rawAssignment) {
    throw runtimeError(
      "The maintenance ticket has no matching Live Vendor assignment.",
      "vendor_lifecycle_assignment_join_invalid",
    );
  }
  const assignment = requireLiveAssignment(rawAssignment);
  if (
    !assignment.active ||
    assignment.ticketId !== ticket.id ||
    assignment.vendorId !== ticket.vendorId
  ) {
    throw runtimeError(
      "The maintenance ticket and Vendor assignment disagree.",
      "vendor_lifecycle_assignment_join_invalid",
    );
  }
  return ticket.vendorId;
}

function exactMailboxProjection(
  raw: LiveVendorRuntimeMailbox | null,
  vendorId: string,
): { state: string; tokenRefHash: string } {
  if (!raw) return { state: "none", tokenRefHash: "none" };
  if (
    raw.vendorId !== vendorId ||
    raw.dataMode !== "live" ||
    (raw.status !== "connected" &&
      raw.status !== "revocation_pending" &&
      raw.status !== "revoked")
  ) {
    throw runtimeError(
      "The Vendor mailbox is not an explicit Live record.",
      "vendor_lifecycle_mailbox_invalid",
    );
  }
  if (typeof raw.tokenSecretRef !== "string" || !raw.tokenSecretRef.trim()) {
    throw runtimeError(
      "The Vendor mailbox token reference is unavailable.",
      "vendor_lifecycle_mailbox_invalid",
    );
  }
  return {
    state: raw.status,
    tokenRefHash: sha256(raw.tokenSecretRef.trim()),
  };
}

function requireLiveIdentityClaim(
  raw: LiveVendorRuntimeIdentityClaim | null,
  expectedEmailHash: string,
) {
  if (
    !raw ||
    raw.schemaVersion !== 1 ||
    raw.dataMode !== "live" ||
    raw.emailHash !== expectedEmailHash ||
    typeof raw.vendorRef !== "string" ||
    !raw.vendorRef.trim() ||
    typeof raw.vendorUid !== "string" ||
    !raw.vendorUid.trim() ||
    typeof raw.executionId !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.executionId)
  ) {
    throw runtimeError(
      "The Live Vendor identity claim is unavailable or malformed.",
      "vendor_lifecycle_identity_claim_invalid",
    );
  }
  return {
    emailHash: expectedEmailHash,
    executionId: raw.executionId,
    vendorRef: raw.vendorRef.trim(),
    vendorUid: raw.vendorUid.trim(),
  };
}

function readLifecycleExecution(
  snapshot: DocumentSnapshot<DocumentData>,
): LiveVendorLifecycleExecutionRecord {
  const record = snapshot.data() as LiveVendorLifecycleExecutionRecord | undefined;
  if (
    !record ||
    record.schemaVersion !== 1 ||
    record.id !== snapshot.id ||
    record.environment !== "production" ||
    record.dataMode !== "live" ||
    record.attemptCount !== 1 ||
    !/^exec_[a-f0-9]{40}$/.test(record.s20ExecutionId) ||
    !isLiveVendorLifecycleActionKey(record.actionKey) ||
    (record.state !== "running" &&
      record.state !== "ambiguous" &&
      record.state !== "succeeded" &&
      record.state !== "superseded")
  ) {
    throw runtimeError(
      "The immutable Vendor lifecycle execution is malformed.",
      "vendor_lifecycle_provider_execution_invalid",
    );
  }
  const receipt = parseOptionalLiveVendorLifecycleReceipt(record);
  return receipt ? { ...record, receipt } : record;
}

function runtimeVendor(
  snapshot:
    | DocumentSnapshot<DocumentData>
    | QueryDocumentSnapshot<DocumentData, DocumentData>,
): LiveVendorRuntimeVendor {
  const data = snapshot.data() as DocumentData;
  if (data.id !== snapshot.id) {
    throw runtimeError(
      "The Live Vendor document id does not match its record.",
      "vendor_lifecycle_vendor_invalid",
    );
  }
  return {
    company: data.displayName,
    dataMode: data.data_mode,
    email: data.email,
    id: snapshot.id,
    inviteVersion: data.inviteVersion,
    status: data.status,
    setupEffectInFlight: data.setupEffectFence !== undefined,
    uid: data.uid,
    updatedAt: data.updatedAt,
  };
}

function runtimeAssignment(
  snapshot:
    | DocumentSnapshot<DocumentData>
    | QueryDocumentSnapshot<DocumentData, DocumentData>,
): LiveVendorRuntimeAssignment {
  const data = snapshot.data() as DocumentData;
  if (data.ticket_id !== snapshot.id) {
    throw runtimeError(
      "The Live Vendor assignment document id does not match its ticket.",
      "vendor_lifecycle_assignment_invalid",
    );
  }
  return {
    active: data.active,
    dataMode: data.data_mode,
    ticketId: snapshot.id,
    updatedAt: data.updated_at,
    vendorId: data.vendor_id,
  };
}

export function resolveLiveVendorLifecycleTechnicalGates(
  actionKey: LiveVendorLifecycleActionKey,
): ExecutionTechnicalGates {
  const config = readServerConfig();
  const projectConfigured =
    config.environment.environmentKind === "production" &&
    config.environment.dataContext === "live" &&
    config.environment.source === "explicit" &&
    config.firebaseProjectId === PRODUCTION_PROJECT_ID &&
    config.gcpProjectId === PRODUCTION_PROJECT_ID &&
    config.firebaseBrowserConfig.projectId === PRODUCTION_PROJECT_ID;
  const firebaseAuthDomainReady = validProductionAuthDomain(
    config.firebaseBrowserConfig.authDomain,
  );
  const sender = config.kbApprovalSender?.trim().toLowerCase();
  const dwdServiceAccount = process.env.GMAIL_DWD_SA?.trim();
  const appBaseUrlReady = validProductionAppOrigin(config.appBaseUrl);
  const gmailReady =
    validManagedGmailSubject(sender) &&
    firebaseAuthDomainReady &&
    Boolean(
      dwdServiceAccount &&
      /^[^@\s]+@pmi-kc-kb-prod\.iam\.gserviceaccount\.com$/.test(dwdServiceAccount),
    ) &&
    appBaseUrlReady;
  const connectionReady =
    projectConfigured && (actionKey === "vendor.account.invite" ? gmailReady : true);

  return {
    connectionReady,
    documentedEvidence: true,
    endpointDocumented: true,
    permissionGranted: connectionReady,
    productionAllowed: true,
    requiredValuesPresent: true,
    roleScopeAuthorized: true,
    sourceValidated: true,
  };
}

function validManagedGmailSubject(value: string | undefined) {
  try {
    normalizeGmailSubject(value ?? "");
    return true;
  } catch {
    return false;
  }
}

function validProductionAppOrigin(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (hostname === CURRENT_PRODUCTION_APP_HOST ||
        hostname === "pmikcmetro.com" ||
        hostname.endsWith(".pmikcmetro.com"))
    );
  } catch {
    return false;
  }
}

function validProductionAuthDomain(value: string | undefined) {
  const domain = value?.trim().toLowerCase();
  return Boolean(
    domain &&
    (domain === `${PRODUCTION_PROJECT_ID}.firebaseapp.com` ||
      domain === CURRENT_PRODUCTION_APP_HOST ||
      domain === "pmikcmetro.com" ||
      domain.endsWith(".pmikcmetro.com")),
  );
}

class LazyLiveVendorLifecycleExecutor implements ExternalExecutor {
  constructor(private readonly createProvider: () => VendorLifecycleProvider) {}

  validate(input: ExternalActionInput) {
    return PURE_VENDOR_LIFECYCLE_EXECUTOR.validate(input);
  }

  async execute(input: ExternalActionInput) {
    return new VendorLifecycleExecutor(this.createProvider()).execute(input);
  }

  async reconcile(input: ExternalActionInput) {
    return new VendorLifecycleExecutor(this.createProvider()).reconcile(input);
  }
}

const NO_CALL_VENDOR_PROVIDER: VendorLifecycleProvider = {
  async changeAssignment() {
    throw new Error("Provider-free validation cannot change an assignment.");
  },
  async disable() {
    throw new Error("Provider-free validation cannot disable a Vendor.");
  },
  async invite() {
    throw new Error("Provider-free validation cannot invite a Vendor.");
  },
  async reconcile() {
    throw new Error("Provider-free validation cannot reconcile a Vendor.");
  },
};

const PURE_VENDOR_LIFECYCLE_EXECUTOR = new VendorLifecycleExecutor(
  NO_CALL_VENDOR_PROVIDER,
);

function createLiveVendorLifecycleProvider(): VendorLifecycleProvider {
  const adapters = createLiveVendorLifecycleAdapters();
  return new LiveVendorLifecycleProvider({
    auth: adapters.auth,
    context: { dataMode: "live", environment: "production" },
    delivery: adapters.delivery,
    store: new FirestoreLiveVendorLifecycleStore(),
  });
}

function assertAdminActor(actor: AuthenticatedUser) {
  if (actor.role !== "Admin" || !actor.uid.trim()) {
    throw runtimeError(
      "Admin authority is required for a Live Vendor lifecycle action.",
      "vendor_lifecycle_admin_required",
      403,
    );
  }
}

function exactExternalVendorEmail(value: string) {
  const email = normalizeLiveVendorEmail(value);
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (email.endsWith("@pmikcmetro.com")) {
    throw runtimeError(
      "A managed staff identity cannot become an external Vendor.",
      "vendor_lifecycle_staff_identity_forbidden",
    );
  }
  if (
    domain === "localhost" ||
    domain === "example.com" ||
    domain === "example.net" ||
    domain === "example.org" ||
    domain.endsWith(".example.com") ||
    domain.endsWith(".example.net") ||
    domain.endsWith(".example.org") ||
    domain.endsWith(".invalid") ||
    domain.endsWith(".test") ||
    domain.endsWith(".example") ||
    domain.endsWith(".localhost")
  ) {
    throw runtimeError(
      "A reserved Demo or Test address cannot become a Live Vendor identity.",
      "vendor_lifecycle_synthetic_identity_forbidden",
    );
  }
  return email;
}

function exactText(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw runtimeError(`${label} is invalid.`, "vendor_lifecycle_value_invalid", 400);
  }
  return normalized;
}

function exactIsoInstant(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
    ? value
    : null;
}

function exactReason(value: string) {
  const reason = value.trim();
  if (
    reason.length < 3 ||
    reason.length > 500 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reason)
  ) {
    throw runtimeError(
      "A bounded plain-English Vendor lifecycle reason is required.",
      "vendor_lifecycle_reason_invalid",
      400,
    );
  }
  return reason;
}

function generationRef(kind: string, id: string, generation: string) {
  return `${kind}:${id}:generation:${sha256(generation)}`;
}

function isLiveVendorLifecycleActionKey(
  value: unknown,
): value is LiveVendorLifecycleActionKey {
  return (
    value === "vendor.account.invite" ||
    value === "vendor.account.disable" ||
    value === "vendor.assignment.change"
  );
}

function requiredPreparedContextHash(value: string | undefined) {
  if (!value || !/^[a-f0-9]{64}$/.test(value)) {
    throw runtimeError(
      "The S20 execution did not expose its exact external context hash.",
      "vendor_lifecycle_prepared_context_missing",
    );
  }
  return value;
}

function runtimeError(
  message: string,
  code: string,
  status: 400 | 403 | 409 | 503 = 409,
) {
  // The service error's public status union excludes 403 because the route normally
  // authenticates first. Preserve the direct-call defense with a normal 409 response.
  return new LiveVendorLifecycleError(message, status === 403 ? 409 : status, code);
}
