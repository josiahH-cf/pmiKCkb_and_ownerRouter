import type {
  DocumentData,
  DocumentSnapshot,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { canonicalJson, hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  externalActionContextHash,
  externalActionIdempotencyKey,
} from "@/lib/external-execution/identity";
import type {
  ExternalActionPreparationInput,
  TrustedExternalExecutionContext,
} from "@/lib/external-execution/s20-bridge";
import type { ExternalActionReceipt } from "@/lib/external-execution/types";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  assertClaimedActionExecutionInTransaction,
  assertUnclaimedActionExecutionInTransaction,
  resolveClaimedNotApplicableFenceInTransaction,
} from "@/lib/firestore/action-executions";
import {
  LiveVendorLifecycleConflictError,
  LIVE_VENDOR_DISABLE_COMPLETION_LEASE_MS,
  LIVE_VENDOR_DISABLE_INITIAL_SOURCE,
  LIVE_VENDOR_IDENTITY_CLAIM_COLLECTION,
  LIVE_VENDOR_INVITE_READBACK_LEASE_MS,
  LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS,
  LIVE_VENDOR_NO_ASSIGNMENT_REF,
  canonicalLiveAssignmentRefs,
  hashLiveVendorAssignmentPayload,
  hashLiveVendorContact,
  hashLiveVendorDisablePayload,
  hashLiveVendorInvitePayload,
  liveVendorIdentityClaimId,
  liveVendorAssignmentActionValues,
  liveVendorAssignmentProviderRef,
  liveVendorDisableActionValues,
  liveVendorInviteActionValues,
  liveVendorInviteDerivedRefs,
  liveVendorLifecycleAuditId,
  liveVendorLifecycleExecutionId,
  liveVendorLifecycleReceiptId,
  liveVendorInviteRfcMessageId,
  liveVendorS20ExecutionId,
  normalizeLiveVendorEmail,
  parseOptionalLiveVendorLifecycleReceipt,
  sha256,
  type ClaimLiveVendorInviteInput,
  type CommitLiveVendorAssignmentInput,
  type DisableLiveVendorAccessInput,
  type LiveVendorAssignmentBindings,
  type LiveVendorAssignmentInput,
  type LiveVendorDisableBindings,
  type LiveVendorDisableInput,
  type LiveVendorInviteBindings,
  type LiveVendorInviteInput,
  type LiveVendorLifecycleActionKey,
  type LiveVendorLifecycleExecutionRecord,
  type LiveVendorLifecycleReceipt,
  type LiveVendorLifecycleStore,
  type LiveVendorProjection,
} from "@/lib/vendor/live-lifecycle-contract";

export const LIVE_VENDOR_LIFECYCLE_COLLECTIONS = {
  executions: "vendor_lifecycle_executions",
  audit: "vendor_lifecycle_execution_audit",
  s20Index: "vendor_lifecycle_s20_index",
  identityClaims: LIVE_VENDOR_IDENTITY_CLAIM_COLLECTION,
  vendors: "vendors",
  tickets: "maintenance_tickets",
  assignments: "vendor_ticket_assignments",
  maintenanceActivity: "maintenance_ticket_activity",
  vendorAudit: "vendor_audit",
  mailboxConnections: "vendor_mailbox_connections",
  tokenRevocations: "vendor_token_revocation_queue",
  disableCompletionClaims: "vendor_disable_completion_claims",
  preparedAttempts: "vendor_lifecycle_prepared_attempts",
} as const;

// Connected-mailbox disable adds the connection, revocation queue, and completion-claim writes. At
// 164 assignments the complete transaction is exactly 500 writes; 165 would exceed Firestore's cap.
export const LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS = 164;

interface VendorIdentityClaim {
  schemaVersion: 1;
  emailHash: string;
  vendorRef: string;
  vendorUid: string;
  executionId: string;
  dataMode: "live";
  createdAt: string;
  updatedAt: string;
}

interface VendorLifecycleS20Index {
  schemaVersion: 1;
  s20ExecutionId: string;
  executionId: string;
  actionKey: LiveVendorLifecycleActionKey;
  dataMode: "live";
  createdAt: string;
}

export type LiveVendorPreparedAttemptVariant =
  | "standard"
  | "invite_correction"
  | "setup_link_reissue"
  | "disable_completion_recovery";

export interface LiveVendorPreparedAttemptSelection {
  readonly action: ExternalActionPreparationInput;
  readonly dependencyExecutionIds?: Readonly<Record<string, string>>;
  readonly trustedContext: TrustedExternalExecutionContext;
  readonly variant?: LiveVendorPreparedAttemptVariant;
}

interface StoredPreparedAction {
  readonly actionId: string;
  readonly actionKey: LiveVendorLifecycleActionKey;
  readonly connectionRef: string;
  readonly contractRef: string;
  readonly dataMode: "live";
  readonly mappingRef: string;
  readonly sourceRefs: readonly string[];
  /** Exact primitive projection with the lifecycle `reason` deliberately removed. */
  readonly values: Readonly<Record<string, string | number | boolean>>;
  readonly workflowId: string;
}

export interface LiveVendorPreparedAttemptSnapshot {
  readonly schemaVersion: 1;
  readonly s20ExecutionId: string;
  readonly actionKey: LiveVendorLifecycleActionKey;
  readonly actorUid: string;
  readonly previewHash: string;
  readonly contextHash: string;
  readonly action: StoredPreparedAction;
  readonly dependencyExecutionIds?: Readonly<Record<string, string>>;
  readonly trustedContext: TrustedExternalExecutionContext;
  readonly variant: LiveVendorPreparedAttemptVariant;
  readonly reasonHash: string;
  readonly snapshotHash: string;
  readonly state: "prepared" | "fenced";
  readonly createdAt: string;
  readonly fencedAt?: string;
}

export interface ValidateLiveVendorPreparedAttemptInput {
  readonly executionId: string;
  readonly previewHash: string;
  readonly contextHash: string;
  readonly selection: LiveVendorPreparedAttemptSelection;
}

export interface PersistLiveVendorPreparedAttemptInput extends ValidateLiveVendorPreparedAttemptInput {
  readonly createdAt: string;
}

export type FenceLiveVendorPreparedAttemptResult =
  | { readonly status: "provider_started" }
  | {
      readonly status: "fenced";
      readonly duplicate: boolean;
      readonly receipt: Readonly<ExternalActionReceipt>;
    };

interface StoredVendorRecord {
  id: string;
  uid: string;
  email: string;
  displayName?: string;
  status: "pending_setup" | "active" | "disabled";
  inviteVersion: number;
  data_mode: "live";
  identityState?: {
    emailVerified: boolean;
    totpRequired: true;
    totpVerified: boolean;
  };
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
  disabledAt?: string;
  setupEffectFence?: unknown;
}

interface StoredTicketRecord {
  id: string;
  data_mode: "live";
  vendor_id?: string;
  updated_at: string;
  [key: string]: unknown;
}

interface StoredAssignmentRecord {
  ticket_id: string;
  vendor_id: string;
  active: boolean;
  data_mode: "live";
  updated_at?: string;
}

interface StoredMailboxConnection {
  vendorId: string;
  mailboxEmail: string;
  provider: "google";
  status: "connected" | "revocation_pending" | "revoked";
  scopes: readonly string[];
  tokenSecretRef: string;
  dataMode: "live";
  connectedAt: string;
  updatedAt: string;
}

interface StoredTokenRevocation {
  vendorId: string;
  tokenSecretRef: string;
  status: "pending";
  createdAt: string;
  updatedAt?: string;
}

export interface LiveVendorDisableCompletionClaim {
  schemaVersion: 1;
  vendorRef: string;
  vendorUid: string;
  rootExecutionId: string;
  rootS20ExecutionId: string;
  accessDisabledAt: string;
  completionGeneration: number;
  ownerExecutionId: string;
  ownerS20ExecutionId: string;
  ownerLeaseExpiresAt: string;
  dataMode: "live";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export class FirestoreLiveVendorLifecycleStore implements LiveVendorLifecycleStore {
  readonly persistence = "firestore" as const;

  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async persistPreparedAttempt(
    actor: AuthenticatedUser,
    input: PersistLiveVendorPreparedAttemptInput,
  ): Promise<LiveVendorPreparedAttemptSnapshot> {
    const prepared = createLiveVendorPreparedAttemptSnapshot(actor, input);
    const ref = this.preparedAttemptRef(input.executionId);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        const existing = readPreparedAttempt(snapshot);
        assertPreparedAttemptMatches(existing, prepared, false);
        return;
      }
      await assertUnclaimedActionExecutionInTransaction(
        transaction,
        this.db,
        actor,
        input.executionId,
        preparedAttemptBinding(prepared),
      );
      transaction.create(ref, prepared);
    });
    return this.getPreparedAttempt(input.executionId).then((snapshot) => {
      if (!snapshot) throw conflict("The prepared Vendor attempt was not persisted.");
      return snapshot;
    });
  }

  async getPreparedAttempt(
    s20ExecutionId: string,
  ): Promise<LiveVendorPreparedAttemptSnapshot | null> {
    assertS20ExecutionIdentity(s20ExecutionId);
    const snapshot = await this.preparedAttemptRef(s20ExecutionId).get();
    return snapshot.exists ? readPreparedAttempt(snapshot) : null;
  }

  async requirePreparedAttempt(
    actor: AuthenticatedUser,
    input: ValidateLiveVendorPreparedAttemptInput,
  ): Promise<LiveVendorPreparedAttemptSnapshot> {
    const actual = await this.getPreparedAttempt(input.executionId);
    if (!actual) {
      throw conflict(
        "The immutable Vendor provider-attempt snapshot is unavailable; prepare again before claiming S20.",
      );
    }
    const expected = createLiveVendorPreparedAttemptSnapshot(
      actor,
      {
        ...input,
        createdAt: actual.createdAt,
      },
      actual.actorUid,
    );
    assertPreparedAttemptMatches(actual, expected, true);
    return actual;
  }

  async fencePreparedAttempt(
    actor: AuthenticatedUser,
    input: ValidateLiveVendorPreparedAttemptInput,
  ): Promise<FenceLiveVendorPreparedAttemptResult> {
    const preparedRef = this.preparedAttemptRef(input.executionId);
    const indexRef = this.s20IndexRef(input.executionId);

    return this.db.runTransaction(async (transaction) => {
      const [preparedSnapshot, indexSnapshot] = await Promise.all([
        transaction.get(preparedRef),
        transaction.get(indexRef),
      ]);
      if (!preparedSnapshot.exists) {
        throw conflict(
          "The immutable Vendor provider-attempt snapshot is unavailable for reconciliation.",
        );
      }
      const prepared = readPreparedAttempt(preparedSnapshot);
      const expected = createLiveVendorPreparedAttemptSnapshot(
        actor,
        {
          ...input,
          createdAt: prepared.createdAt,
        },
        prepared.actorUid,
      );
      assertPreparedAttemptBindingMatches(prepared, expected);

      if (indexSnapshot.exists) {
        if (prepared.state === "fenced") {
          throw conflict(
            "The Vendor provider-start marker conflicts with a fenced S20 attempt.",
          );
        }
        assertS20IndexMarker(indexSnapshot, prepared);
        return { status: "provider_started" as const };
      }
      assertPreparedAttemptMatches(prepared, expected, false);

      const receipt = fencedAttemptReceipt(prepared);
      await resolveClaimedNotApplicableFenceInTransaction(
        transaction,
        this.db,
        actor,
        input.executionId,
        receipt,
        preparedAttemptBinding(prepared),
      );
      const duplicate = prepared.state === "fenced";
      if (!duplicate) {
        transaction.update(preparedRef, {
          state: "fenced",
          // This is audit metadata only. Receipt identity and result code are fully deterministic.
          fencedAt: new Date().toISOString(),
        });
      }
      return { status: "fenced" as const, duplicate, receipt };
    });
  }

  async getExecution(
    actionKey: LiveVendorLifecycleActionKey,
    idempotencyKey: string,
  ): Promise<LiveVendorLifecycleExecutionRecord | null> {
    const id = liveVendorLifecycleExecutionId(actionKey, idempotencyKey);
    const snapshot = await this.executionRef(id).get();
    return snapshot.exists
      ? readExecution(snapshot as DocumentSnapshot<DocumentData>)
      : null;
  }

  async getExecutionByS20ExecutionId(
    s20ExecutionId: string,
  ): Promise<LiveVendorLifecycleExecutionRecord | null> {
    if (!/^exec_[a-f0-9]{40}$/.test(s20ExecutionId)) {
      throw conflict("The S20 execution identity is invalid.");
    }
    const indexSnapshot = await this.s20IndexRef(s20ExecutionId).get();
    if (!indexSnapshot.exists) return null;
    const index = indexSnapshot.data() as VendorLifecycleS20Index;
    if (
      index.schemaVersion !== 1 ||
      index.s20ExecutionId !== s20ExecutionId ||
      index.dataMode !== "live" ||
      !LIVE_ACTION_KEYS.has(index.actionKey)
    ) {
      throw conflict("The S20 Vendor lifecycle index is malformed.");
    }
    const executionSnapshot = await this.executionRef(index.executionId).get();
    if (!executionSnapshot.exists) {
      throw conflict("The indexed Vendor lifecycle execution is unavailable.");
    }
    const execution = readExecution(executionSnapshot);
    if (
      execution.s20ExecutionId !== s20ExecutionId ||
      execution.actionKey !== index.actionKey
    ) {
      throw conflict("The S20 Vendor lifecycle index does not match its execution.");
    }
    return execution;
  }

  async getInviteReservation(
    email: string,
  ): Promise<LiveVendorLifecycleExecutionRecord | null> {
    const claimSnapshot = await this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.identityClaims)
      .doc(liveVendorIdentityClaimId(email))
      .get();
    if (!claimSnapshot.exists) return null;
    const claim = claimSnapshot.data() as VendorIdentityClaim;
    if (
      claim.schemaVersion !== 1 ||
      claim.emailHash !== sha256(normalizeLiveVendorEmail(email)) ||
      claim.dataMode !== "live" ||
      !claim.executionId?.trim()
    ) {
      throw conflict("The Vendor identity reservation is malformed.");
    }
    const executionSnapshot = await this.executionRef(claim.executionId).get();
    if (!executionSnapshot.exists) {
      throw conflict("The Vendor identity reservation has no execution.");
    }
    const execution = readExecution(executionSnapshot);
    if (
      execution.actionKey !== "vendor.account.invite" ||
      execution.bindings.kind !== "invite" ||
      execution.bindings.emailHash !== claim.emailHash ||
      execution.bindings.vendorRef !== claim.vendorRef ||
      execution.bindings.vendorUid !== claim.vendorUid
    ) {
      throw conflict("The Vendor identity reservation does not match its execution.");
    }
    return execution;
  }

  async getVendor(vendorRef: string): Promise<LiveVendorProjection | null> {
    const snapshot = await this.vendorRef(vendorRef).get();
    if (!snapshot.exists) return null;
    const record = readVendor(snapshot as DocumentSnapshot<DocumentData>);
    return {
      id: record.id,
      uid: record.uid,
      email: record.email,
      company: record.displayName ?? "",
      status: record.status,
      inviteVersion: record.inviteVersion,
      dataMode: "live",
      updatedAt: record.updatedAt,
    };
  }

  async claimInvite(
    input: ClaimLiveVendorInviteInput,
  ): Promise<LiveVendorLifecycleExecutionRecord> {
    assertTransitionNow(input.nowIso);
    assertInviteCommandGeneration(input.command, "initial");
    assertExecutionId(
      "vendor.account.invite",
      input.command.idempotencyKey,
      input.executionId,
    );
    const email = normalizeLiveVendorEmail(input.command.email);
    const identityClaimRef = this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.identityClaims)
      .doc(liveVendorIdentityClaimId(email));
    const executionRef = this.executionRef(input.executionId);
    const ticketRef = this.ticketRef(input.command.ticketRef);
    const vendorRef = this.vendorRef(input.vendorRef);
    const preparedRef = this.preparedAttemptRef(
      liveVendorS20ExecutionId("vendor.account.invite", input.command.idempotencyKey),
    );

    return this.db.runTransaction(async (transaction) => {
      const [executionSnapshot, preparedSnapshot] = await Promise.all([
        transaction.get(executionRef),
        transaction.get(preparedRef),
      ]);
      await assertPreparedProviderStart(transaction, this.db, preparedSnapshot, {
        actionKey: "vendor.account.invite",
        command: input.command,
        executionId: input.executionId,
        payloadHash: input.payloadHash,
        providerVendorRef: input.vendorRef,
        providerVendorUid: input.vendorUid,
        rfcMessageId: input.rfcMessageId,
      });
      const existing = executionSnapshot.exists ? readExecution(executionSnapshot) : null;
      if (existing) {
        assertPayload(existing, input.payloadHash);
        if (
          existing.state === "succeeded" ||
          existing.state === "ambiguous" ||
          existing.phase === "delivery_claimed"
        ) {
          return existing;
        }
      }

      const [ticketSnapshot, identityClaimSnapshot, vendorSnapshot] = await Promise.all([
        transaction.get(ticketRef),
        transaction.get(identityClaimRef),
        transaction.get(vendorRef),
      ]);
      assertLiveTicketGeneration(
        ticketSnapshot,
        input.command.ticketRef,
        input.command.ticketUpdatedAt,
      );

      const bindings: LiveVendorInviteBindings = {
        kind: "invite",
        inviteMode: "initial",
        issuedInviteVersion: 1,
        inviteVersion: 0,
        vendorUpdatedAt: "generation:new",
        vendorRef: input.vendorRef,
        vendorUid: input.vendorUid,
        emailHash: sha256(email),
        companyHash: hashLiveVendorContact(input.command.company),
        ticketRef: input.command.ticketRef,
        ticketUpdatedAt: input.command.ticketUpdatedAt,
        artifactRef: input.command.artifactRef,
        rfcMessageId: input.rfcMessageId,
      };

      if (identityClaimSnapshot.exists) {
        const claim = identityClaimSnapshot.data() as VendorIdentityClaim;
        if (
          claim.emailHash !== bindings.emailHash ||
          claim.vendorRef !== input.vendorRef ||
          claim.vendorUid !== input.vendorUid ||
          claim.executionId !== input.executionId ||
          claim.dataMode !== "live"
        ) {
          throw conflict("That Vendor email is already bound to another identity.");
        }
      }

      if (vendorSnapshot.exists) {
        assertExactReservedVendor(
          readVendor(vendorSnapshot),
          input.vendorRef,
          input.vendorUid,
          email,
          input.command.company,
        );
      }

      if (existing) return existing;

      const record: LiveVendorLifecycleExecutionRecord = {
        schemaVersion: 1,
        id: input.executionId,
        s20ExecutionId: liveVendorS20ExecutionId(
          "vendor.account.invite",
          input.command.idempotencyKey,
        ),
        actionKey: "vendor.account.invite",
        idempotencyKeyHash: sha256(input.command.idempotencyKey),
        payloadHash: input.payloadHash,
        actorUid: input.command.actorUid,
        environment: "production",
        dataMode: "live",
        state: "running",
        phase: "identity_reserved",
        attemptCount: 1,
        bindings,
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
      };
      transaction.create(executionRef, record);
      transaction.create(
        this.s20IndexRef(record.s20ExecutionId),
        s20Index(record, input.nowIso),
      );
      transaction.create(
        this.auditRef(record.id, "identity_reserved"),
        lifecycleAudit(record, "identity_reserved", input.nowIso),
      );
      if (!identityClaimSnapshot.exists) {
        const claim: VendorIdentityClaim = {
          schemaVersion: 1,
          emailHash: bindings.emailHash,
          vendorRef: input.vendorRef,
          vendorUid: input.vendorUid,
          executionId: input.executionId,
          dataMode: "live",
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        };
        transaction.create(identityClaimRef, claim);
      }
      if (!vendorSnapshot.exists) {
        const vendor: StoredVendorRecord = {
          id: input.vendorRef,
          uid: input.vendorUid,
          email,
          displayName: input.command.company.trim(),
          status: "pending_setup",
          inviteVersion: 1,
          data_mode: "live",
          identityState: {
            emailVerified: false,
            totpRequired: true,
            totpVerified: false,
          },
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        };
        transaction.create(vendorRef, vendor);
      }
      transaction.create(
        this.vendorAuditRef(record.id, "invite_reserved"),
        vendorAudit({
          actorUid: record.actorUid,
          vendorId: input.vendorRef,
          ticketId: input.command.ticketRef,
          action: "live_vendor_invite_reserved",
          reasonHash: sha256(input.command.reason.trim()),
          createdAt: input.nowIso,
        }),
      );
      return record;
    });
  }

  async supersedeInvite(
    input: ClaimLiveVendorInviteInput & {
      supersededExecutionId: string;
    },
  ): Promise<LiveVendorLifecycleExecutionRecord> {
    assertTransitionNow(input.nowIso);
    assertInviteCommandGeneration(input.command, "delivery_recovery");
    assertExecutionId(
      "vendor.account.invite",
      input.command.idempotencyKey,
      input.executionId,
    );
    if (input.executionId === input.supersededExecutionId) {
      throw conflict("A Vendor invite cannot supersede itself.");
    }
    const email = normalizeLiveVendorEmail(input.command.email);
    const claimRef = this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.identityClaims)
      .doc(liveVendorIdentityClaimId(email));
    const oldExecutionRef = this.executionRef(input.supersededExecutionId);
    const newExecutionRef = this.executionRef(input.executionId);
    const ticketRef = this.ticketRef(input.command.ticketRef);
    const preparedRef = this.preparedAttemptRef(
      liveVendorS20ExecutionId("vendor.account.invite", input.command.idempotencyKey),
    );

    return this.db.runTransaction(async (transaction) => {
      const [
        oldExecutionSnapshot,
        newExecutionSnapshot,
        claimSnapshot,
        ticketSnapshot,
        preparedSnapshot,
      ] = await Promise.all([
        transaction.get(oldExecutionRef),
        transaction.get(newExecutionRef),
        transaction.get(claimRef),
        transaction.get(ticketRef),
        transaction.get(preparedRef),
      ]);
      const prior = requireExecution(oldExecutionSnapshot);
      await assertPreparedProviderStart(transaction, this.db, preparedSnapshot, {
        actionKey: "vendor.account.invite",
        command: input.command,
        executionId: input.executionId,
        lineage: {
          executionId: prior.id,
          s20ExecutionId: prior.s20ExecutionId,
        },
        payloadHash: input.payloadHash,
        providerVendorRef: input.vendorRef,
        providerVendorUid: input.vendorUid,
        rfcMessageId: input.rfcMessageId,
      });
      if (newExecutionSnapshot.exists) {
        const existing = readExecution(newExecutionSnapshot);
        assertPayload(existing, input.payloadHash);
        return existing;
      }
      if (
        prior.actionKey !== "vendor.account.invite" ||
        prior.bindings.kind !== "invite" ||
        prior.state === "succeeded" ||
        prior.state === "superseded" ||
        prior.receipt ||
        (prior.phase !== "identity_reserved" &&
          prior.phase !== "identity_ready" &&
          prior.phase !== "recovery_abandoned")
      ) {
        throw conflict("The prior Vendor invite cannot be superseded.");
      }
      if (!claimSnapshot.exists) {
        throw conflict("The Vendor identity reservation is unavailable.");
      }
      const claim = claimSnapshot.data() as VendorIdentityClaim;
      if (
        claim.executionId !== prior.id ||
        claim.vendorRef !== prior.bindings.vendorRef ||
        claim.vendorUid !== prior.bindings.vendorUid ||
        claim.emailHash !== prior.bindings.emailHash ||
        claim.dataMode !== "live"
      ) {
        throw conflict("The Vendor identity reservation changed during recovery.");
      }
      if (
        prior.bindings.emailHash !== sha256(email) ||
        prior.bindings.companyHash !== hashLiveVendorContact(input.command.company)
      ) {
        throw conflict("A correction cannot change the reserved Vendor identity.");
      }
      assertLiveTicketGeneration(
        ticketSnapshot,
        input.command.ticketRef,
        input.command.ticketUpdatedAt,
      );
      const vendorRef = this.vendorRef(prior.bindings.vendorRef);
      const vendorSnapshot = await transaction.get(vendorRef);
      const reservedVendor = readVendor(vendorSnapshot);
      assertExactReservedVendor(
        reservedVendor,
        prior.bindings.vendorRef,
        prior.bindings.vendorUid,
        email,
        input.command.company,
      );
      assertInviteVendorGeneration(reservedVendor, input.command);
      assertVendorSetupEffectsIdle(reservedVendor);

      const bindings: LiveVendorInviteBindings = {
        kind: "invite",
        inviteMode: "delivery_recovery",
        issuedInviteVersion: input.command.inviteVersion,
        inviteVersion: input.command.inviteVersion,
        vendorUpdatedAt: input.command.vendorUpdatedAt,
        vendorRef: prior.bindings.vendorRef,
        vendorUid: prior.bindings.vendorUid,
        emailHash: prior.bindings.emailHash,
        companyHash: prior.bindings.companyHash,
        ticketRef: input.command.ticketRef,
        ticketUpdatedAt: input.command.ticketUpdatedAt,
        artifactRef: input.command.artifactRef,
        rfcMessageId: input.rfcMessageId,
        supersededExecutionId: prior.id,
        supersededS20ExecutionId: prior.s20ExecutionId,
        supersessionHash: sha256(`${prior.id}\0${prior.s20ExecutionId}`),
      };
      const replacement = baseRecord({
        id: input.executionId,
        actionKey: "vendor.account.invite",
        idempotencyKey: input.command.idempotencyKey,
        payloadHash: input.payloadHash,
        actorUid: input.command.actorUid,
        bindings,
        phase: "identity_reserved",
        state: "running",
        nowIso: input.nowIso,
      });
      const superseded: LiveVendorLifecycleExecutionRecord = {
        ...prior,
        state: "superseded",
        supersededByExecutionId: replacement.id,
        updatedAt: input.nowIso,
      };

      transaction.set(oldExecutionRef, superseded);
      transaction.create(newExecutionRef, replacement);
      transaction.create(
        this.s20IndexRef(replacement.s20ExecutionId),
        s20Index(replacement, input.nowIso),
      );
      transaction.set(claimRef, {
        ...claim,
        executionId: replacement.id,
        updatedAt: input.nowIso,
      } satisfies VendorIdentityClaim);
      transaction.create(
        this.auditRef(prior.id, "superseded"),
        lifecycleAudit(superseded, "superseded", input.nowIso),
      );
      transaction.create(
        this.auditRef(replacement.id, "identity_recovered"),
        lifecycleAudit(replacement, "identity_recovered", input.nowIso),
      );
      transaction.create(
        this.vendorAuditRef(replacement.id, "invite_recovered"),
        vendorAudit({
          actorUid: input.command.actorUid,
          vendorId: replacement.bindings.vendorRef,
          ticketId: input.command.ticketRef,
          action: "live_vendor_invite_recovered",
          reasonHash: sha256(input.command.reason.trim()),
          createdAt: input.nowIso,
        }),
      );
      return replacement;
    });
  }

  /**
   * Reissues setup for one exact pending-setup generation. The predecessor remains a successful,
   * immutable receipt; this transaction advances the Vendor invite version, creates a new one-attempt
   * execution, and repoints the email claim together so every older setup challenge becomes stale.
   */
  async reissueSetupLink(
    input: ClaimLiveVendorInviteInput & {
      predecessorExecutionId: string;
    },
  ): Promise<LiveVendorLifecycleExecutionRecord> {
    assertTransitionNow(input.nowIso);
    assertInviteCommandGeneration(input.command, "setup_link_reissue");
    assertExecutionId(
      "vendor.account.invite",
      input.command.idempotencyKey,
      input.executionId,
    );
    if (input.executionId === input.predecessorExecutionId) {
      throw conflict("A Vendor setup-link reissue cannot replace itself.");
    }
    const email = normalizeLiveVendorEmail(input.command.email);
    const claimRef = this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.identityClaims)
      .doc(liveVendorIdentityClaimId(email));
    const predecessorRef = this.executionRef(input.predecessorExecutionId);
    const executionRef = this.executionRef(input.executionId);
    const ticketRef = this.ticketRef(input.command.ticketRef);
    const vendorRef = this.vendorRef(input.command.vendorRef);
    const preparedRef = this.preparedAttemptRef(
      liveVendorS20ExecutionId("vendor.account.invite", input.command.idempotencyKey),
    );

    return this.db.runTransaction(async (transaction) => {
      const [
        predecessorSnapshot,
        executionSnapshot,
        claimSnapshot,
        ticketSnapshot,
        vendorSnapshot,
        preparedSnapshot,
      ] = await Promise.all([
        transaction.get(predecessorRef),
        transaction.get(executionRef),
        transaction.get(claimRef),
        transaction.get(ticketRef),
        transaction.get(vendorRef),
        transaction.get(preparedRef),
      ]);
      const predecessor = requireExecution(predecessorSnapshot);
      await assertPreparedProviderStart(transaction, this.db, preparedSnapshot, {
        actionKey: "vendor.account.invite",
        command: input.command,
        executionId: input.executionId,
        lineage: {
          executionId: predecessor.id,
          s20ExecutionId: predecessor.s20ExecutionId,
        },
        payloadHash: input.payloadHash,
        providerVendorRef: input.vendorRef,
        providerVendorUid: input.vendorUid,
        rfcMessageId: input.rfcMessageId,
      });
      if (executionSnapshot.exists) {
        const existing = readExecution(executionSnapshot);
        assertPayload(existing, input.payloadHash);
        if (
          existing.actionKey !== "vendor.account.invite" ||
          existing.bindings.kind !== "invite" ||
          existing.bindings.inviteMode !== "setup_link_reissue" ||
          existing.bindings.supersededExecutionId !== input.predecessorExecutionId
        ) {
          throw conflict("The Vendor setup-link reissue identity is already bound.");
        }
        return existing;
      }

      if (
        predecessor.actionKey !== "vendor.account.invite" ||
        predecessor.bindings.kind !== "invite" ||
        predecessor.state !== "succeeded" ||
        predecessor.phase !== "succeeded" ||
        !predecessor.receipt ||
        predecessor.receipt.state !== "pending_setup"
      ) {
        throw conflict(
          "A setup link may be reissued only from a successful pending-setup invitation.",
        );
      }
      const claim = requireIdentityClaim(claimSnapshot);
      if (
        claim.executionId !== predecessor.id ||
        claim.vendorRef !== predecessor.bindings.vendorRef ||
        claim.vendorUid !== predecessor.bindings.vendorUid ||
        claim.emailHash !== predecessor.bindings.emailHash
      ) {
        throw conflict("The Vendor identity claim changed before setup-link reissue.");
      }
      if (
        predecessor.bindings.emailHash !== sha256(email) ||
        predecessor.bindings.companyHash !== hashLiveVendorContact(input.command.company)
      ) {
        throw conflict("A setup-link reissue cannot change the Vendor identity.");
      }
      assertLiveTicketGeneration(
        ticketSnapshot,
        input.command.ticketRef,
        input.command.ticketUpdatedAt,
      );
      const vendor = readVendor(vendorSnapshot);
      assertExactReservedVendor(
        vendor,
        input.command.vendorRef,
        input.command.vendorUid,
        email,
        input.command.company,
      );
      assertInviteVendorGeneration(vendor, input.command);
      assertVendorSetupEffectsIdle(vendor);
      const issuedInviteVersion = input.command.inviteVersion + 1;
      if (!Number.isSafeInteger(issuedInviteVersion)) {
        throw conflict("The Vendor invite version cannot be advanced safely.");
      }

      const bindings: LiveVendorInviteBindings = {
        kind: "invite",
        inviteMode: "setup_link_reissue",
        issuedInviteVersion,
        inviteVersion: input.command.inviteVersion,
        vendorUpdatedAt: input.command.vendorUpdatedAt,
        vendorRef: vendor.id,
        vendorUid: vendor.uid,
        emailHash: predecessor.bindings.emailHash,
        companyHash: predecessor.bindings.companyHash,
        ticketRef: input.command.ticketRef,
        ticketUpdatedAt: input.command.ticketUpdatedAt,
        artifactRef: input.command.artifactRef,
        rfcMessageId: input.rfcMessageId,
        supersededExecutionId: predecessor.id,
        supersededS20ExecutionId: predecessor.s20ExecutionId,
        supersessionHash: sha256(`${predecessor.id}\0${predecessor.s20ExecutionId}`),
      };
      const replacement = baseRecord({
        id: input.executionId,
        actionKey: "vendor.account.invite",
        idempotencyKey: input.command.idempotencyKey,
        payloadHash: input.payloadHash,
        actorUid: input.command.actorUid,
        bindings,
        phase: "identity_reserved",
        state: "running",
        nowIso: input.nowIso,
      });

      transaction.create(executionRef, replacement);
      transaction.create(
        this.s20IndexRef(replacement.s20ExecutionId),
        s20Index(replacement, input.nowIso),
      );
      transaction.set(claimRef, {
        ...claim,
        executionId: replacement.id,
        updatedAt: input.nowIso,
      } satisfies VendorIdentityClaim);
      transaction.set(vendorRef, {
        ...vendor,
        inviteVersion: issuedInviteVersion,
        updatedAt: input.nowIso,
      } satisfies StoredVendorRecord);
      transaction.create(
        this.auditRef(replacement.id, "setup_link_reissue_reserved"),
        lifecycleAudit(replacement, "setup_link_reissue_reserved", input.nowIso),
      );
      transaction.create(
        this.vendorAuditRef(replacement.id, "setup_link_reissued"),
        vendorAudit({
          actorUid: input.command.actorUid,
          vendorId: vendor.id,
          ticketId: input.command.ticketRef,
          action: "live_vendor_setup_link_reissued",
          reasonHash: sha256(input.command.reason.trim()),
          createdAt: input.nowIso,
        }),
      );
      return replacement;
    });
  }

  /**
   * Durably claims the corrective S20 identity before Gmail absence readback. This closes the
   * failure window where S20 had consumed the correction but an ambiguous read left no execution
   * or exact S20 index to reconcile.
   */
  async claimInviteRecovery(
    input: ClaimLiveVendorInviteInput & {
      supersededExecutionId: string;
    },
  ): Promise<LiveVendorLifecycleExecutionRecord> {
    assertTransitionNow(input.nowIso);
    assertInviteCommandGeneration(input.command, "delivery_recovery");
    assertExecutionId(
      "vendor.account.invite",
      input.command.idempotencyKey,
      input.executionId,
    );
    if (input.executionId === input.supersededExecutionId) {
      throw conflict("A Vendor invite recovery cannot replace itself.");
    }
    const email = normalizeLiveVendorEmail(input.command.email);
    const claimRef = this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.identityClaims)
      .doc(liveVendorIdentityClaimId(email));
    const oldExecutionRef = this.executionRef(input.supersededExecutionId);
    const newExecutionRef = this.executionRef(input.executionId);
    const ticketRef = this.ticketRef(input.command.ticketRef);
    const preparedRef = this.preparedAttemptRef(
      liveVendorS20ExecutionId("vendor.account.invite", input.command.idempotencyKey),
    );

    return this.db.runTransaction(async (transaction) => {
      const [
        oldExecutionSnapshot,
        newExecutionSnapshot,
        claimSnapshot,
        ticketSnapshot,
        preparedSnapshot,
      ] = await Promise.all([
        transaction.get(oldExecutionRef),
        transaction.get(newExecutionRef),
        transaction.get(claimRef),
        transaction.get(ticketRef),
        transaction.get(preparedRef),
      ]);
      const prior = requireExecution(oldExecutionSnapshot);
      await assertPreparedProviderStart(transaction, this.db, preparedSnapshot, {
        actionKey: "vendor.account.invite",
        command: input.command,
        executionId: input.executionId,
        lineage: {
          executionId: prior.id,
          s20ExecutionId: prior.s20ExecutionId,
        },
        payloadHash: input.payloadHash,
        providerVendorRef: input.vendorRef,
        providerVendorUid: input.vendorUid,
        rfcMessageId: input.rfcMessageId,
      });
      if (newExecutionSnapshot.exists) {
        const existing = readExecution(newExecutionSnapshot);
        assertPayload(existing, input.payloadHash);
        if (
          existing.actionKey !== "vendor.account.invite" ||
          existing.bindings.kind !== "invite" ||
          existing.bindings.supersededExecutionId !== input.supersededExecutionId
        ) {
          throw conflict("The Vendor invite recovery identity is already bound.");
        }
        return existing;
      }

      if (
        prior.actionKey !== "vendor.account.invite" ||
        prior.bindings.kind !== "invite" ||
        prior.phase !== "delivery_claimed" ||
        (prior.state !== "running" && prior.state !== "ambiguous") ||
        prior.receipt
      ) {
        throw conflict("The prior Vendor invite has no recoverable delivery claim.");
      }
      const claimedAt = Date.parse(prior.deliveryClaimedAt ?? "");
      const recoveryAt = Date.parse(input.nowIso);
      if (
        !Number.isFinite(claimedAt) ||
        !Number.isFinite(recoveryAt) ||
        recoveryAt - claimedAt < LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS
      ) {
        throw conflict(
          "Vendor invite recovery must wait for the prior setup challenge to expire.",
        );
      }
      if (!claimSnapshot.exists) {
        throw conflict("The Vendor identity reservation is unavailable.");
      }
      const claim = claimSnapshot.data() as VendorIdentityClaim;
      if (
        claim.executionId !== prior.id ||
        claim.vendorRef !== prior.bindings.vendorRef ||
        claim.vendorUid !== prior.bindings.vendorUid ||
        claim.emailHash !== prior.bindings.emailHash ||
        claim.dataMode !== "live"
      ) {
        throw conflict("The Vendor identity reservation changed during recovery.");
      }
      if (
        prior.bindings.emailHash !== sha256(email) ||
        prior.bindings.companyHash !== hashLiveVendorContact(input.command.company)
      ) {
        throw conflict("A correction cannot change the reserved Vendor identity.");
      }
      assertLiveTicketGeneration(
        ticketSnapshot,
        input.command.ticketRef,
        input.command.ticketUpdatedAt,
      );
      const vendorRef = this.vendorRef(prior.bindings.vendorRef);
      const vendorSnapshot = await transaction.get(vendorRef);
      const reservedVendor = readVendor(vendorSnapshot);
      assertExactReservedVendor(
        reservedVendor,
        prior.bindings.vendorRef,
        prior.bindings.vendorUid,
        email,
        input.command.company,
      );
      assertInviteVendorGeneration(reservedVendor, input.command);
      assertVendorSetupEffectsIdle(reservedVendor);

      const bindings: LiveVendorInviteBindings = {
        kind: "invite",
        inviteMode: "delivery_recovery",
        issuedInviteVersion: input.command.inviteVersion,
        inviteVersion: input.command.inviteVersion,
        vendorUpdatedAt: input.command.vendorUpdatedAt,
        vendorRef: prior.bindings.vendorRef,
        vendorUid: prior.bindings.vendorUid,
        emailHash: prior.bindings.emailHash,
        companyHash: prior.bindings.companyHash,
        ticketRef: input.command.ticketRef,
        ticketUpdatedAt: input.command.ticketUpdatedAt,
        artifactRef: input.command.artifactRef,
        rfcMessageId: input.rfcMessageId,
        supersededExecutionId: prior.id,
        supersededS20ExecutionId: prior.s20ExecutionId,
        supersessionHash: sha256(`${prior.id}\0${prior.s20ExecutionId}`),
      };
      const recovery = baseRecord({
        id: input.executionId,
        actionKey: "vendor.account.invite",
        idempotencyKey: input.command.idempotencyKey,
        payloadHash: input.payloadHash,
        actorUid: input.command.actorUid,
        bindings,
        phase: "recovery_readback",
        state: "running",
        nowIso: input.nowIso,
      });

      transaction.create(newExecutionRef, recovery);
      transaction.create(
        this.s20IndexRef(recovery.s20ExecutionId),
        s20Index(recovery, input.nowIso),
      );
      transaction.set(claimRef, {
        ...claim,
        executionId: recovery.id,
        updatedAt: input.nowIso,
      } satisfies VendorIdentityClaim);
      transaction.create(
        this.auditRef(recovery.id, "recovery_readback_claimed"),
        lifecycleAudit(recovery, "recovery_readback_claimed", input.nowIso),
      );
      transaction.create(
        this.vendorAuditRef(recovery.id, "invite_recovery_claimed"),
        vendorAudit({
          actorUid: input.command.actorUid,
          vendorId: recovery.bindings.vendorRef,
          ticketId: input.command.ticketRef,
          action: "live_vendor_invite_recovery_claimed",
          reasonHash: sha256(input.command.reason.trim()),
          createdAt: input.nowIso,
        }),
      );
      return recovery;
    });
  }

  async claimInviteRecoveryReadbackWorker(input: {
    executionId: string;
    payloadHash: string;
    workerToken: string;
    nowIso: string;
  }): Promise<{
    claimed: boolean;
    record: LiveVendorLifecycleExecutionRecord;
  }> {
    assertTransitionNow(input.nowIso);
    const workerTokenHash = recoveryReadbackWorkerTokenHash(input.workerToken);
    const ref = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const record = requireExecution(snapshot);
      assertPayload(record, input.payloadHash);
      if (
        record.actionKey !== "vendor.account.invite" ||
        record.bindings.kind !== "invite" ||
        record.bindings.inviteMode !== "delivery_recovery" ||
        record.phase !== "recovery_readback" ||
        (record.state !== "running" && record.state !== "ambiguous")
      ) {
        return { claimed: false, record };
      }
      if (record.recoveryReadbackWorkerTokenHash === workerTokenHash) {
        return { claimed: true, record };
      }
      const leaseExpiresAt = Date.parse(
        record.recoveryReadbackWorkerLeaseExpiresAt ?? "",
      );
      if (
        record.recoveryReadbackWorkerTokenHash &&
        Number.isFinite(leaseExpiresAt) &&
        leaseExpiresAt > Date.parse(input.nowIso)
      ) {
        return { claimed: false, record };
      }
      const next: LiveVendorLifecycleExecutionRecord = {
        ...record,
        recoveryReadbackWorkerTokenHash: workerTokenHash,
        recoveryReadbackWorkerClaimedAt: input.nowIso,
        recoveryReadbackWorkerLeaseExpiresAt: new Date(
          Date.parse(input.nowIso) + LIVE_VENDOR_INVITE_READBACK_LEASE_MS,
        ).toISOString(),
        updatedAt: input.nowIso,
      };
      transaction.set(ref, next);
      transaction.create(
        this.auditRef(
          record.id,
          `recovery_readback_worker_${workerTokenHash.slice(0, 16)}`,
        ),
        lifecycleAudit(next, "recovery_readback_worker_claimed", input.nowIso),
      );
      return { claimed: true, record: next };
    });
  }

  async releaseInviteRecoveryReadbackWorker(input: {
    executionId: string;
    payloadHash: string;
    workerToken: string;
    nowIso: string;
  }): Promise<boolean> {
    assertTransitionNow(input.nowIso);
    const workerTokenHash = recoveryReadbackWorkerTokenHash(input.workerToken);
    const ref = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const record = requireExecution(snapshot);
      assertPayload(record, input.payloadHash);
      if (
        record.actionKey !== "vendor.account.invite" ||
        record.bindings.kind !== "invite" ||
        record.phase !== "recovery_readback" ||
        (record.state !== "running" && record.state !== "ambiguous") ||
        record.recoveryReadbackWorkerTokenHash !== workerTokenHash
      ) {
        return false;
      }
      const {
        recoveryReadbackWorkerTokenHash: _workerHash,
        recoveryReadbackWorkerClaimedAt: _claimedAt,
        recoveryReadbackWorkerLeaseExpiresAt: _leaseExpiresAt,
        ...released
      } = record;
      void _workerHash;
      void _claimedAt;
      void _leaseExpiresAt;
      transaction.set(ref, {
        ...released,
        updatedAt: input.nowIso,
      } satisfies LiveVendorLifecycleExecutionRecord);
      return true;
    });
  }

  async activateInviteRecovery(input: {
    executionId: string;
    payloadHash: string;
    workerToken: string;
    nowIso: string;
  }): Promise<LiveVendorLifecycleExecutionRecord> {
    assertTransitionNow(input.nowIso);
    const recoveryRef = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const recoverySnapshot = await transaction.get(recoveryRef);
      const recovery = requireExecution(recoverySnapshot);
      assertPayload(recovery, input.payloadHash);
      assertRecoveryReadbackWorker(recovery, input.workerToken, input.nowIso);
      if (
        recovery.actionKey !== "vendor.account.invite" ||
        recovery.bindings.kind !== "invite"
      ) {
        throw conflict("The Vendor invite recovery has the wrong action shape.");
      }
      if (recovery.phase === "identity_reserved" && recovery.state === "running") {
        return recovery;
      }
      if (
        recovery.phase !== "recovery_readback" ||
        (recovery.state !== "running" && recovery.state !== "ambiguous")
      ) {
        throw conflict("The Vendor invite recovery cannot be activated.");
      }
      const sourceId = requiredRecoveryExecutionId(recovery.bindings);
      const sourceRef = this.executionRef(sourceId);
      const claimRef = this.db
        .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.identityClaims)
        .doc(recovery.bindings.emailHash);
      const [sourceSnapshot, claimSnapshot] = await Promise.all([
        transaction.get(sourceRef),
        transaction.get(claimRef),
      ]);
      const source = requireExecution(sourceSnapshot);
      assertRecoverySource(recovery, source);
      if (
        source.phase !== "delivery_claimed" ||
        (source.state !== "running" && source.state !== "ambiguous") ||
        source.receipt
      ) {
        throw conflict("The prior Vendor delivery is no longer recoverable.");
      }
      const claim = requireIdentityClaim(claimSnapshot);
      assertRecoveryClaim(claim, recovery);

      const superseded: LiveVendorLifecycleExecutionRecord = {
        ...source,
        state: "superseded",
        supersededByExecutionId: recovery.id,
        updatedAt: input.nowIso,
      };
      const { lastErrorCode: _lastErrorCode, ...recoverable } = recovery;
      void _lastErrorCode;
      const activated: LiveVendorLifecycleExecutionRecord = {
        ...recoverable,
        state: "running",
        phase: "identity_reserved",
        updatedAt: input.nowIso,
      };

      transaction.set(sourceRef, superseded);
      transaction.set(recoveryRef, activated);
      transaction.set(claimRef, {
        ...claim,
        executionId: activated.id,
        updatedAt: input.nowIso,
      } satisfies VendorIdentityClaim);
      transaction.create(
        this.auditRef(source.id, "superseded"),
        lifecycleAudit(superseded, "superseded", input.nowIso),
      );
      transaction.create(
        this.auditRef(activated.id, "identity_recovered"),
        lifecycleAudit(activated, "identity_recovered", input.nowIso),
      );
      return activated;
    });
  }

  /**
   * Atomically fences an activated corrective invite before reconciliation reports that it made
   * no new delivery. `claimInviteDelivery` and this transition contend on the same execution
   * document: whichever commits first determines whether reconciliation must read Gmail or may
   * safely close the corrective attempt as not applicable.
   */
  async abandonActivatedInviteRecovery(input: {
    executionId: string;
    payloadHash: string;
    nowIso: string;
  }): Promise<{
    abandoned: boolean;
    record: LiveVendorLifecycleExecutionRecord;
  }> {
    assertTransitionNow(input.nowIso);
    const ref = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const record = requireExecution(snapshot);
      assertPayload(record, input.payloadHash);
      if (
        record.actionKey !== "vendor.account.invite" ||
        record.bindings.kind !== "invite" ||
        !record.bindings.supersededExecutionId
      ) {
        throw conflict("The Vendor invite recovery has the wrong action shape.");
      }
      requiredRecoveryExecutionId(record.bindings);
      if (record.phase === "recovery_abandoned" && record.state === "ambiguous") {
        return { abandoned: true, record };
      }
      if (
        record.phase === "identity_effect_claimed" ||
        record.phase === "identity_ready" ||
        record.phase === "delivery_claimed" ||
        record.phase === "delivery_effect_started" ||
        record.state === "succeeded" ||
        record.state === "superseded"
      ) {
        return { abandoned: false, record };
      }
      if (
        record.bindings.inviteMode !== "delivery_recovery" ||
        record.phase !== "identity_reserved" ||
        (record.state !== "running" && record.state !== "ambiguous")
      ) {
        throw conflict("The Vendor invite recovery cannot be safely abandoned.");
      }
      const next: LiveVendorLifecycleExecutionRecord = {
        ...record,
        state: "ambiguous",
        phase: "recovery_abandoned",
        lastErrorCode: "invite_recovery_abandoned_after_absence_readback",
        updatedAt: input.nowIso,
      };
      transaction.set(ref, next);
      transaction.create(
        this.auditRef(record.id, "recovery_abandoned"),
        lifecycleAudit(next, "recovery_abandoned", input.nowIso),
      );
      return { abandoned: true, record: next };
    });
  }

  /**
   * Irreversibly consumes authority for the corrective Firebase identity effect before Auth is
   * called. Recovery abandonment contends on this same execution record and may report no effect
   * only while the record is still `identity_reserved`.
   */
  async claimInvitePrincipalEffect(input: {
    executionId: string;
    payloadHash: string;
    nowIso: string;
  }): Promise<{
    claimed: boolean;
    record: LiveVendorLifecycleExecutionRecord;
  }> {
    assertTransitionNow(input.nowIso);
    const ref = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const record = requireExecution(snapshot);
      assertPayload(record, input.payloadHash);
      if (record.phase === "identity_effect_claimed") {
        return { claimed: false, record };
      }
      if (
        record.actionKey !== "vendor.account.invite" ||
        record.bindings.kind !== "invite" ||
        record.phase !== "identity_reserved" ||
        record.state !== "running"
      ) {
        return { claimed: false, record };
      }
      const [vendorSnapshot, claimSnapshot] = await Promise.all([
        transaction.get(this.vendorRef(record.bindings.vendorRef)),
        transaction.get(
          this.db
            .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.identityClaims)
            .doc(record.bindings.emailHash),
        ),
      ]);
      assertCurrentInviteExternalEffectGeneration(
        readVendor(vendorSnapshot),
        requireIdentityClaim(claimSnapshot),
        record,
      );
      const next: LiveVendorLifecycleExecutionRecord = {
        ...record,
        state: "running",
        phase: "identity_effect_claimed",
        updatedAt: input.nowIso,
      };
      transaction.set(ref, next);
      transaction.create(
        this.auditRef(record.id, "identity_effect_claimed"),
        lifecycleAudit(next, "identity_effect_claimed", input.nowIso),
      );
      return { claimed: true, record: next };
    });
  }

  async resolveInviteRecoveryDelivered(input: {
    executionId: string;
    payloadHash: string;
    deliveryRefHash: string;
    workerToken: string;
    nowIso: string;
  }): Promise<{
    recovery: LiveVendorLifecycleExecutionRecord;
    delivered: LiveVendorLifecycleExecutionRecord;
  }> {
    assertTransitionNow(input.nowIso);
    exactHash(input.deliveryRefHash, "Vendor invite delivery reference");
    const recoveryRef = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const recoverySnapshot = await transaction.get(recoveryRef);
      const recovery = requireExecution(recoverySnapshot);
      assertPayload(recovery, input.payloadHash);
      assertRecoveryReadbackWorker(recovery, input.workerToken, input.nowIso);
      if (
        recovery.actionKey !== "vendor.account.invite" ||
        recovery.bindings.kind !== "invite"
      ) {
        throw conflict("The Vendor invite recovery has the wrong action shape.");
      }
      const sourceId = requiredRecoveryExecutionId(recovery.bindings);
      const sourceRef = this.executionRef(sourceId);
      const claimRef = this.db
        .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.identityClaims)
        .doc(recovery.bindings.emailHash);
      const [sourceSnapshot, claimSnapshot, vendorSnapshot] = await Promise.all([
        transaction.get(sourceRef),
        transaction.get(claimRef),
        transaction.get(this.vendorRef(recovery.bindings.vendorRef)),
      ]);
      const source = requireExecution(sourceSnapshot);
      assertRecoverySource(recovery, source);
      if (recovery.state === "superseded") {
        if (source.state !== "succeeded" || !source.receipt) {
          throw conflict("The resolved Vendor invite recovery is inconsistent.");
        }
        return { recovery, delivered: source };
      }
      if (
        recovery.phase !== "recovery_readback" ||
        (recovery.state !== "running" && recovery.state !== "ambiguous")
      ) {
        throw conflict("The Vendor invite recovery cannot be resolved.");
      }
      const claim = requireIdentityClaim(claimSnapshot);
      assertRecoveryClaim(claim, recovery);
      const vendor = readVendor(vendorSnapshot);
      assertInviteVendorGenerationForRecoveryResolution(vendor, source);

      let delivered = source;
      let completedSource = false;
      if (source.state !== "succeeded") {
        if (
          source.actionKey !== "vendor.account.invite" ||
          source.bindings.kind !== "invite" ||
          (source.phase !== "delivery_claimed" &&
            source.phase !== "delivery_effect_started") ||
          (source.state !== "running" && source.state !== "ambiguous") ||
          source.receipt
        ) {
          throw conflict("The prior Vendor delivery cannot be reconciled.");
        }
        const deliveredSource =
          vendor.status === "disabled"
            ? {
                ...source,
                invalidatedDeliveryRefHash: input.deliveryRefHash,
                lastErrorCode: "disabled_during_invite_delivery",
              }
            : source;
        delivered = terminalRecord(
          deliveredSource,
          vendor.status === "disabled"
            ? inviteInvalidatedReceipt(deliveredSource, source.bindings, {
                deliveryRefHash: input.deliveryRefHash,
                reconciled: true,
                nowIso: input.nowIso,
              })
            : inviteReceipt(source, source.bindings, {
                deliveryRefHash: input.deliveryRefHash,
                reconciled: true,
                nowIso: input.nowIso,
              }),
          input.nowIso,
        );
        completedSource = true;
      } else if (!source.receipt) {
        throw conflict("The prior Vendor delivery receipt is unavailable.");
      }

      const superseded: LiveVendorLifecycleExecutionRecord = {
        ...recovery,
        state: "superseded",
        supersededByExecutionId: delivered.id,
        updatedAt: input.nowIso,
      };
      transaction.set(sourceRef, delivered);
      transaction.set(recoveryRef, superseded);
      transaction.set(claimRef, {
        ...claim,
        executionId: delivered.id,
        updatedAt: input.nowIso,
      } satisfies VendorIdentityClaim);
      if (completedSource) {
        transaction.create(
          this.auditRef(
            delivered.id,
            delivered.receipt?.state === "delivery_invalidated"
              ? "delivery_invalidated"
              : "succeeded",
          ),
          lifecycleAudit(
            delivered,
            delivered.receipt?.state === "delivery_invalidated"
              ? "delivery_invalidated"
              : "succeeded",
            input.nowIso,
          ),
        );
      }
      transaction.create(
        this.auditRef(superseded.id, "recovery_resolved_existing_delivery"),
        lifecycleAudit(superseded, "recovery_resolved_existing_delivery", input.nowIso),
      );
      return { recovery: superseded, delivered };
    });
  }

  async markInvitePrincipalReady(input: {
    executionId: string;
    payloadHash: string;
    nowIso: string;
  }): Promise<LiveVendorLifecycleExecutionRecord> {
    assertTransitionNow(input.nowIso);
    const ref = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const record = requireExecution(snapshot);
      assertPayload(record, input.payloadHash);
      if (
        record.state === "succeeded" ||
        record.phase === "identity_ready" ||
        record.phase === "delivery_claimed" ||
        record.phase === "delivery_effect_started"
      ) {
        return record;
      }
      if (
        record.actionKey !== "vendor.account.invite" ||
        record.bindings.kind !== "invite" ||
        record.phase !== "identity_effect_claimed" ||
        (record.state !== "running" && record.state !== "ambiguous")
      ) {
        throw conflict("Vendor invite identity cannot transition from this state.");
      }

      const [vendorSnapshot, claimSnapshot] = await Promise.all([
        transaction.get(this.vendorRef(record.bindings.vendorRef)),
        transaction.get(
          this.db
            .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.identityClaims)
            .doc(record.bindings.emailHash),
        ),
      ]);
      assertCurrentInviteExternalEffectGeneration(
        readVendor(vendorSnapshot),
        requireIdentityClaim(claimSnapshot),
        record,
      );

      const { lastErrorCode: _lastErrorCode, ...recoverable } = record;
      void _lastErrorCode;
      const next: LiveVendorLifecycleExecutionRecord = {
        ...recoverable,
        state: "running",
        phase: "identity_ready",
        updatedAt: input.nowIso,
      };
      transaction.set(ref, next);
      transaction.create(
        this.auditRef(record.id, "identity_ready"),
        lifecycleAudit(next, "identity_ready", input.nowIso),
      );
      return next;
    });
  }

  async claimInviteDelivery(input: {
    executionId: string;
    payloadHash: string;
    nowIso: string;
  }): Promise<{
    record: LiveVendorLifecycleExecutionRecord;
    claimed: boolean;
  }> {
    assertTransitionNow(input.nowIso);
    const ref = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const record = requireExecution(snapshot);
      assertPayload(record, input.payloadHash);
      if (
        record.state === "succeeded" ||
        record.state === "ambiguous" ||
        record.phase === "delivery_claimed" ||
        record.phase === "delivery_effect_started"
      ) {
        return { record, claimed: false };
      }
      if (
        record.actionKey !== "vendor.account.invite" ||
        record.bindings.kind !== "invite" ||
        record.phase !== "identity_ready" ||
        record.state !== "running"
      ) {
        throw conflict("Vendor invite delivery cannot transition from this state.");
      }

      const [vendorSnapshot, claimSnapshot] = await Promise.all([
        transaction.get(this.vendorRef(record.bindings.vendorRef)),
        transaction.get(
          this.db
            .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.identityClaims)
            .doc(record.bindings.emailHash),
        ),
      ]);
      assertCurrentInviteExternalEffectGeneration(
        readVendor(vendorSnapshot),
        requireIdentityClaim(claimSnapshot),
        record,
      );

      const next: LiveVendorLifecycleExecutionRecord = {
        ...record,
        phase: "delivery_claimed",
        deliveryClaimedAt: input.nowIso,
        updatedAt: input.nowIso,
      };
      transaction.set(ref, next);
      transaction.create(
        this.auditRef(record.id, "delivery_claimed"),
        lifecycleAudit(next, "delivery_claimed", input.nowIso),
      );
      return { record: next, claimed: true };
    });
  }

  /**
   * Irreversible Gmail-effect ownership. Once this transition commits, an absence readback never
   * authorizes an automatic corrective takeover; the exact RFC Message-ID remains the only safe
   * reconciliation path.
   */
  async claimInviteDeliveryEffect(input: {
    executionId: string;
    payloadHash: string;
    nowIso: string;
  }): Promise<{
    record: LiveVendorLifecycleExecutionRecord;
    claimed: boolean;
  }> {
    assertTransitionNow(input.nowIso);
    const ref = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const record = requireExecution(snapshot);
      assertPayload(record, input.payloadHash);
      if (record.phase === "delivery_effect_started") {
        return { record, claimed: false };
      }
      if (
        record.actionKey !== "vendor.account.invite" ||
        record.bindings.kind !== "invite" ||
        record.phase !== "delivery_claimed" ||
        record.state !== "running"
      ) {
        return { record, claimed: false };
      }
      const [vendorSnapshot, claimSnapshot] = await Promise.all([
        transaction.get(this.vendorRef(record.bindings.vendorRef)),
        transaction.get(
          this.db
            .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.identityClaims)
            .doc(record.bindings.emailHash),
        ),
      ]);
      assertCurrentInviteExternalEffectGeneration(
        readVendor(vendorSnapshot),
        requireIdentityClaim(claimSnapshot),
        record,
      );
      const next: LiveVendorLifecycleExecutionRecord = {
        ...record,
        phase: "delivery_effect_started",
        deliveryEffectStartedAt: input.nowIso,
        updatedAt: input.nowIso,
      };
      transaction.set(ref, next);
      transaction.create(
        this.auditRef(record.id, "delivery_effect_started"),
        lifecycleAudit(next, "delivery_effect_started", input.nowIso),
      );
      return { record: next, claimed: true };
    });
  }

  async completeInvite(input: {
    executionId: string;
    payloadHash: string;
    deliveryRefHash: string;
    reconciled: boolean;
    nowIso: string;
  }): Promise<LiveVendorLifecycleExecutionRecord> {
    assertTransitionNow(input.nowIso);
    exactHash(input.deliveryRefHash, "Vendor invite delivery reference");
    const ref = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const record = requireExecution(snapshot);
      assertPayload(record, input.payloadHash);
      if (record.state === "succeeded") return record;
      if (record.phase === "delivery_invalidated") {
        if (
          record.actionKey !== "vendor.account.invite" ||
          record.bindings.kind !== "invite" ||
          record.state !== "ambiguous" ||
          record.invalidatedDeliveryRefHash !== input.deliveryRefHash ||
          record.lastErrorCode !== "disabled_during_invite_delivery"
        ) {
          throw conflict("The invalidated Vendor delivery evidence changed.");
        }
        const next = terminalRecord(
          record,
          inviteInvalidatedReceipt(record, record.bindings, input),
          input.nowIso,
        );
        transaction.set(ref, next);
        transaction.create(
          this.auditRef(record.id, "succeeded"),
          lifecycleAudit(next, "succeeded", input.nowIso),
        );
        return next;
      }
      if (
        record.actionKey !== "vendor.account.invite" ||
        record.bindings.kind !== "invite" ||
        (record.phase !== "delivery_effect_started" &&
          !(input.reconciled && record.phase === "delivery_claimed")) ||
        (record.state !== "running" && record.state !== "ambiguous")
      ) {
        throw conflict("Vendor invite cannot be completed from this state.");
      }
      const [vendorSnapshot, claimSnapshot] = await Promise.all([
        transaction.get(this.vendorRef(record.bindings.vendorRef)),
        transaction.get(
          this.db
            .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.identityClaims)
            .doc(record.bindings.emailHash),
        ),
      ]);
      const vendor = readVendor(vendorSnapshot);
      const claim = requireIdentityClaim(claimSnapshot);
      if (vendor.status === "disabled") {
        if (
          vendor.id !== record.bindings.vendorRef ||
          vendor.uid !== record.bindings.vendorUid ||
          sha256(normalizeLiveVendorEmail(vendor.email)) !== record.bindings.emailHash ||
          claim.executionId !== record.id ||
          claim.vendorRef !== record.bindings.vendorRef ||
          claim.vendorUid !== record.bindings.vendorUid
        ) {
          throw conflict("The disabled Vendor delivery binding changed.");
        }
        assertInviteVendorGenerationForRecoveryResolution(vendor, record);
        const invalidated = terminalRecord(
          {
            ...record,
            invalidatedDeliveryRefHash: input.deliveryRefHash,
            lastErrorCode: "disabled_during_invite_delivery",
          },
          inviteInvalidatedReceipt(record, record.bindings, input),
          input.nowIso,
        );
        transaction.set(ref, invalidated);
        transaction.create(
          this.auditRef(record.id, "delivery_invalidated"),
          lifecycleAudit(invalidated, "delivery_invalidated", input.nowIso),
        );
        return invalidated;
      }
      assertCurrentInviteCompletionGeneration(vendor, claim, record);
      const receipt = inviteReceipt(record, record.bindings, input);
      const next = terminalRecord(record, receipt, input.nowIso);
      transaction.set(ref, next);
      transaction.create(
        this.auditRef(record.id, "succeeded"),
        lifecycleAudit(next, "succeeded", input.nowIso),
      );
      return next;
    });
  }

  async commitAssignment(
    input: CommitLiveVendorAssignmentInput,
  ): Promise<LiveVendorLifecycleExecutionRecord> {
    assertTransitionNow(input.nowIso);
    assertExecutionId(
      "vendor.assignment.change",
      input.command.idempotencyKey,
      input.executionId,
    );
    const executionRef = this.executionRef(input.executionId);
    const vendorRef = this.vendorRef(input.command.vendorRef);
    const ticketRef = this.ticketRef(input.command.ticketRef);
    const assignmentRef = this.assignmentRef(input.command.ticketRef);
    const preparedRef = this.preparedAttemptRef(
      liveVendorS20ExecutionId("vendor.assignment.change", input.command.idempotencyKey),
    );

    return this.db.runTransaction(async (transaction) => {
      const [executionSnapshot, preparedSnapshot] = await Promise.all([
        transaction.get(executionRef),
        transaction.get(preparedRef),
      ]);
      await assertPreparedProviderStart(transaction, this.db, preparedSnapshot, {
        actionKey: "vendor.assignment.change",
        command: input.command,
        executionId: input.executionId,
        payloadHash: input.payloadHash,
        providerRef: input.providerRef,
      });
      if (executionSnapshot.exists) {
        const existing = readExecution(executionSnapshot);
        assertPayload(existing, input.payloadHash);
        if (existing.state === "succeeded") return existing;
        throw conflict("Vendor assignment execution is already in progress.");
      }

      const [vendorSnapshot, ticketSnapshot, assignmentSnapshot] = await Promise.all([
        transaction.get(vendorRef),
        transaction.get(ticketRef),
        transaction.get(assignmentRef),
      ]);
      const vendor = assertLiveVendorGeneration(vendorSnapshot, input.command, [
        "pending_setup",
        "active",
      ]);
      assertVendorSetupEffectsIdle(vendor);
      const ticket = assertLiveTicketGeneration(
        ticketSnapshot,
        input.command.ticketRef,
        input.command.ticketUpdatedAt,
      );
      if (ticket.vendor_id === LIVE_VENDOR_NO_ASSIGNMENT_REF) {
        throw conflict(
          "The reserved no-assignment sentinel cannot be stored as a real Vendor reference.",
        );
      }
      const observedCurrentVendorRef = ticket.vendor_id ?? LIVE_VENDOR_NO_ASSIGNMENT_REF;
      if (observedCurrentVendorRef !== input.command.currentVendorRef) {
        throw conflict("The maintenance ticket Vendor assignment changed after preview.");
      }
      assertAssignmentJoin(
        assignmentSnapshot,
        input.command.ticketRef,
        observedCurrentVendorRef,
      );
      assertAssignmentOperation(input.command, observedCurrentVendorRef);
      if (
        input.command.operation === "assign" &&
        observedCurrentVendorRef !== LIVE_VENDOR_NO_ASSIGNMENT_REF &&
        observedCurrentVendorRef !== input.command.vendorRef
      ) {
        const currentVendorSnapshot = await transaction.get(
          this.vendorRef(observedCurrentVendorRef),
        );
        assertVendorSetupEffectsIdle(readVendor(currentVendorSnapshot));
      }

      const bindings: LiveVendorAssignmentBindings = {
        kind: "assignment",
        vendorRef: input.command.vendorRef,
        vendorUid: input.command.vendorUid,
        emailHash: sha256(normalizeLiveVendorEmail(input.command.email)),
        companyHash: hashLiveVendorContact(input.command.company),
        vendorUpdatedAt: input.command.vendorUpdatedAt,
        ticketRef: input.command.ticketRef,
        ticketUpdatedAt: input.command.ticketUpdatedAt,
        currentVendorRef: input.command.currentVendorRef,
        targetVendorRef: input.command.targetVendorRef,
        operation: input.command.operation,
      };
      const base = baseRecord({
        id: input.executionId,
        actionKey: "vendor.assignment.change",
        idempotencyKey: input.command.idempotencyKey,
        payloadHash: input.payloadHash,
        actorUid: input.command.actorUid,
        bindings,
        phase: "succeeded",
        state: "succeeded",
        nowIso: input.nowIso,
      });
      const receipt = assignmentReceipt(base, bindings, input.providerRef, input.nowIso);
      const record: LiveVendorLifecycleExecutionRecord = { ...base, receipt };
      const target =
        input.command.operation === "assign"
          ? input.command.targetVendorRef
          : LIVE_VENDOR_NO_ASSIGNMENT_REF;
      const updatedTicket: StoredTicketRecord = {
        ...ticket,
        updated_at: input.nowIso,
      };
      if (target === LIVE_VENDOR_NO_ASSIGNMENT_REF) {
        delete updatedTicket.vendor_id;
      } else {
        updatedTicket.vendor_id = target;
      }
      const assignment: StoredAssignmentRecord = {
        ticket_id: input.command.ticketRef,
        vendor_id:
          target === LIVE_VENDOR_NO_ASSIGNMENT_REF
            ? input.command.vendorRef
            : input.command.targetVendorRef,
        active: target !== LIVE_VENDOR_NO_ASSIGNMENT_REF,
        data_mode: "live",
        updated_at: input.nowIso,
      };

      transaction.create(executionRef, record);
      transaction.create(
        this.s20IndexRef(record.s20ExecutionId),
        s20Index(record, input.nowIso),
      );
      transaction.set(ticketRef, updatedTicket);
      transaction.set(assignmentRef, assignment);
      transaction.create(
        this.maintenanceActivityRef(record.id, input.command.ticketRef),
        {
          id: `vendor-lifecycle-${record.id}`,
          ticket_id: input.command.ticketRef,
          actor_uid: input.command.actorUid,
          action: "vendor-assign",
          text: input.command.operation === "assign" ? "assigned" : "unassigned",
          created_at: input.nowIso,
        },
      );
      transaction.create(
        this.vendorAuditRef(record.id, "assignment"),
        vendorAudit({
          actorUid: input.command.actorUid,
          vendorId: vendor.id,
          ticketId: input.command.ticketRef,
          action:
            input.command.operation === "assign"
              ? "live_vendor_assigned"
              : "live_vendor_unassigned",
          reasonHash: sha256(input.command.reason.trim()),
          createdAt: input.nowIso,
        }),
      );
      if (
        input.command.operation === "assign" &&
        observedCurrentVendorRef !== LIVE_VENDOR_NO_ASSIGNMENT_REF &&
        observedCurrentVendorRef !== input.command.vendorRef
      ) {
        transaction.create(
          this.vendorAuditRef(record.id, "previous_assignment"),
          vendorAudit({
            actorUid: input.command.actorUid,
            vendorId: observedCurrentVendorRef,
            ticketId: input.command.ticketRef,
            action: "live_vendor_unassigned_by_replacement",
            reasonHash: sha256(input.command.reason.trim()),
            createdAt: input.nowIso,
          }),
        );
      }
      transaction.create(
        this.auditRef(record.id, "assignment_committed"),
        lifecycleAudit(record, "assignment_committed", input.nowIso),
      );
      return record;
    });
  }

  async disableAccess(
    input: DisableLiveVendorAccessInput,
  ): Promise<LiveVendorLifecycleExecutionRecord> {
    assertTransitionNow(input.nowIso);
    assertDisableCommandMode(input.command, "initial");
    assertExecutionId(
      "vendor.account.disable",
      input.command.idempotencyKey,
      input.executionId,
    );
    const executionRef = this.executionRef(input.executionId);
    const vendorRef = this.vendorRef(input.command.vendorRef);
    const connectionRef = this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.mailboxConnections)
      .doc(input.command.vendorRef);
    const revocationRef = this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tokenRevocations)
      .doc(input.command.vendorRef);
    const completionClaimRef = this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.disableCompletionClaims)
      .doc(input.command.vendorRef);
    const identityClaimRef = this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.identityClaims)
      .doc(liveVendorIdentityClaimId(input.command.email));
    const assignmentsQuery = this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments)
      .where("vendor_id", "==", input.command.vendorRef)
      .where("active", "==", true)
      .limit(LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS + 1);
    const assignedTicketsQuery = this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets)
      .where("vendor_id", "==", input.command.vendorRef)
      .limit(LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS + 1);
    const preparedRef = this.preparedAttemptRef(
      liveVendorS20ExecutionId("vendor.account.disable", input.command.idempotencyKey),
    );

    return this.db.runTransaction(async (transaction) => {
      const [executionSnapshot, preparedSnapshot] = await Promise.all([
        transaction.get(executionRef),
        transaction.get(preparedRef),
      ]);
      await assertPreparedProviderStart(transaction, this.db, preparedSnapshot, {
        actionKey: "vendor.account.disable",
        command: input.command,
        executionId: input.executionId,
        payloadHash: input.payloadHash,
      });
      if (executionSnapshot.exists) {
        const existing = readExecution(executionSnapshot);
        assertPayload(existing, input.payloadHash);
        if (
          existing.state === "succeeded" ||
          existing.state === "ambiguous" ||
          existing.phase === "access_disabled"
        ) {
          return existing;
        }
        throw conflict("Vendor disable execution is already in progress.");
      }

      const [
        vendorSnapshot,
        connectionSnapshot,
        revocationSnapshot,
        completionClaimSnapshot,
        identityClaimSnapshot,
        assignmentSnapshot,
        assignedTicketSnapshot,
      ] = await Promise.all([
        transaction.get(vendorRef),
        transaction.get(connectionRef),
        transaction.get(revocationRef),
        transaction.get(completionClaimRef),
        transaction.get(identityClaimRef),
        transaction.get(assignmentsQuery),
        transaction.get(assignedTicketsQuery),
      ]);
      const vendor = assertLiveVendorGeneration(vendorSnapshot, input.command, [
        "pending_setup",
        "active",
      ]);
      if (completionClaimSnapshot.exists) {
        throw conflict("That Vendor already has a disable completion claim.");
      }
      if (vendor.status !== input.command.currentStatus) {
        throw conflict("The Vendor status changed after preview.");
      }
      if (identityClaimSnapshot.exists) {
        const identityClaim = requireIdentityClaim(identityClaimSnapshot);
        if (
          identityClaim.vendorRef !== vendor.id ||
          identityClaim.vendorUid !== vendor.uid ||
          identityClaim.emailHash !== sha256(normalizeLiveVendorEmail(vendor.email))
        ) {
          throw conflict("The Vendor identity claim changed before access cutoff.");
        }
        const inviteSnapshot = await transaction.get(
          this.executionRef(identityClaim.executionId),
        );
        assertDisableInviteInterlock(
          requireExecution(inviteSnapshot),
          identityClaim,
          input.command,
        );
      }
      const activeAssignments = assignmentSnapshot.docs.filter((snapshot) => {
        const assignment = snapshot.data() as Partial<StoredAssignmentRecord>;
        if (
          assignment.active !== true ||
          assignment.ticket_id !== snapshot.id ||
          assignment.vendor_id !== input.command.vendorRef
        ) {
          throw conflict("A Vendor assignment record is malformed.");
        }
        if (assignment.data_mode !== "live") {
          throw conflict("A non-Live assignment cannot enter a Live disable action.");
        }
        return true;
      });
      if (activeAssignments.length > LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS) {
        throw conflict(
          `Vendor disable is limited to ${LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS} active assignments per exact action.`,
        );
      }
      if (
        assignedTicketSnapshot.docs.length > LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS
      ) {
        throw conflict(
          `Vendor disable is limited to ${LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS} assigned tickets per exact action.`,
        );
      }
      const observedAssignmentRefs = canonicalLiveAssignmentRefs(
        activeAssignments.map((snapshot) => snapshot.id),
      );
      if (observedAssignmentRefs !== input.command.activeAssignmentRefs) {
        throw conflict("The Vendor assignment set changed after preview.");
      }
      const mailbox = exactLiveMailboxConnection(
        connectionSnapshot,
        input.command.vendorRef,
      );
      if (mailbox.state !== input.command.mailboxState) {
        throw conflict("The Vendor mailbox state changed after preview.");
      }
      if (mailbox.tokenRefHash !== input.command.mailboxTokenRefHash) {
        throw conflict("The Vendor mailbox token reference changed after preview.");
      }
      assertExactRevocationState(revocationSnapshot, input.command.vendorRef, mailbox);

      assignedTicketSnapshot.docs.forEach((snapshot) => {
        const ticket = assertLiveTicket(snapshot, snapshot.id);
        if (ticket.vendor_id !== input.command.vendorRef) {
          throw conflict("A Vendor assignment no longer matches its ticket.");
        }
      });
      const observedTicketRefs = canonicalLiveAssignmentRefs(
        assignedTicketSnapshot.docs.map((snapshot) => snapshot.id),
      );
      if (observedTicketRefs !== observedAssignmentRefs) {
        throw conflict("The Vendor assignment ledger and maintenance tickets disagree.");
      }

      const bindings: LiveVendorDisableBindings = {
        kind: "disable",
        disableMode: "initial",
        vendorRef: input.command.vendorRef,
        vendorUid: input.command.vendorUid,
        emailHash: sha256(normalizeLiveVendorEmail(input.command.email)),
        companyHash: hashLiveVendorContact(input.command.company),
        currentStatus: input.command.currentStatus,
        vendorUpdatedAt: input.command.vendorUpdatedAt,
        activeAssignmentRefs: input.command.activeAssignmentRefs,
        mailboxState: input.command.mailboxState,
        mailboxTokenRefHash: input.command.mailboxTokenRefHash,
        rootExecutionId: input.executionId,
        rootS20ExecutionId: liveVendorS20ExecutionId(
          "vendor.account.disable",
          input.command.idempotencyKey,
        ),
        accessDisabledAt: input.nowIso,
        completionGeneration: 0,
        completionOwnerExecutionId: input.executionId,
        completionOwnerS20ExecutionId: liveVendorS20ExecutionId(
          "vendor.account.disable",
          input.command.idempotencyKey,
        ),
        completionLeaseExpiresAt: disableCompletionLeaseExpiresAt(input.nowIso),
        issuedCompletionGeneration: 0,
        issuedCompletionLeaseExpiresAt: disableCompletionLeaseExpiresAt(input.nowIso),
      };
      const record = baseRecord({
        id: input.executionId,
        actionKey: "vendor.account.disable",
        idempotencyKey: input.command.idempotencyKey,
        payloadHash: input.payloadHash,
        actorUid: input.command.actorUid,
        bindings,
        phase: "access_disabled",
        state: "running",
        nowIso: input.nowIso,
        accessDisabledAt: input.nowIso,
      });
      const disabledVendor: StoredVendorRecord = {
        ...vendor,
        status: "disabled",
        disabledAt: input.nowIso,
        updatedAt: input.nowIso,
      };
      // Disable is the fail-safe off switch and therefore wins over an in-flight setup effect.
      // Removing the fence in the same access-cutoff write makes the setup owner's later consume
      // fail against a disabled Vendor, so its reset link is discarded without another credential
      // ever being minted. The bodyless effect_started challenge remains terminal/non-replayable.
      delete disabledVendor.setupEffectFence;

      transaction.create(executionRef, record);
      transaction.create(
        this.s20IndexRef(record.s20ExecutionId),
        s20Index(record, input.nowIso),
      );
      transaction.create(completionClaimRef, {
        schemaVersion: 1,
        vendorRef: bindings.vendorRef,
        vendorUid: bindings.vendorUid,
        rootExecutionId: record.id,
        rootS20ExecutionId: record.s20ExecutionId,
        accessDisabledAt: input.nowIso,
        completionGeneration: 0,
        ownerExecutionId: record.id,
        ownerS20ExecutionId: record.s20ExecutionId,
        ownerLeaseExpiresAt: bindings.issuedCompletionLeaseExpiresAt,
        dataMode: "live",
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
      } satisfies LiveVendorDisableCompletionClaim);
      transaction.set(vendorRef, disabledVendor);
      if (mailbox.state === "connected") {
        transaction.set(connectionRef, {
          ...mailbox.connection,
          status: "revocation_pending",
          updatedAt: input.nowIso,
        } satisfies StoredMailboxConnection);
        transaction.create(revocationRef, {
          vendorId: input.command.vendorRef,
          tokenSecretRef: mailbox.connection.tokenSecretRef,
          status: "pending",
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        } satisfies StoredTokenRevocation);
      }
      activeAssignments.forEach((snapshot) => {
        const assignment = snapshot.data() as StoredAssignmentRecord;
        transaction.set(snapshot.ref, {
          ...assignment,
          active: false,
          updated_at: input.nowIso,
        });
        const ticketSnapshot = assignedTicketSnapshot.docs.find(
          (candidate) => candidate.id === snapshot.id,
        );
        if (!ticketSnapshot) {
          throw conflict(
            "The Vendor assignment ledger and maintenance tickets disagree.",
          );
        }
        const ticket = {
          ...assertLiveTicket(ticketSnapshot, snapshot.id),
          updated_at: input.nowIso,
        };
        delete ticket.vendor_id;
        transaction.set(this.ticketRef(snapshot.id), ticket);
        transaction.create(this.maintenanceActivityRef(record.id, snapshot.id), {
          id: `vendor-lifecycle-${record.id}-${sha256(snapshot.id).slice(0, 12)}`,
          ticket_id: snapshot.id,
          actor_uid: input.command.actorUid,
          action: "vendor-assign",
          text: "unassigned",
          created_at: input.nowIso,
        });
      });
      transaction.create(
        this.vendorAuditRef(record.id, "access_disabled"),
        vendorAudit({
          actorUid: input.command.actorUid,
          vendorId: input.command.vendorRef,
          action: "live_vendor_access_disabled",
          reasonHash: sha256(input.command.reason.trim()),
          createdAt: input.nowIso,
        }),
      );
      transaction.create(
        this.auditRef(record.id, "access_disabled"),
        lifecycleAudit(record, "access_disabled", input.nowIso),
      );
      return record;
    });
  }

  async claimDisableCompletionRecovery(
    input: DisableLiveVendorAccessInput,
  ): Promise<LiveVendorLifecycleExecutionRecord> {
    assertTransitionNow(input.nowIso);
    assertDisableCommandMode(input.command, "firebase_completion_recovery");
    assertExecutionId(
      "vendor.account.disable",
      input.command.idempotencyKey,
      input.executionId,
    );
    if (
      input.executionId === input.command.rootExecutionId ||
      input.executionId === input.command.completionOwnerExecutionId
    ) {
      throw conflict("A Vendor disable recovery requires a fresh execution identity.");
    }

    const executionRef = this.executionRef(input.executionId);
    const rootRef = this.executionRef(input.command.rootExecutionId);
    const ownerRef = this.executionRef(input.command.completionOwnerExecutionId);
    const vendorRef = this.vendorRef(input.command.vendorRef);
    const claimRef = this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.disableCompletionClaims)
      .doc(input.command.vendorRef);
    const preparedRef = this.preparedAttemptRef(
      liveVendorS20ExecutionId("vendor.account.disable", input.command.idempotencyKey),
    );

    return this.db.runTransaction(async (transaction) => {
      const [
        executionSnapshot,
        rootSnapshot,
        ownerSnapshot,
        vendorSnapshot,
        claimSnapshot,
        preparedSnapshot,
      ] = await Promise.all([
        transaction.get(executionRef),
        transaction.get(rootRef),
        transaction.get(ownerRef),
        transaction.get(vendorRef),
        transaction.get(claimRef),
        transaction.get(preparedRef),
      ]);
      await assertPreparedProviderStart(transaction, this.db, preparedSnapshot, {
        actionKey: "vendor.account.disable",
        command: input.command,
        executionId: input.executionId,
        payloadHash: input.payloadHash,
      });
      if (executionSnapshot.exists) {
        const existing = readExecution(executionSnapshot);
        assertPayload(existing, input.payloadHash);
        assertDisableRecoveryRecord(existing, input.command);
        return existing;
      }

      const claim = readDisableCompletionClaim(claimSnapshot);
      const root = requireExecution(rootSnapshot);
      const owner = requireExecution(ownerSnapshot);
      assertDisableRecoverySource({
        claim,
        command: input.command,
        root,
        owner,
      });
      const vendor = assertLiveVendorGeneration(vendorSnapshot, input.command, [
        "disabled",
      ]);
      if (
        root.bindings.kind !== "disable" ||
        root.bindings.emailHash !==
          sha256(normalizeLiveVendorEmail(input.command.email)) ||
        root.bindings.companyHash !== hashLiveVendorContact(input.command.company) ||
        root.bindings.activeAssignmentRefs !== input.command.activeAssignmentRefs ||
        root.bindings.mailboxState !== input.command.mailboxState ||
        root.bindings.mailboxTokenRefHash !== input.command.mailboxTokenRefHash ||
        vendor.status !== "disabled"
      ) {
        throw conflict("The Vendor disable recovery no longer matches its root action.");
      }
      const nowMs = requiredIso(input.nowIso, "Vendor disable recovery clock");
      const leaseMs = requiredIso(
        claim.ownerLeaseExpiresAt,
        "Vendor disable completion lease",
      );
      if (owner.state !== "ambiguous" && nowMs < leaseMs) {
        throw conflict(
          "The prior Vendor disable completion owner still holds its recovery lease.",
        );
      }
      const issuedGeneration = claim.completionGeneration + 1;
      if (!Number.isSafeInteger(issuedGeneration)) {
        throw conflict("The Vendor disable completion generation cannot advance safely.");
      }
      const issuedLease = disableCompletionLeaseExpiresAt(input.nowIso);
      const bindings: LiveVendorDisableBindings = {
        kind: "disable",
        disableMode: "firebase_completion_recovery",
        vendorRef: input.command.vendorRef,
        vendorUid: input.command.vendorUid,
        emailHash: root.bindings.emailHash,
        companyHash: root.bindings.companyHash,
        currentStatus: "disabled",
        vendorUpdatedAt: input.command.vendorUpdatedAt,
        activeAssignmentRefs: root.bindings.activeAssignmentRefs,
        mailboxState: root.bindings.mailboxState,
        mailboxTokenRefHash: root.bindings.mailboxTokenRefHash,
        rootExecutionId: root.id,
        rootS20ExecutionId: root.s20ExecutionId,
        accessDisabledAt: claim.accessDisabledAt,
        completionGeneration: claim.completionGeneration,
        completionOwnerExecutionId: claim.ownerExecutionId,
        completionOwnerS20ExecutionId: claim.ownerS20ExecutionId,
        completionLeaseExpiresAt: claim.ownerLeaseExpiresAt,
        issuedCompletionGeneration: issuedGeneration,
        issuedCompletionLeaseExpiresAt: issuedLease,
      };
      const recovery = baseRecord({
        id: input.executionId,
        actionKey: "vendor.account.disable",
        idempotencyKey: input.command.idempotencyKey,
        payloadHash: input.payloadHash,
        actorUid: input.command.actorUid,
        bindings,
        phase: "access_disabled",
        state: "running",
        nowIso: input.nowIso,
        accessDisabledAt: claim.accessDisabledAt,
      });
      transaction.create(executionRef, recovery);
      transaction.create(
        this.s20IndexRef(recovery.s20ExecutionId),
        s20Index(recovery, input.nowIso),
      );
      transaction.set(claimRef, {
        ...claim,
        completionGeneration: issuedGeneration,
        ownerExecutionId: recovery.id,
        ownerS20ExecutionId: recovery.s20ExecutionId,
        ownerLeaseExpiresAt: issuedLease,
        updatedAt: input.nowIso,
      } satisfies LiveVendorDisableCompletionClaim);
      transaction.create(
        this.auditRef(recovery.id, "firebase_completion_recovery_claimed"),
        lifecycleAudit(recovery, "firebase_completion_recovery_claimed", input.nowIso),
      );
      transaction.create(
        this.vendorAuditRef(recovery.id, "firebase_completion_recovery_claimed"),
        vendorAudit({
          actorUid: input.command.actorUid,
          vendorId: input.command.vendorRef,
          action: "live_vendor_firebase_completion_recovery_claimed",
          reasonHash: sha256(input.command.reason.trim()),
          createdAt: input.nowIso,
        }),
      );
      return recovery;
    });
  }

  /**
   * Selects exactly one worker for the Firebase completion sequence. The random token never enters
   * Firestore; only its hash is retained. Same-S20 duplicates are therefore readback-only, while a
   * fresh recovery S20 can take ownership through the existing bounded completion lease.
   */
  async claimDisableCompletionWorker(input: {
    executionId: string;
    payloadHash: string;
    workerToken: string;
    nowIso: string;
  }): Promise<{
    claimed: boolean;
    record: LiveVendorLifecycleExecutionRecord;
  }> {
    assertTransitionNow(input.nowIso);
    const ref = this.executionRef(input.executionId);
    const workerTokenHash = disableCompletionWorkerTokenHash(input.workerToken);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const record = requireExecution(snapshot);
      assertPayload(record, input.payloadHash);
      if (record.completionWorkerTokenHash) {
        return { claimed: false, record };
      }
      if (
        record.actionKey !== "vendor.account.disable" ||
        record.bindings.kind !== "disable" ||
        record.phase !== "access_disabled" ||
        record.state !== "running" ||
        record.receipt
      ) {
        return { claimed: false, record };
      }
      const claimRef = this.db
        .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.disableCompletionClaims)
        .doc(record.bindings.vendorRef);
      const claimSnapshot = await transaction.get(claimRef);
      const claim = readDisableCompletionClaim(claimSnapshot);
      assertCurrentDisableCompletionOwner(claim, record);
      const next: LiveVendorLifecycleExecutionRecord = {
        ...record,
        completionWorkerTokenHash: workerTokenHash,
        completionWorkerClaimedAt: input.nowIso,
        updatedAt: input.nowIso,
      };
      transaction.set(ref, next);
      transaction.create(
        this.auditRef(record.id, "firebase_completion_worker_claimed"),
        lifecycleAudit(next, "firebase_completion_worker_claimed", input.nowIso),
      );
      return { claimed: true, record: next };
    });
  }

  async renewDisableCompletionLease(input: {
    executionId: string;
    payloadHash: string;
    workerToken: string;
    nowIso: string;
  }): Promise<LiveVendorLifecycleExecutionRecord> {
    assertTransitionNow(input.nowIso);
    const executionRef = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const executionSnapshot = await transaction.get(executionRef);
      const record = requireExecution(executionSnapshot);
      assertPayload(record, input.payloadHash);
      assertDisableCompletionWorker(record, input.workerToken);
      if (
        record.actionKey !== "vendor.account.disable" ||
        record.bindings.kind !== "disable" ||
        record.phase !== "access_disabled" ||
        (record.state !== "running" && record.state !== "ambiguous") ||
        record.receipt
      ) {
        throw conflict("The Vendor disable completion lease cannot be renewed.");
      }
      const claimRef = this.db
        .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.disableCompletionClaims)
        .doc(record.bindings.vendorRef);
      const claimSnapshot = await transaction.get(claimRef);
      const claim = readDisableCompletionClaim(claimSnapshot);
      assertCurrentDisableCompletionOwner(claim, record);
      const renewedLease = disableCompletionLeaseExpiresAt(input.nowIso);
      transaction.set(claimRef, {
        ...claim,
        ownerLeaseExpiresAt: renewedLease,
        updatedAt: input.nowIso,
      } satisfies LiveVendorDisableCompletionClaim);
      return record;
    });
  }

  async completeDisable(input: {
    executionId: string;
    payloadHash: string;
    workerToken: string;
    reconciled: boolean;
    nowIso: string;
  }): Promise<LiveVendorLifecycleExecutionRecord> {
    return this.completeDisableInternal(input, input.workerToken);
  }

  async completeDisableFromReadback(input: {
    executionId: string;
    payloadHash: string;
    nowIso: string;
  }): Promise<LiveVendorLifecycleExecutionRecord> {
    return this.completeDisableInternal({ ...input, reconciled: true }, undefined);
  }

  private async completeDisableInternal(
    input: {
      executionId: string;
      payloadHash: string;
      reconciled: boolean;
      nowIso: string;
    },
    workerToken: string | undefined,
  ): Promise<LiveVendorLifecycleExecutionRecord> {
    assertTransitionNow(input.nowIso);
    const ref = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const record = requireExecution(snapshot);
      assertPayload(record, input.payloadHash);
      if (workerToken) {
        assertDisableCompletionWorker(record, workerToken);
      }
      if (record.state === "succeeded") return record;
      if (
        record.actionKey !== "vendor.account.disable" ||
        record.bindings.kind !== "disable" ||
        record.phase !== "access_disabled" ||
        (record.state !== "running" && record.state !== "ambiguous")
      ) {
        throw conflict("Vendor disable cannot be completed from this state.");
      }
      const claimRef = this.db
        .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.disableCompletionClaims)
        .doc(record.bindings.vendorRef);
      const claimSnapshot = await transaction.get(claimRef);
      const claim = readDisableCompletionClaim(claimSnapshot);
      assertDisableCompletionOwnerMatches(claim, record);
      if (
        record.bindings.rootExecutionId !== claim.rootExecutionId ||
        record.bindings.rootS20ExecutionId !== claim.rootS20ExecutionId ||
        record.bindings.accessDisabledAt !== claim.accessDisabledAt
      ) {
        throw conflict("The Vendor disable completion lineage changed.");
      }
      const rootRef = this.executionRef(claim.rootExecutionId);
      const rootSnapshot =
        rootRef.path === ref.path ? snapshot : await transaction.get(rootRef);
      const root = requireExecution(rootSnapshot);
      if (
        root.actionKey !== "vendor.account.disable" ||
        root.bindings.kind !== "disable" ||
        root.bindings.disableMode !== "initial" ||
        root.bindings.vendorRef !== record.bindings.vendorRef ||
        root.bindings.vendorUid !== record.bindings.vendorUid
      ) {
        throw conflict("The Vendor disable root execution is malformed.");
      }

      if (claim.completedAt) {
        if (root.state !== "succeeded" || !root.receipt) {
          throw conflict("The completed Vendor disable claim has no root receipt.");
        }
        const receipt = disableReceipt(record, record.bindings, true, input.nowIso);
        const next = terminalRecord(record, receipt, input.nowIso);
        transaction.set(ref, next);
        transaction.create(
          this.auditRef(record.id, "succeeded"),
          lifecycleAudit(next, "succeeded", input.nowIso),
        );
        return next;
      }

      const rootNext =
        root.id === record.id
          ? null
          : terminalRecord(
              root,
              disableReceipt(root, root.bindings, true, input.nowIso),
              input.nowIso,
            );
      const next = terminalRecord(
        record,
        disableReceipt(
          record,
          record.bindings,
          input.reconciled || record.id !== root.id,
          input.nowIso,
        ),
        input.nowIso,
      );
      if (rootNext) {
        transaction.set(rootRef, rootNext);
        transaction.create(
          this.auditRef(rootNext.id, "succeeded"),
          lifecycleAudit(rootNext, "succeeded", input.nowIso),
        );
      }
      transaction.set(ref, next);
      transaction.set(claimRef, {
        ...claim,
        completedAt: input.nowIso,
        updatedAt: input.nowIso,
      } satisfies LiveVendorDisableCompletionClaim);
      transaction.create(
        this.auditRef(record.id, "succeeded"),
        lifecycleAudit(next, "succeeded", input.nowIso),
      );
      return next;
    });
  }

  async markAmbiguous(input: {
    executionId: string;
    payloadHash: string;
    errorCode: string;
    nowIso: string;
  }): Promise<LiveVendorLifecycleExecutionRecord> {
    assertTransitionNow(input.nowIso);
    const ref = this.executionRef(input.executionId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const record = requireExecution(snapshot);
      assertPayload(record, input.payloadHash);
      if (
        record.state === "succeeded" ||
        record.state === "ambiguous" ||
        record.state === "superseded"
      )
        return record;
      const next: LiveVendorLifecycleExecutionRecord = {
        ...record,
        state: "ambiguous",
        lastErrorCode: boundedErrorCode(input.errorCode),
        updatedAt: input.nowIso,
      };
      transaction.set(ref, next);
      transaction.create(
        this.auditRef(record.id, "ambiguous"),
        lifecycleAudit(next, "ambiguous", input.nowIso),
      );
      return next;
    });
  }

  private executionRef(id: string) {
    return this.db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions).doc(id);
  }

  private auditRef(executionId: string, event: string) {
    return this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.audit)
      .doc(liveVendorLifecycleAuditId(executionId, event));
  }

  private s20IndexRef(s20ExecutionId: string) {
    return this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.s20Index)
      .doc(s20ExecutionId);
  }

  private preparedAttemptRef(s20ExecutionId: string) {
    return this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.preparedAttempts)
      .doc(s20ExecutionId);
  }

  private vendorRef(vendorRef: string) {
    if (vendorRef === LIVE_VENDOR_NO_ASSIGNMENT_REF) {
      throw conflict(
        "The reserved no-assignment sentinel cannot identify a real Vendor.",
      );
    }
    return this.db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors).doc(vendorRef);
  }

  private ticketRef(ticketRef: string) {
    return this.db.collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets).doc(ticketRef);
  }

  private assignmentRef(ticketRef: string) {
    return this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments)
      .doc(ticketRef);
  }

  private vendorAuditRef(executionId: string, event: string) {
    return this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendorAudit)
      .doc(liveVendorLifecycleAuditId(executionId, `vendor:${event}`));
  }

  private maintenanceActivityRef(executionId: string, ticketRef: string) {
    return this.db
      .collection(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.maintenanceActivity)
      .doc(liveVendorLifecycleAuditId(executionId, `ticket:${ticketRef}`));
  }
}

export function createLiveVendorPreparedAttemptSnapshot(
  actor: AuthenticatedUser,
  input: PersistLiveVendorPreparedAttemptInput,
  immutableActorUid = actor.uid,
): LiveVendorPreparedAttemptSnapshot {
  assertS20ExecutionIdentity(input.executionId);
  const action = input.selection.action;
  if (
    !LIVE_ACTION_KEYS.has(action.actionKey as LiveVendorLifecycleActionKey) ||
    action.dataMode !== "live" ||
    typeof action.connectionRef !== "string" ||
    !action.connectionRef.trim() ||
    typeof action.contractRef !== "string" ||
    !action.contractRef.trim() ||
    typeof action.mappingRef !== "string" ||
    !action.mappingRef.trim()
  ) {
    throw conflict("The prepared Vendor attempt action is malformed.");
  }
  const actionKey = action.actionKey as LiveVendorLifecycleActionKey;
  const reason = action.values.reason;
  if (typeof reason !== "string" || !reason.trim()) {
    throw conflict("The prepared Vendor attempt reason is unavailable.");
  }
  if (
    hashExecutionPreview({ ...action.values }) !== input.previewHash ||
    externalActionContextHash(action) !== input.contextHash ||
    liveVendorS20ExecutionId(actionKey, externalActionIdempotencyKey(action)) !==
      input.executionId
  ) {
    throw conflict(
      "The prepared Vendor attempt does not match its S20 preview, context, or identity.",
    );
  }
  const createdAt = exactIso(input.createdAt, "Prepared Vendor attempt timestamp");
  const values = Object.fromEntries(
    Object.entries(action.values).filter(([name]) => name !== "reason"),
  ) as Readonly<Record<string, string | number | boolean>>;
  if (Object.prototype.hasOwnProperty.call(values, "reason")) {
    throw conflict("A plaintext lifecycle reason cannot enter the prepared snapshot.");
  }
  const storedAction: StoredPreparedAction = {
    actionId: action.actionId,
    actionKey,
    connectionRef: action.connectionRef,
    contractRef: action.contractRef,
    dataMode: "live",
    mappingRef: action.mappingRef,
    sourceRefs: [...action.sourceRefs],
    values,
    workflowId: action.workflowId,
  };
  const immutable = {
    schemaVersion: 1 as const,
    s20ExecutionId: input.executionId,
    actionKey,
    actorUid: immutableActorUid,
    previewHash: input.previewHash,
    contextHash: input.contextHash,
    action: storedAction,
    ...(input.selection.dependencyExecutionIds
      ? {
          dependencyExecutionIds: {
            ...input.selection.dependencyExecutionIds,
          },
        }
      : {}),
    trustedContext: JSON.parse(
      canonicalJson(input.selection.trustedContext),
    ) as TrustedExternalExecutionContext,
    variant: input.selection.variant ?? "standard",
    reasonHash: sha256(reason),
    createdAt,
  };
  return {
    ...immutable,
    snapshotHash: sha256(canonicalJson(immutable)),
    state: "prepared",
  };
}

function readPreparedAttempt(
  snapshot: DocumentSnapshot<DocumentData>,
): LiveVendorPreparedAttemptSnapshot {
  const raw = snapshot.data() as Record<string, unknown> | undefined;
  const action = raw?.action as Record<string, unknown> | undefined;
  const values = action?.values as Record<string, unknown> | undefined;
  const sourceRefs = action?.sourceRefs;
  const trustedContext = raw?.trustedContext;
  const dependencies = raw?.dependencyExecutionIds;
  const variant = raw?.variant;
  if (
    !raw ||
    raw.schemaVersion !== 1 ||
    raw.s20ExecutionId !== snapshot.id ||
    !LIVE_ACTION_KEYS.has(raw.actionKey as LiveVendorLifecycleActionKey) ||
    typeof raw.actorUid !== "string" ||
    !raw.actorUid.trim() ||
    typeof raw.previewHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.previewHash) ||
    typeof raw.contextHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.contextHash) ||
    typeof raw.reasonHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.reasonHash) ||
    typeof raw.snapshotHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.snapshotHash) ||
    (raw.state !== "prepared" && raw.state !== "fenced") ||
    !PREPARED_VARIANTS.has(variant as LiveVendorPreparedAttemptVariant) ||
    !action ||
    action.actionKey !== raw.actionKey ||
    action.dataMode !== "live" ||
    typeof action.actionId !== "string" ||
    !action.actionId.trim() ||
    typeof action.workflowId !== "string" ||
    !action.workflowId.trim() ||
    typeof action.connectionRef !== "string" ||
    !action.connectionRef.trim() ||
    typeof action.contractRef !== "string" ||
    !action.contractRef.trim() ||
    typeof action.mappingRef !== "string" ||
    !action.mappingRef.trim() ||
    !Array.isArray(sourceRefs) ||
    sourceRefs.some((ref) => typeof ref !== "string" || !ref.trim()) ||
    !values ||
    Array.isArray(values) ||
    Object.prototype.hasOwnProperty.call(values, "reason") ||
    Object.values(values).some(
      (value) =>
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean",
    ) ||
    !trustedContext ||
    typeof trustedContext !== "object" ||
    Array.isArray(trustedContext) ||
    (dependencies !== undefined &&
      (!dependencies ||
        typeof dependencies !== "object" ||
        Array.isArray(dependencies) ||
        Object.values(dependencies as Record<string, unknown>).some(
          (value) => typeof value !== "string" || !value.trim(),
        )))
  ) {
    throw conflict("The prepared Vendor attempt snapshot is malformed.");
  }
  const createdAt = firestoreIso(raw.createdAt, "Prepared Vendor attempt timestamp");
  const fencedAt =
    raw.fencedAt === undefined
      ? undefined
      : firestoreIso(raw.fencedAt, "Prepared Vendor attempt fence timestamp");
  const prepared: LiveVendorPreparedAttemptSnapshot = {
    schemaVersion: 1,
    s20ExecutionId: snapshot.id,
    actionKey: raw.actionKey as LiveVendorLifecycleActionKey,
    actorUid: raw.actorUid,
    previewHash: raw.previewHash,
    contextHash: raw.contextHash,
    action: {
      actionId: action.actionId as string,
      actionKey: raw.actionKey as LiveVendorLifecycleActionKey,
      connectionRef: action.connectionRef as string,
      contractRef: action.contractRef as string,
      dataMode: "live",
      mappingRef: action.mappingRef as string,
      sourceRefs: [...(sourceRefs as string[])],
      values: { ...values } as Record<string, string | number | boolean>,
      workflowId: action.workflowId as string,
    },
    ...(dependencies
      ? {
          dependencyExecutionIds: {
            ...(dependencies as Record<string, string>),
          },
        }
      : {}),
    trustedContext: trustedContext as TrustedExternalExecutionContext,
    variant: variant as LiveVendorPreparedAttemptVariant,
    reasonHash: raw.reasonHash,
    snapshotHash: raw.snapshotHash,
    state: raw.state,
    createdAt,
    ...(fencedAt ? { fencedAt } : {}),
  };
  assertS20ExecutionIdentity(prepared.s20ExecutionId);
  if (
    prepared.actionKey !== prepared.action.actionKey ||
    externalActionContextHash(prepared.action) !== prepared.contextHash ||
    liveVendorS20ExecutionId(
      prepared.actionKey,
      externalActionIdempotencyKey(prepared.action),
    ) !== prepared.s20ExecutionId ||
    prepared.snapshotHash !== sha256(canonicalJson(preparedAttemptImmutable(prepared)))
  ) {
    throw conflict("The prepared Vendor attempt snapshot identity is invalid.");
  }
  return prepared;
}

function preparedAttemptImmutable(snapshot: LiveVendorPreparedAttemptSnapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    s20ExecutionId: snapshot.s20ExecutionId,
    actionKey: snapshot.actionKey,
    actorUid: snapshot.actorUid,
    previewHash: snapshot.previewHash,
    contextHash: snapshot.contextHash,
    action: snapshot.action,
    ...(snapshot.dependencyExecutionIds
      ? { dependencyExecutionIds: snapshot.dependencyExecutionIds }
      : {}),
    trustedContext: snapshot.trustedContext,
    variant: snapshot.variant,
    reasonHash: snapshot.reasonHash,
    createdAt: snapshot.createdAt,
  };
}

function assertPreparedAttemptMatches(
  actual: LiveVendorPreparedAttemptSnapshot,
  expected: LiveVendorPreparedAttemptSnapshot,
  requireUnstarted: boolean,
) {
  if (
    actual.s20ExecutionId !== expected.s20ExecutionId ||
    actual.actionKey !== expected.actionKey ||
    actual.actorUid !== expected.actorUid ||
    actual.previewHash !== expected.previewHash ||
    actual.contextHash !== expected.contextHash ||
    actual.snapshotHash !== expected.snapshotHash
  ) {
    throw conflict(
      "The immutable Vendor provider-attempt snapshot does not match this S20 action.",
    );
  }
  if (requireUnstarted && actual.state !== "prepared") {
    throw conflict("The Vendor provider attempt was already fenced.");
  }
}

function assertPreparedAttemptBindingMatches(
  actual: LiveVendorPreparedAttemptSnapshot,
  expected: LiveVendorPreparedAttemptSnapshot,
) {
  if (
    actual.s20ExecutionId !== expected.s20ExecutionId ||
    actual.actionKey !== expected.actionKey ||
    actual.actorUid !== expected.actorUid ||
    actual.previewHash !== expected.previewHash ||
    actual.contextHash !== expected.contextHash ||
    actual.reasonHash !== expected.reasonHash ||
    canonicalJson(actual.action) !== canonicalJson(expected.action)
  ) {
    throw conflict(
      "The Vendor reconciliation selection does not match its prepared S20 binding.",
    );
  }
}

type PreparedProviderStartInput =
  | {
      actionKey: "vendor.account.invite";
      command: LiveVendorInviteInput;
      executionId: string;
      payloadHash: string;
      providerVendorRef: string;
      providerVendorUid: string;
      rfcMessageId: string;
      lineage?: {
        executionId: string;
        s20ExecutionId: string;
      };
    }
  | {
      actionKey: "vendor.assignment.change";
      command: LiveVendorAssignmentInput;
      executionId: string;
      payloadHash: string;
      providerRef: string;
    }
  | {
      actionKey: "vendor.account.disable";
      command: LiveVendorDisableInput;
      executionId: string;
      payloadHash: string;
    };

async function assertPreparedProviderStart(
  transaction: Transaction,
  db: Firestore,
  snapshot: DocumentSnapshot<DocumentData>,
  input: PreparedProviderStartInput,
) {
  if (!snapshot.exists) {
    throw conflict(
      "The immutable Vendor provider-attempt snapshot is unavailable; no provider ledger may start.",
    );
  }
  const prepared = readPreparedAttempt(snapshot);
  const command = input.command;
  const expectedS20ExecutionId = liveVendorS20ExecutionId(
    input.actionKey,
    command.idempotencyKey,
  );
  const expectedValues = preparedProviderCommandValues(input);
  const expectedVariant = preparedProviderVariant(input);
  const mismatch =
    prepared.state !== "prepared"
      ? "state"
      : prepared.s20ExecutionId !== expectedS20ExecutionId
        ? "S20 identity"
        : prepared.actionKey !== input.actionKey
          ? "action key"
          : prepared.reasonHash !== sha256(command.reason)
            ? "reason"
            : externalActionIdempotencyKey(prepared.action) !== command.idempotencyKey
              ? "idempotency identity"
              : prepared.variant !== expectedVariant
                ? "variant"
                : canonicalJson(prepared.action.values) !== canonicalJson(expectedValues)
                  ? "command projection"
                  : hashExecutionPreview({
                        ...prepared.action.values,
                        reason: command.reason,
                      }) !== prepared.previewHash
                    ? "preview"
                    : input.executionId !==
                        liveVendorLifecycleExecutionId(
                          input.actionKey,
                          command.idempotencyKey,
                        )
                      ? "provider execution identity"
                      : input.payloadHash !== preparedProviderPayloadHash(input)
                        ? "payload"
                        : null;
  if (mismatch) {
    throw conflict(
      `The provider start does not match its immutable prepared Vendor attempt (${mismatch}).`,
    );
  }
  assertPreparedProviderEnvelope(prepared, input);
  await assertClaimedActionExecutionInTransaction(
    transaction,
    db,
    expectedS20ExecutionId,
    preparedAttemptBinding(prepared),
    command.actorUid,
  );
}

function preparedProviderCommandValues(
  input: PreparedProviderStartInput,
): Readonly<Record<string, string | number | boolean>> {
  const full =
    input.actionKey === "vendor.account.invite"
      ? liveVendorInviteActionValues(input.command)
      : input.actionKey === "vendor.assignment.change"
        ? liveVendorAssignmentActionValues(input.command)
        : liveVendorDisableActionValues(input.command);
  const { reason: _reason, ...values } = full;
  void _reason;
  return values;
}

function preparedProviderPayloadHash(input: PreparedProviderStartInput) {
  switch (input.actionKey) {
    case "vendor.account.invite":
      return hashLiveVendorInvitePayload(input.command);
    case "vendor.assignment.change":
      return hashLiveVendorAssignmentPayload(input.command);
    case "vendor.account.disable":
      return hashLiveVendorDisablePayload(input.command);
  }
}

function preparedProviderVariant(
  input: PreparedProviderStartInput,
): LiveVendorPreparedAttemptVariant {
  if (input.actionKey === "vendor.account.invite") {
    return input.command.inviteMode === "setup_link_reissue"
      ? "setup_link_reissue"
      : input.command.inviteMode === "delivery_recovery"
        ? "invite_correction"
        : "standard";
  }
  if (
    input.actionKey === "vendor.account.disable" &&
    input.command.disableMode === "firebase_completion_recovery"
  ) {
    return "disable_completion_recovery";
  }
  return "standard";
}

function assertPreparedProviderEnvelope(
  prepared: LiveVendorPreparedAttemptSnapshot,
  input: PreparedProviderStartInput,
) {
  if (input.actionKey === "vendor.assignment.change") {
    if (
      input.providerRef !== liveVendorAssignmentProviderRef(input.command.idempotencyKey)
    ) {
      throw conflict("The Vendor assignment provider evidence identity is invalid.");
    }
    return;
  }
  if (input.actionKey === "vendor.account.disable") return;

  const derived = liveVendorInviteDerivedRefs(input.command.idempotencyKey);
  const expectedProviderVendorRef =
    input.command.inviteMode === "initial" ? derived.vendorRef : input.command.vendorRef;
  const expectedProviderVendorUid =
    input.command.inviteMode === "initial" ? derived.vendorUid : input.command.vendorUid;
  if (
    input.rfcMessageId !== derived.rfcMessageId ||
    input.providerVendorRef !== expectedProviderVendorRef ||
    input.providerVendorUid !== expectedProviderVendorUid
  ) {
    throw conflict("The Vendor invitation provider identity is not deterministic.");
  }

  if (input.command.inviteMode === "initial") {
    if (input.lineage || hasInviteLineageReference(prepared.action.sourceRefs)) {
      throw conflict("An initial Vendor invitation cannot bind predecessor lineage.");
    }
    return;
  }
  const lineage = input.lineage;
  if (!lineage) {
    throw conflict("The Vendor invitation predecessor lineage is unavailable.");
  }
  const expectedRefs = [
    `superseded-vendor-execution:${lineage.executionId}`,
    `superseded-s20-execution:${lineage.s20ExecutionId}`,
    `vendor-invite-supersession:${sha256(
      `${lineage.executionId}\0${lineage.s20ExecutionId}`,
    )}`,
  ];
  if (
    expectedRefs.some((ref) => !prepared.action.sourceRefs.includes(ref)) ||
    prepared.action.sourceRefs.filter(isInviteLineageReference).length !== 3
  ) {
    throw conflict(
      "The Vendor invitation provider start does not match its prepared predecessor lineage.",
    );
  }
}

function hasInviteLineageReference(sourceRefs: readonly string[]) {
  return sourceRefs.some(isInviteLineageReference);
}

function isInviteLineageReference(ref: string) {
  return (
    ref.startsWith("superseded-vendor-execution:") ||
    ref.startsWith("superseded-s20-execution:") ||
    ref.startsWith("vendor-invite-supersession:")
  );
}

function assertS20IndexMarker(
  snapshot: DocumentSnapshot<DocumentData>,
  prepared: LiveVendorPreparedAttemptSnapshot,
) {
  const marker = snapshot.data() as Partial<VendorLifecycleS20Index> | undefined;
  if (
    !marker ||
    marker.schemaVersion !== 1 ||
    marker.s20ExecutionId !== prepared.s20ExecutionId ||
    marker.actionKey !== prepared.actionKey ||
    marker.dataMode !== "live" ||
    typeof marker.executionId !== "string" ||
    !/^[a-f0-9]{64}$/.test(marker.executionId)
  ) {
    throw conflict("The Vendor provider-start marker is malformed.");
  }
}

function fencedAttemptReceipt(
  prepared: LiveVendorPreparedAttemptSnapshot,
): Readonly<ExternalActionReceipt> {
  return Object.freeze({
    actionKey: prepared.actionKey,
    dataMode: "live" as const,
    liveEvidenceEligible: true,
    providerRef: `vendor-lifecycle-pre-provider-fence:${prepared.s20ExecutionId}`,
    resultHash: sha256(
      `${prepared.snapshotHash}\0${prepared.s20ExecutionId}\0not_applicable`,
    ),
    reconciled: true,
    outcome: "not_applicable" as const,
    attemptFenced: true as const,
    createdAt: prepared.createdAt,
  });
}

function preparedAttemptBinding(prepared: LiveVendorPreparedAttemptSnapshot) {
  return {
    actionKey: prepared.actionKey,
    actorUid: prepared.actorUid,
    contextHash: prepared.contextHash,
    previewHash: prepared.previewHash,
  };
}

function assertS20ExecutionIdentity(value: string) {
  if (!/^exec_[a-f0-9]{40}$/.test(value)) {
    throw conflict("The S20 Vendor lifecycle identity is invalid.");
  }
}

function exactIso(value: string, label: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw conflict(`${label} is invalid.`);
  const normalized = new Date(timestamp).toISOString();
  if (normalized !== value) throw conflict(`${label} is invalid.`);
  return normalized;
}

function assertTransitionNow(nowIso: string) {
  exactIso(nowIso, "Vendor lifecycle transition timestamp");
}

function exactHash(value: string, label: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw conflict(`${label} hash is invalid.`);
  }
  return value;
}

function firestoreIso(value: unknown, label: string) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value !== "string") throw conflict(`${label} is invalid.`);
  return exactIso(value, label);
}

function readExecution(
  snapshot: DocumentSnapshot<DocumentData>,
): LiveVendorLifecycleExecutionRecord {
  const record = snapshot.data() as LiveVendorLifecycleExecutionRecord | undefined;
  if (
    !record ||
    record.schemaVersion !== 1 ||
    record.id !== snapshot.id ||
    !/^exec_[a-f0-9]{40}$/.test(record.s20ExecutionId) ||
    record.environment !== "production" ||
    record.dataMode !== "live" ||
    record.attemptCount !== 1
  ) {
    throw conflict("Vendor lifecycle execution record is malformed.");
  }
  if (record.bindings.kind === "invite") {
    const bindings = record.bindings;
    const recoveryFields = [
      bindings.supersededExecutionId,
      bindings.supersededS20ExecutionId,
      bindings.supersessionHash,
    ];
    const present = recoveryFields.filter((value) => value !== undefined).length;
    const initialGeneration =
      bindings.inviteMode === "initial" &&
      bindings.inviteVersion === 0 &&
      bindings.issuedInviteVersion === 1 &&
      bindings.vendorUpdatedAt === "generation:new" &&
      present === 0;
    const recoveryGeneration =
      bindings.inviteMode === "delivery_recovery" &&
      Number.isSafeInteger(bindings.inviteVersion) &&
      bindings.inviteVersion >= 1 &&
      bindings.issuedInviteVersion === bindings.inviteVersion &&
      bindings.vendorUpdatedAt !== "generation:new" &&
      present === 3;
    const reissueGeneration =
      bindings.inviteMode === "setup_link_reissue" &&
      Number.isSafeInteger(bindings.inviteVersion) &&
      bindings.inviteVersion >= 1 &&
      Number.isSafeInteger(bindings.issuedInviteVersion) &&
      bindings.issuedInviteVersion === bindings.inviteVersion + 1 &&
      bindings.vendorUpdatedAt !== "generation:new" &&
      present === 3;
    if (
      (!initialGeneration && !recoveryGeneration && !reissueGeneration) ||
      !bindings.vendorRef?.trim() ||
      !bindings.vendorUid?.trim() ||
      !/^[a-f0-9]{64}$/.test(bindings.emailHash) ||
      !/^[a-f0-9]{64}$/.test(bindings.companyHash) ||
      !bindings.ticketRef?.trim() ||
      !bindings.ticketUpdatedAt?.trim() ||
      bindings.artifactRef !== "vendor-invite:v1.0" ||
      bindings.rfcMessageId !== liveVendorInviteRfcMessageId(record.id) ||
      (present !== 0 && present !== 3) ||
      (present === 3 &&
        (bindings.supersessionHash !==
          sha256(
            `${bindings.supersededExecutionId}\0${bindings.supersededS20ExecutionId}`,
          ) ||
          !/^[a-f0-9]{64}$/.test(bindings.supersededExecutionId ?? "") ||
          !/^exec_[a-f0-9]{40}$/.test(bindings.supersededS20ExecutionId ?? "")))
    ) {
      throw conflict("Vendor invite generation binding is malformed.");
    }
  }
  if (record.bindings.kind === "disable") {
    const bindings = record.bindings;
    const commonValid =
      /^[a-f0-9]{64}$/.test(bindings.rootExecutionId) &&
      /^exec_[a-f0-9]{40}$/.test(bindings.rootS20ExecutionId) &&
      /^[a-f0-9]{64}$/.test(bindings.completionOwnerExecutionId) &&
      /^exec_[a-f0-9]{40}$/.test(bindings.completionOwnerS20ExecutionId) &&
      Number.isSafeInteger(bindings.completionGeneration) &&
      bindings.completionGeneration >= 0 &&
      Number.isSafeInteger(bindings.issuedCompletionGeneration) &&
      bindings.issuedCompletionGeneration >= 0 &&
      requiredIso(bindings.accessDisabledAt, "Vendor access cutoff") <=
        requiredIso(
          bindings.completionLeaseExpiresAt,
          "Vendor disable completion source lease",
        ) &&
      requiredIso(bindings.accessDisabledAt, "Vendor access cutoff") <=
        requiredIso(
          bindings.issuedCompletionLeaseExpiresAt,
          "Vendor disable completion issued lease",
        ) &&
      bindings.accessDisabledAt === record.accessDisabledAt;
    const initialValid =
      bindings.disableMode === "initial" &&
      bindings.currentStatus !== "disabled" &&
      bindings.rootExecutionId === record.id &&
      bindings.rootS20ExecutionId === record.s20ExecutionId &&
      bindings.completionGeneration === 0 &&
      bindings.issuedCompletionGeneration === 0 &&
      bindings.completionOwnerExecutionId === record.id &&
      bindings.completionOwnerS20ExecutionId === record.s20ExecutionId;
    const recoveryValid =
      bindings.disableMode === "firebase_completion_recovery" &&
      bindings.currentStatus === "disabled" &&
      bindings.rootExecutionId !== record.id &&
      bindings.completionOwnerExecutionId !== record.id &&
      bindings.issuedCompletionGeneration === bindings.completionGeneration + 1;
    if (!commonValid || (!initialValid && !recoveryValid)) {
      throw conflict("Vendor disable completion binding is malformed.");
    }
  }
  const receipt = parseOptionalLiveVendorLifecycleReceipt(record);
  return receipt ? { ...record, receipt } : record;
}

function requireExecution(
  snapshot: DocumentSnapshot<DocumentData>,
): LiveVendorLifecycleExecutionRecord {
  if (!snapshot.exists) {
    throw conflict("Vendor lifecycle execution does not exist.");
  }
  return readExecution(snapshot);
}

function requiredRecoveryExecutionId(bindings: LiveVendorInviteBindings): string {
  const executionId = bindings.supersededExecutionId;
  const s20ExecutionId = bindings.supersededS20ExecutionId;
  if (
    !executionId ||
    !s20ExecutionId ||
    bindings.supersessionHash !== sha256(`${executionId}\0${s20ExecutionId}`)
  ) {
    throw conflict("The Vendor invite recovery source binding is malformed.");
  }
  return executionId;
}

function assertRecoverySource(
  recovery: LiveVendorLifecycleExecutionRecord,
  source: LiveVendorLifecycleExecutionRecord,
) {
  if (
    recovery.bindings.kind !== "invite" ||
    source.id !== recovery.bindings.supersededExecutionId ||
    source.s20ExecutionId !== recovery.bindings.supersededS20ExecutionId ||
    source.actionKey !== "vendor.account.invite" ||
    source.bindings.kind !== "invite" ||
    source.bindings.vendorRef !== recovery.bindings.vendorRef ||
    source.bindings.vendorUid !== recovery.bindings.vendorUid ||
    source.bindings.emailHash !== recovery.bindings.emailHash ||
    source.bindings.companyHash !== recovery.bindings.companyHash
  ) {
    throw conflict("The Vendor invite recovery source no longer matches.");
  }
}

function requireIdentityClaim(
  snapshot: DocumentSnapshot<DocumentData>,
): VendorIdentityClaim {
  const claim = snapshot.data() as VendorIdentityClaim | undefined;
  if (
    !snapshot.exists ||
    !claim ||
    claim.schemaVersion !== 1 ||
    claim.dataMode !== "live" ||
    claim.emailHash !== snapshot.id ||
    !claim.vendorRef?.trim() ||
    !claim.vendorUid?.trim() ||
    !claim.executionId?.trim()
  ) {
    throw conflict("The Vendor identity reservation is malformed.");
  }
  return claim;
}

function assertRecoveryClaim(
  claim: VendorIdentityClaim,
  recovery: LiveVendorLifecycleExecutionRecord,
) {
  if (
    recovery.bindings.kind !== "invite" ||
    claim.executionId !== recovery.id ||
    claim.emailHash !== recovery.bindings.emailHash ||
    claim.vendorRef !== recovery.bindings.vendorRef ||
    claim.vendorUid !== recovery.bindings.vendorUid ||
    claim.dataMode !== "live"
  ) {
    throw conflict("The Vendor identity reservation changed during recovery.");
  }
}

function assertDisableInviteInterlock(
  invite: LiveVendorLifecycleExecutionRecord,
  claim: VendorIdentityClaim,
  command: LiveVendorDisableInput,
) {
  if (
    invite.id !== claim.executionId ||
    invite.actionKey !== "vendor.account.invite" ||
    invite.bindings.kind !== "invite" ||
    invite.bindings.vendorRef !== command.vendorRef ||
    invite.bindings.vendorUid !== command.vendorUid ||
    invite.bindings.emailHash !== sha256(normalizeLiveVendorEmail(command.email)) ||
    invite.bindings.companyHash !== hashLiveVendorContact(command.company)
  ) {
    throw conflict("The current Vendor invite cannot be fenced by this access cutoff.");
  }
}

function assertCurrentInviteExternalEffectGeneration(
  vendor: StoredVendorRecord,
  claim: VendorIdentityClaim,
  record: LiveVendorLifecycleExecutionRecord,
) {
  const expectedVendorUpdatedAt =
    record.bindings.kind === "invite" &&
    record.bindings.inviteMode === "delivery_recovery"
      ? record.bindings.vendorUpdatedAt
      : record.createdAt;
  if (
    record.actionKey !== "vendor.account.invite" ||
    record.bindings.kind !== "invite" ||
    vendor.id !== record.bindings.vendorRef ||
    vendor.uid !== record.bindings.vendorUid ||
    vendor.status !== "pending_setup" ||
    vendor.inviteVersion !== record.bindings.issuedInviteVersion ||
    vendor.updatedAt !== expectedVendorUpdatedAt ||
    sha256(normalizeLiveVendorEmail(vendor.email)) !== record.bindings.emailHash ||
    hashLiveVendorContact(vendor.displayName ?? "") !== record.bindings.companyHash ||
    claim.executionId !== record.id ||
    claim.emailHash !== record.bindings.emailHash ||
    claim.vendorRef !== record.bindings.vendorRef ||
    claim.vendorUid !== record.bindings.vendorUid ||
    claim.dataMode !== "live"
  ) {
    throw conflict(
      "The current Vendor invite generation is no longer eligible for external effects.",
    );
  }
  assertVendorSetupEffectsIdle(vendor);
}

/**
 * Gmail completion may race with the exact same setup challenge activating the Vendor. Activation
 * changes only the projection timestamp/status, so the receipt ledger may still close when the
 * immutable identity and invite generation remain exact. It must never rewrite that active
 * projection back to pending setup.
 */
function assertCurrentInviteCompletionGeneration(
  vendor: StoredVendorRecord,
  claim: VendorIdentityClaim,
  record: LiveVendorLifecycleExecutionRecord,
) {
  if (vendor.status === "pending_setup") {
    assertCurrentInviteExternalEffectGeneration(vendor, claim, record);
    return;
  }
  if (
    record.actionKey !== "vendor.account.invite" ||
    record.bindings.kind !== "invite" ||
    vendor.id !== record.bindings.vendorRef ||
    vendor.uid !== record.bindings.vendorUid ||
    vendor.status !== "active" ||
    vendor.inviteVersion !== record.bindings.issuedInviteVersion ||
    sha256(normalizeLiveVendorEmail(vendor.email)) !== record.bindings.emailHash ||
    hashLiveVendorContact(vendor.displayName ?? "") !== record.bindings.companyHash ||
    claim.executionId !== record.id ||
    claim.emailHash !== record.bindings.emailHash ||
    claim.vendorRef !== record.bindings.vendorRef ||
    claim.vendorUid !== record.bindings.vendorUid ||
    claim.dataMode !== "live" ||
    vendor.identityState?.emailVerified !== true ||
    vendor.identityState.totpRequired !== true ||
    vendor.identityState.totpVerified !== true ||
    !vendor.activatedAt ||
    !Number.isFinite(Date.parse(vendor.activatedAt))
  ) {
    throw conflict(
      "The completed Vendor setup generation no longer matches the invite delivery.",
    );
  }
  assertVendorSetupEffectsIdle(vendor);
}

function assertInviteVendorGenerationForRecoveryResolution(
  vendor: StoredVendorRecord,
  record: LiveVendorLifecycleExecutionRecord,
) {
  if (
    record.actionKey !== "vendor.account.invite" ||
    record.bindings.kind !== "invite" ||
    vendor.id !== record.bindings.vendorRef ||
    vendor.uid !== record.bindings.vendorUid ||
    vendor.inviteVersion !== record.bindings.issuedInviteVersion ||
    sha256(normalizeLiveVendorEmail(vendor.email)) !== record.bindings.emailHash ||
    hashLiveVendorContact(vendor.displayName ?? "") !== record.bindings.companyHash
  ) {
    throw conflict("The historical Vendor delivery generation no longer matches.");
  }
  if (vendor.status === "pending_setup") {
    const expectedVendorUpdatedAt =
      record.bindings.inviteMode === "delivery_recovery"
        ? record.bindings.vendorUpdatedAt
        : record.createdAt;
    if (vendor.updatedAt !== expectedVendorUpdatedAt) {
      throw conflict("The historical Vendor invite generation changed.");
    }
    assertVendorSetupEffectsIdle(vendor);
    return;
  }
  if (vendor.status === "active") {
    if (
      vendor.identityState?.emailVerified !== true ||
      vendor.identityState.totpRequired !== true ||
      vendor.identityState.totpVerified !== true ||
      !vendor.activatedAt ||
      !Number.isFinite(Date.parse(vendor.activatedAt))
    ) {
      throw conflict("The active Vendor setup generation is not exact.");
    }
    assertVendorSetupEffectsIdle(vendor);
    return;
  }
  if (
    vendor.status !== "disabled" ||
    !vendor.disabledAt ||
    !Number.isFinite(Date.parse(vendor.disabledAt))
  ) {
    throw conflict("The disabled Vendor cutoff generation is not exact.");
  }
}

function readVendor(snapshot: DocumentSnapshot<DocumentData>): StoredVendorRecord {
  const vendor = snapshot.data() as StoredVendorRecord | undefined;
  if (
    !vendor ||
    vendor.id !== snapshot.id ||
    vendor.id === LIVE_VENDOR_NO_ASSIGNMENT_REF ||
    vendor.data_mode !== "live" ||
    !["pending_setup", "active", "disabled"].includes(vendor.status) ||
    !Number.isSafeInteger(vendor.inviteVersion) ||
    vendor.inviteVersion < 1 ||
    !vendor.uid?.trim() ||
    !vendor.email?.trim() ||
    !vendor.updatedAt?.trim()
  ) {
    throw conflict("The Live Vendor record is unavailable.");
  }
  return vendor;
}

function readDisableCompletionClaim(
  snapshot: DocumentSnapshot<DocumentData>,
): LiveVendorDisableCompletionClaim {
  const claim = snapshot.data() as LiveVendorDisableCompletionClaim | undefined;
  if (
    !snapshot.exists ||
    !claim ||
    claim.schemaVersion !== 1 ||
    claim.vendorRef !== snapshot.id ||
    !claim.vendorRef.trim() ||
    !claim.vendorUid.trim() ||
    !/^[a-f0-9]{64}$/.test(claim.rootExecutionId) ||
    !/^exec_[a-f0-9]{40}$/.test(claim.rootS20ExecutionId) ||
    !/^[a-f0-9]{64}$/.test(claim.ownerExecutionId) ||
    !/^exec_[a-f0-9]{40}$/.test(claim.ownerS20ExecutionId) ||
    !Number.isSafeInteger(claim.completionGeneration) ||
    claim.completionGeneration < 0 ||
    claim.dataMode !== "live" ||
    requiredIso(claim.accessDisabledAt, "Vendor access cutoff") >
      requiredIso(claim.ownerLeaseExpiresAt, "Vendor disable completion lease") ||
    requiredIso(claim.createdAt, "Vendor disable claim creation") >
      requiredIso(claim.updatedAt, "Vendor disable claim update") ||
    (claim.completedAt !== undefined &&
      requiredIso(claim.completedAt, "Vendor disable completion") <
        requiredIso(claim.accessDisabledAt, "Vendor access cutoff"))
  ) {
    throw conflict("The Vendor disable completion claim is malformed.");
  }
  return claim;
}

function assertDisableRecoverySource(input: {
  claim: LiveVendorDisableCompletionClaim;
  command: DisableLiveVendorAccessInput["command"];
  root: LiveVendorLifecycleExecutionRecord;
  owner: LiveVendorLifecycleExecutionRecord;
}) {
  const { claim, command, root, owner } = input;
  if (
    claim.completedAt ||
    claim.vendorRef !== command.vendorRef ||
    claim.vendorUid !== command.vendorUid ||
    claim.rootExecutionId !== command.rootExecutionId ||
    claim.rootS20ExecutionId !== command.rootS20ExecutionId ||
    claim.accessDisabledAt !== command.accessDisabledAt ||
    claim.completionGeneration !== command.completionGeneration ||
    claim.ownerExecutionId !== command.completionOwnerExecutionId ||
    claim.ownerS20ExecutionId !== command.completionOwnerS20ExecutionId ||
    claim.ownerLeaseExpiresAt !== command.completionLeaseExpiresAt ||
    root.id !== claim.rootExecutionId ||
    root.s20ExecutionId !== claim.rootS20ExecutionId ||
    root.actionKey !== "vendor.account.disable" ||
    root.bindings.kind !== "disable" ||
    root.bindings.disableMode !== "initial" ||
    root.bindings.rootExecutionId !== root.id ||
    root.bindings.rootS20ExecutionId !== root.s20ExecutionId ||
    root.bindings.accessDisabledAt !== claim.accessDisabledAt ||
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
    throw conflict("The Vendor disable completion source changed after preview.");
  }
}

function assertDisableRecoveryRecord(
  record: LiveVendorLifecycleExecutionRecord,
  command: DisableLiveVendorAccessInput["command"],
) {
  if (
    record.actionKey !== "vendor.account.disable" ||
    record.bindings.kind !== "disable" ||
    record.bindings.disableMode !== "firebase_completion_recovery" ||
    record.bindings.rootExecutionId !== command.rootExecutionId ||
    record.bindings.rootS20ExecutionId !== command.rootS20ExecutionId ||
    record.bindings.accessDisabledAt !== command.accessDisabledAt ||
    record.bindings.completionGeneration !== command.completionGeneration ||
    record.bindings.completionOwnerExecutionId !== command.completionOwnerExecutionId ||
    record.bindings.completionOwnerS20ExecutionId !==
      command.completionOwnerS20ExecutionId ||
    record.bindings.completionLeaseExpiresAt !== command.completionLeaseExpiresAt
  ) {
    throw conflict("The Vendor disable recovery identity is already bound.");
  }
}

function assertCurrentDisableCompletionOwner(
  claim: LiveVendorDisableCompletionClaim,
  record: LiveVendorLifecycleExecutionRecord,
) {
  if (claim.completedAt) {
    throw conflict("The Vendor disable completion owner changed.");
  }
  assertDisableCompletionOwnerMatches(claim, record);
}

function assertDisableCompletionWorker(
  record: LiveVendorLifecycleExecutionRecord,
  workerToken: string,
) {
  if (
    disableCompletionWorkerTokenHash(workerToken) !== record.completionWorkerTokenHash
  ) {
    throw conflict("The Vendor disable completion worker changed.");
  }
}

function assertRecoveryReadbackWorker(
  record: LiveVendorLifecycleExecutionRecord,
  workerToken: string,
  nowIso: string,
) {
  const leaseExpiresAt = Date.parse(record.recoveryReadbackWorkerLeaseExpiresAt ?? "");
  if (
    recoveryReadbackWorkerTokenHash(workerToken) !==
      record.recoveryReadbackWorkerTokenHash ||
    !Number.isFinite(leaseExpiresAt) ||
    leaseExpiresAt <= Date.parse(nowIso)
  ) {
    throw conflict("The Vendor invite recovery readback worker changed.");
  }
}

function recoveryReadbackWorkerTokenHash(workerToken: string) {
  if (
    typeof workerToken !== "string" ||
    workerToken.length < 32 ||
    workerToken.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(workerToken)
  ) {
    throw conflict("The Vendor invite recovery readback worker token is invalid.");
  }
  return sha256(workerToken);
}

function disableCompletionWorkerTokenHash(workerToken: string) {
  if (
    typeof workerToken !== "string" ||
    workerToken.length < 32 ||
    workerToken.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(workerToken)
  ) {
    throw conflict("The Vendor disable completion worker token is invalid.");
  }
  return sha256(workerToken);
}

function assertDisableCompletionOwnerMatches(
  claim: LiveVendorDisableCompletionClaim,
  record: LiveVendorLifecycleExecutionRecord,
) {
  if (
    record.bindings.kind !== "disable" ||
    claim.vendorRef !== record.bindings.vendorRef ||
    claim.vendorUid !== record.bindings.vendorUid ||
    claim.rootExecutionId !== record.bindings.rootExecutionId ||
    claim.rootS20ExecutionId !== record.bindings.rootS20ExecutionId ||
    claim.accessDisabledAt !== record.bindings.accessDisabledAt ||
    claim.completionGeneration !== record.bindings.issuedCompletionGeneration ||
    claim.ownerExecutionId !== record.id ||
    claim.ownerS20ExecutionId !== record.s20ExecutionId
  ) {
    throw conflict("The Vendor disable completion owner changed.");
  }
}

function assertExactReservedVendor(
  vendor: StoredVendorRecord,
  vendorRef: string,
  vendorUid: string,
  email: string,
  company: string,
) {
  if (
    vendor.id !== vendorRef ||
    vendor.uid !== vendorUid ||
    normalizeLiveVendorEmail(vendor.email) !== email ||
    vendor.displayName !== company.trim() ||
    vendor.status !== "pending_setup" ||
    vendor.data_mode !== "live"
  ) {
    throw conflict("The deterministic Vendor reservation conflicts with existing data.");
  }
}

function assertInviteVendorGeneration(
  vendor: StoredVendorRecord,
  command: ClaimLiveVendorInviteInput["command"],
) {
  if (
    vendor.id !== command.vendorRef ||
    vendor.uid !== command.vendorUid ||
    vendor.status !== "pending_setup" ||
    vendor.inviteVersion !== command.inviteVersion ||
    vendor.updatedAt !== command.vendorUpdatedAt
  ) {
    throw conflict("The pending-setup Vendor generation changed after preview.");
  }
}

function assertVendorSetupEffectsIdle(vendor: StoredVendorRecord) {
  if (vendor.setupEffectFence !== undefined) {
    throw conflict(
      "The Vendor setup effect must finish before another lifecycle change.",
    );
  }
}

function assertLiveVendorGeneration(
  snapshot: DocumentSnapshot<DocumentData>,
  input: {
    vendorRef: string;
    vendorUid: string;
    email: string;
    company: string;
    vendorUpdatedAt: string;
  },
  allowedStatuses: readonly StoredVendorRecord["status"][],
): StoredVendorRecord {
  if (!snapshot.exists) throw conflict("The Live Vendor no longer exists.");
  const vendor = readVendor(snapshot);
  if (
    vendor.id !== input.vendorRef ||
    vendor.uid !== input.vendorUid ||
    normalizeLiveVendorEmail(vendor.email) !== normalizeLiveVendorEmail(input.email) ||
    vendor.displayName !== input.company.trim() ||
    vendor.updatedAt !== input.vendorUpdatedAt ||
    !allowedStatuses.includes(vendor.status)
  ) {
    throw conflict("The Live Vendor changed after preview.");
  }
  return vendor;
}

function assertLiveTicketGeneration(
  snapshot: DocumentSnapshot<DocumentData>,
  ticketRef: string,
  updatedAt: string,
): StoredTicketRecord {
  const ticket = assertLiveTicket(snapshot, ticketRef);
  if (ticket.updated_at !== updatedAt) {
    throw conflict("The maintenance ticket changed after preview.");
  }
  return ticket;
}

function assertLiveTicket(
  snapshot: DocumentSnapshot<DocumentData>,
  ticketRef: string,
): StoredTicketRecord {
  const ticket = snapshot.data() as StoredTicketRecord | undefined;
  if (
    !snapshot.exists ||
    !ticket ||
    snapshot.id !== ticketRef ||
    ticket.id !== ticketRef ||
    ticket.data_mode !== "live" ||
    !ticket.updated_at?.trim()
  ) {
    throw conflict("The exact Live maintenance ticket is unavailable.");
  }
  return ticket;
}

function assertAssignmentJoin(
  snapshot: DocumentSnapshot<DocumentData>,
  ticketRef: string,
  currentVendorRef: string,
) {
  if (currentVendorRef === LIVE_VENDOR_NO_ASSIGNMENT_REF) {
    if (!snapshot.exists) return;
    const assignment = snapshot.data() as StoredAssignmentRecord;
    if (
      assignment.active === true ||
      assignment.ticket_id !== ticketRef ||
      assignment.data_mode !== "live" ||
      assignment.vendor_id === LIVE_VENDOR_NO_ASSIGNMENT_REF
    ) {
      throw conflict("The ticket and Vendor assignment records disagree.");
    }
    return;
  }
  if (!snapshot.exists) {
    throw conflict("The ticket has no matching Vendor assignment record.");
  }
  const assignment = snapshot.data() as StoredAssignmentRecord;
  if (
    assignment.ticket_id !== ticketRef ||
    assignment.vendor_id !== currentVendorRef ||
    assignment.active !== true ||
    assignment.data_mode !== "live"
  ) {
    throw conflict("The ticket and Vendor assignment records disagree.");
  }
}

function assertAssignmentOperation(
  input: CommitLiveVendorAssignmentInput["command"],
  currentVendorRef: string,
) {
  if (
    input.operation === "assign" &&
    (input.targetVendorRef !== input.vendorRef || currentVendorRef === input.vendorRef)
  ) {
    throw conflict("The requested Vendor assignment is already applied or malformed.");
  }
  if (
    input.operation === "remove" &&
    (input.targetVendorRef !== LIVE_VENDOR_NO_ASSIGNMENT_REF ||
      currentVendorRef !== input.vendorRef)
  ) {
    throw conflict("The requested Vendor removal no longer matches the ticket.");
  }
}

function assertExecutionId(
  actionKey: LiveVendorLifecycleActionKey,
  idempotencyKey: string,
  actual: string,
) {
  if (liveVendorLifecycleExecutionId(actionKey, idempotencyKey) !== actual) {
    throw conflict("Vendor lifecycle execution identity is invalid.");
  }
}

function assertInviteCommandGeneration(
  command: ClaimLiveVendorInviteInput["command"],
  expectedMode: "initial" | "delivery_recovery" | "setup_link_reissue",
) {
  if (
    command.inviteMode !== expectedMode ||
    !Number.isSafeInteger(command.inviteVersion) ||
    (expectedMode === "initial"
      ? command.inviteVersion !== 0 ||
        command.vendorRef !== "vendor:new" ||
        command.vendorUid !== "identity:new" ||
        command.vendorStatus !== "none" ||
        command.vendorUpdatedAt !== "generation:new"
      : command.inviteVersion < 1 ||
        command.vendorRef === "vendor:new" ||
        command.vendorUid === "identity:new" ||
        command.vendorStatus !== "pending_setup" ||
        command.vendorUpdatedAt === "generation:new")
  ) {
    throw conflict("The Vendor invite generation does not match its action mode.");
  }
}

function assertDisableCommandMode(
  command: DisableLiveVendorAccessInput["command"],
  expectedMode: "initial" | "firebase_completion_recovery",
) {
  const initial = LIVE_VENDOR_DISABLE_INITIAL_SOURCE;
  if (
    command.disableMode !== expectedMode ||
    !Number.isSafeInteger(command.completionGeneration) ||
    (expectedMode === "initial"
      ? command.currentStatus === "disabled" ||
        command.rootExecutionId !== initial.rootExecutionId ||
        command.rootS20ExecutionId !== initial.rootS20ExecutionId ||
        command.accessDisabledAt !== initial.accessDisabledAt ||
        command.completionGeneration !== initial.completionGeneration ||
        command.completionOwnerExecutionId !== initial.completionOwnerExecutionId ||
        command.completionOwnerS20ExecutionId !== initial.completionOwnerS20ExecutionId ||
        command.completionLeaseExpiresAt !== initial.completionLeaseExpiresAt
      : command.currentStatus !== "disabled" ||
        command.completionGeneration < 0 ||
        !/^[a-f0-9]{64}$/.test(command.rootExecutionId) ||
        !/^exec_[a-f0-9]{40}$/.test(command.rootS20ExecutionId) ||
        !/^[a-f0-9]{64}$/.test(command.completionOwnerExecutionId) ||
        !/^exec_[a-f0-9]{40}$/.test(command.completionOwnerS20ExecutionId) ||
        requiredIso(command.accessDisabledAt, "Vendor access cutoff") >
          requiredIso(
            command.completionLeaseExpiresAt,
            "Vendor disable completion lease",
          ))
  ) {
    throw conflict("The Vendor disable generation does not match its action mode.");
  }
}

function disableCompletionLeaseExpiresAt(nowIso: string): string {
  return new Date(
    requiredIso(nowIso, "Vendor disable completion clock") +
      LIVE_VENDOR_DISABLE_COMPLETION_LEASE_MS,
  ).toISOString();
}

function requiredIso(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw conflict(`${label} is invalid.`);
  }
  return timestamp;
}

function assertPayload(record: LiveVendorLifecycleExecutionRecord, payloadHash: string) {
  if (record.payloadHash !== payloadHash) {
    throw conflict(
      "That idempotency key is already bound to a different Vendor lifecycle payload.",
    );
  }
}

function baseRecord(input: {
  id: string;
  actionKey: LiveVendorLifecycleActionKey;
  idempotencyKey: string;
  payloadHash: string;
  actorUid: string;
  bindings: LiveVendorLifecycleExecutionRecord["bindings"];
  phase: LiveVendorLifecycleExecutionRecord["phase"];
  state: LiveVendorLifecycleExecutionRecord["state"];
  nowIso: string;
  accessDisabledAt?: string;
}): LiveVendorLifecycleExecutionRecord {
  return {
    schemaVersion: 1,
    id: input.id,
    s20ExecutionId: liveVendorS20ExecutionId(input.actionKey, input.idempotencyKey),
    actionKey: input.actionKey,
    idempotencyKeyHash: sha256(input.idempotencyKey),
    payloadHash: input.payloadHash,
    actorUid: input.actorUid,
    environment: "production",
    dataMode: "live",
    state: input.state,
    phase: input.phase,
    attemptCount: 1,
    bindings: input.bindings,
    ...(input.accessDisabledAt ? { accessDisabledAt: input.accessDisabledAt } : {}),
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  };
}

function terminalRecord(
  record: LiveVendorLifecycleExecutionRecord,
  receipt: LiveVendorLifecycleReceipt,
  nowIso: string,
): LiveVendorLifecycleExecutionRecord {
  return {
    ...record,
    state: "succeeded",
    phase: "succeeded",
    receipt,
    updatedAt: nowIso,
  };
}

function inviteReceipt(
  record: LiveVendorLifecycleExecutionRecord,
  bindings: LiveVendorInviteBindings,
  input: {
    deliveryRefHash: string;
    reconciled: boolean;
    nowIso: string;
  },
): LiveVendorLifecycleReceipt {
  const bodyless = {
    actionKey: record.actionKey,
    deliveryRefHash: input.deliveryRefHash,
    inviteMode: bindings.inviteMode,
    inviteVersion: bindings.issuedInviteVersion,
    state: "pending_setup",
    ticketRef: bindings.ticketRef,
    vendorRef: bindings.vendorRef,
  };
  return {
    schemaVersion: 1,
    id: liveVendorLifecycleReceiptId(record.id),
    executionId: record.id,
    actionKey: record.actionKey,
    providerRef: bindings.vendorRef,
    resultHash: sha256(JSON.stringify(bodyless)),
    vendorRef: bindings.vendorRef,
    state: "pending_setup",
    ticketRef: bindings.ticketRef,
    deliveryRefHash: input.deliveryRefHash,
    reconciled: input.reconciled,
    createdAt: input.nowIso,
  };
}

function inviteInvalidatedReceipt(
  record: LiveVendorLifecycleExecutionRecord,
  bindings: LiveVendorInviteBindings,
  input: {
    deliveryRefHash: string;
    reconciled: boolean;
    nowIso: string;
  },
): LiveVendorLifecycleReceipt {
  const providerRef = `vendor-invite-delivery-invalidated:${record.id}`;
  const bodyless = {
    actionKey: record.actionKey,
    deliveryRefHash: input.deliveryRefHash,
    executionId: record.id,
    idempotencyKeyHash: record.idempotencyKeyHash,
    reasonCode: "disabled_during_invite_delivery",
    s20ExecutionId: record.s20ExecutionId,
    state: "delivery_invalidated",
    ticketRef: bindings.ticketRef,
    vendorRef: bindings.vendorRef,
  };
  return {
    schemaVersion: 1,
    id: liveVendorLifecycleReceiptId(record.id),
    executionId: record.id,
    actionKey: record.actionKey,
    providerRef,
    resultHash: sha256(JSON.stringify(bodyless)),
    vendorRef: bindings.vendorRef,
    state: "delivery_invalidated",
    ticketRef: bindings.ticketRef,
    deliveryRefHash: input.deliveryRefHash,
    reconciled: input.reconciled,
    createdAt: input.nowIso,
  };
}

function assignmentReceipt(
  record: LiveVendorLifecycleExecutionRecord,
  bindings: LiveVendorAssignmentBindings,
  providerRef: string,
  nowIso: string,
): LiveVendorLifecycleReceipt {
  const state = bindings.operation === "assign" ? "assigned" : "removed";
  const bodyless = {
    actionKey: record.actionKey,
    currentVendorRef: bindings.currentVendorRef,
    operation: bindings.operation,
    providerRef,
    state,
    targetVendorRef: bindings.targetVendorRef,
    ticketRef: bindings.ticketRef,
    vendorRef: bindings.vendorRef,
  };
  return {
    schemaVersion: 1,
    id: liveVendorLifecycleReceiptId(record.id),
    executionId: record.id,
    actionKey: record.actionKey,
    providerRef,
    resultHash: sha256(JSON.stringify(bodyless)),
    vendorRef: bindings.vendorRef,
    state,
    ticketRef: bindings.ticketRef,
    currentVendorRef: bindings.currentVendorRef,
    targetVendorRef: bindings.targetVendorRef,
    operation: bindings.operation,
    reconciled: false,
    createdAt: nowIso,
  };
}

function disableReceipt(
  record: LiveVendorLifecycleExecutionRecord,
  bindings: LiveVendorDisableBindings,
  reconciled: boolean,
  nowIso: string,
): LiveVendorLifecycleReceipt {
  const bodyless = {
    accessDisabledAt: bindings.accessDisabledAt,
    actionKey: record.actionKey,
    clearedAssignmentRefs: bindings.activeAssignmentRefs,
    disableMode: bindings.disableMode,
    mailboxState: bindings.mailboxState,
    mailboxTokenRefHash: bindings.mailboxTokenRefHash,
    rootExecutionId: bindings.rootExecutionId,
    rootS20ExecutionId: bindings.rootS20ExecutionId,
    state: "disabled",
    vendorRef: bindings.vendorRef,
  };
  return {
    schemaVersion: 1,
    id: liveVendorLifecycleReceiptId(record.id),
    executionId: record.id,
    actionKey: record.actionKey,
    providerRef: bindings.vendorRef,
    resultHash: sha256(JSON.stringify(bodyless)),
    vendorRef: bindings.vendorRef,
    state: "disabled",
    clearedAssignmentRefs: bindings.activeAssignmentRefs,
    mailboxState: bindings.mailboxState,
    reconciled,
    createdAt: nowIso,
  };
}

function lifecycleAudit(
  record: LiveVendorLifecycleExecutionRecord,
  event: string,
  createdAt: string,
) {
  return {
    schema_version: 1,
    execution_id: record.id,
    s20_execution_id: record.s20ExecutionId,
    action_key: record.actionKey,
    actor_uid: record.actorUid,
    payload_hash: record.payloadHash,
    environment: "production",
    data_mode: "live",
    state: record.state,
    phase: record.phase,
    event,
    vendor_ref: record.bindings.vendorRef,
    ...(record.bindings.kind === "invite" || record.bindings.kind === "assignment"
      ? { ticket_ref: record.bindings.ticketRef }
      : {}),
    ...(record.bindings.kind === "invite"
      ? {
          invite_mode: record.bindings.inviteMode,
          invite_version: record.bindings.inviteVersion,
          issued_invite_version: record.bindings.issuedInviteVersion,
          vendor_generation: record.bindings.vendorUpdatedAt,
        }
      : {}),
    ...(record.bindings.kind === "disable"
      ? {
          access_disabled_at: record.bindings.accessDisabledAt,
          completion_generation: record.bindings.completionGeneration,
          completion_owner_execution_id: record.bindings.completionOwnerExecutionId,
          completion_owner_s20_execution_id:
            record.bindings.completionOwnerS20ExecutionId,
          disable_mode: record.bindings.disableMode,
          issued_completion_generation: record.bindings.issuedCompletionGeneration,
          root_execution_id: record.bindings.rootExecutionId,
          root_s20_execution_id: record.bindings.rootS20ExecutionId,
        }
      : {}),
    ...(record.bindings.kind === "invite" && record.bindings.supersededExecutionId
      ? {
          superseded_execution_id: record.bindings.supersededExecutionId,
          superseded_s20_execution_id: record.bindings.supersededS20ExecutionId,
          supersession_hash: record.bindings.supersessionHash,
        }
      : {}),
    ...(record.receipt
      ? {
          receipt_id: record.receipt.id,
          result_hash: record.receipt.resultHash,
        }
      : {}),
    created_at: createdAt,
  };
}

function s20Index(
  record: LiveVendorLifecycleExecutionRecord,
  createdAt: string,
): VendorLifecycleS20Index {
  return {
    schemaVersion: 1,
    s20ExecutionId: record.s20ExecutionId,
    executionId: record.id,
    actionKey: record.actionKey,
    dataMode: "live",
    createdAt,
  };
}

function vendorAudit(input: {
  actorUid: string;
  vendorId: string;
  ticketId?: string;
  action: string;
  reasonHash: string;
  createdAt: string;
}) {
  return {
    actorUid: input.actorUid,
    vendorId: input.vendorId,
    action: input.action,
    ...(input.ticketId ? { ticketId: input.ticketId } : {}),
    reasonHash: input.reasonHash,
    createdAt: input.createdAt,
  };
}

function exactLiveMailboxConnection(
  snapshot: DocumentSnapshot<DocumentData>,
  vendorRef: string,
):
  | { state: "none"; tokenRefHash: "none"; connection?: never }
  | {
      state: "connected" | "revocation_pending" | "revoked";
      tokenRefHash: string;
      connection: StoredMailboxConnection;
    } {
  if (!snapshot.exists) {
    return { state: "none", tokenRefHash: "none" };
  }
  const connection = snapshot.data() as StoredMailboxConnection | undefined;
  const status = connection?.status;
  if (
    !connection ||
    snapshot.id !== vendorRef ||
    connection.vendorId !== vendorRef ||
    connection.dataMode !== "live" ||
    connection.provider !== "google" ||
    !connection.mailboxEmail?.trim() ||
    !connection.tokenSecretRef?.trim() ||
    !Array.isArray(connection.scopes) ||
    !connection.connectedAt?.trim() ||
    !connection.updatedAt?.trim() ||
    (status !== "connected" && status !== "revocation_pending" && status !== "revoked")
  ) {
    throw conflict("The Vendor mailbox connection is not an exact Live record.");
  }
  return {
    state: status,
    tokenRefHash: sha256(connection.tokenSecretRef),
    connection,
  };
}

function assertExactRevocationState(
  snapshot: DocumentSnapshot<DocumentData>,
  vendorRef: string,
  mailbox: ReturnType<typeof exactLiveMailboxConnection>,
) {
  if (mailbox.state === "revocation_pending") {
    const revocation = snapshot.data() as StoredTokenRevocation | undefined;
    if (
      !snapshot.exists ||
      !revocation ||
      snapshot.id !== vendorRef ||
      revocation.vendorId !== vendorRef ||
      revocation.status !== "pending" ||
      revocation.tokenSecretRef !== mailbox.connection.tokenSecretRef ||
      !revocation.createdAt?.trim()
    ) {
      throw conflict("The Vendor mailbox revocation queue is not exact.");
    }
    return;
  }
  if (snapshot.exists) {
    throw conflict(
      "The Vendor mailbox revocation queue conflicts with the connection state.",
    );
  }
}

function boundedErrorCode(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,80}$/.test(normalized)
    ? normalized
    : "provider_outcome_ambiguous";
}

function conflict(message: string): LiveVendorLifecycleConflictError {
  return new LiveVendorLifecycleConflictError(message);
}

const LIVE_ACTION_KEYS = new Set<LiveVendorLifecycleActionKey>([
  "vendor.account.invite",
  "vendor.account.disable",
  "vendor.assignment.change",
]);

const PREPARED_VARIANTS = new Set<LiveVendorPreparedAttemptVariant>([
  "standard",
  "invite_correction",
  "setup_link_reissue",
  "disable_completion_recovery",
]);
