import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { getAdminFirestore } from "@/lib/firestore/admin";
import { resolveDataMode, type DataMode } from "@/lib/data-mode";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import type { VendorAssignmentAuthority } from "@/lib/vendor/assignment";
import type {
  VendorGmailAssignmentRepository,
  VendorGmailLaneContext,
  VendorGmailStateStore,
  VendorSendConfirmation,
} from "@/lib/vendor/gmail";
import type { VendorInviteStore } from "@/lib/vendor/invite";
import type { VendorLifecycleStore } from "@/lib/vendor/lifecycle";
import type {
  VendorBodylessAudit,
  VendorMailboxConnection,
  VendorRecord,
  VendorTicketProjection,
} from "@/lib/vendor/model";
import { vendorRecordDataMode } from "@/lib/vendor/model";
import type { VendorOAuthState, VendorOAuthStore } from "@/lib/vendor/oauth";
import {
  VENDOR_TEST_MAILBOX_MAX_MESSAGES,
  type VendorTestMailboxConfirmation,
  type VendorTestMailboxRecord,
  type VendorTestMailboxReplyCommitResult,
  type VendorTestMailboxStore,
} from "@/lib/vendor/test-mailbox";
/*
 * Reply confirmation and mailbox mutation intentionally share one Firestore
 * transaction below. Keeping the store boundary explicit prevents a caller
 * from reintroducing a claim-then-save lost-update window.
 */

export const VENDOR_COLLECTIONS = {
  vendors: "vendors",
  assignments: "vendor_ticket_assignments",
  threadLinks: "vendor_ticket_thread_links",
  oauthStates: "vendor_oauth_states",
  connections: "vendor_mailbox_connections",
  confirmations: "vendor_send_confirmations",
  audit: "vendor_audit",
  revocations: "vendor_token_revocation_queue",
  testMailboxes: "vendor_test_mailboxes",
  testMailboxConfirmations: "vendor_test_mailbox_confirmations",
} as const;

interface AssignmentRecord {
  ticket_id: string;
  vendor_id: string;
  active: boolean;
  data_mode?: DataMode;
}

interface ThreadLinkRecord extends AssignmentRecord {
  thread_id: string;
}

interface VendorAuthenticationResetRecord extends VendorRecord {
  authenticationReset?: {
    previewHash: string;
    inviteVersion: number;
    sourceUid: string;
    sourceStatus: VendorRecord["status"];
    sourceInviteVersion: number;
    status: "claimed" | "prepared" | "completed";
    claimId: string;
    claimExpiresAtMs: number;
  };
  setupLinkRegeneration?: {
    previewHash: string;
    uid: string;
    inviteVersion: number;
    status: "claimed" | "completed" | "superseded";
    claimId: string;
    claimExpiresAtMs: number;
  };
}

function authenticationResetIsInProgress(record: VendorAuthenticationResetRecord) {
  return (
    record.authenticationReset?.status === "claimed" ||
    record.authenticationReset?.status === "prepared"
  );
}

function vendorAuthorityMatches(
  record: VendorAuthenticationResetRecord,
  authority: VendorAssignmentAuthority,
) {
  return (
    record.id === authority.vendorId &&
    record.uid === authority.uid &&
    record.email.trim().toLowerCase() === authority.email.trim().toLowerCase() &&
    record.status === "active" &&
    vendorRecordDataMode(record) === authority.dataMode &&
    !authenticationResetIsInProgress(record)
  );
}

function ticketProjection(ticket: MaintenanceTicketRecord): VendorTicketProjection {
  return {
    id: ticket.id,
    status: ticket.status,
    priority: ticket.priority,
    summary: ticket.summary,
    unitLabel: ticket.unit?.label ?? null,
    updatedAt: ticket.updated_at,
    dataMode: resolveDataMode(ticket),
  };
}

export class FirestoreVendorStore
  implements
    VendorInviteStore,
    VendorOAuthStore,
    VendorGmailAssignmentRepository,
    VendorGmailStateStore,
    VendorLifecycleStore,
    VendorTestMailboxStore
{
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async findVendorByEmail(email: string): Promise<VendorRecord | null> {
    const result = await this.db
      .collection(VENDOR_COLLECTIONS.vendors)
      .where("email", "==", email)
      .limit(1)
      .get();
    const doc = result.docs[0];
    return doc ? (doc.data() as VendorRecord) : null;
  }

  async getVendorById(vendorId: string): Promise<VendorRecord | null> {
    const snapshot = await this.db
      .collection(VENDOR_COLLECTIONS.vendors)
      .doc(vendorId)
      .get();
    return snapshot.exists ? (snapshot.data() as VendorRecord) : null;
  }

  async listTestVendors(): Promise<VendorRecord[]> {
    const snapshot = await this.db
      .collection(VENDOR_COLLECTIONS.vendors)
      .where("data_mode", "==", "test")
      .get();
    return snapshot.docs
      .map((doc) => doc.data() as VendorRecord)
      .sort((left, right) => left.email.localeCompare(right.email));
  }

  async saveVendor(record: VendorRecord): Promise<void> {
    await this.db.collection(VENDOR_COLLECTIONS.vendors).doc(record.id).create(record);
  }

  async removeVendor(vendorId: string): Promise<void> {
    await this.db.collection(VENDOR_COLLECTIONS.vendors).doc(vendorId).delete();
  }

  async appendAudit(input: {
    actorUid: string;
    vendorId: string;
    action: string;
    reasonHash: string;
    createdAt: string;
  }): Promise<void> {
    const record: VendorBodylessAudit = {
      actorUid: input.actorUid,
      vendorId: input.vendorId,
      action: input.action,
      reasonHash: input.reasonHash,
      createdAt: input.createdAt,
    };
    await this.db.collection(VENDOR_COLLECTIONS.audit).doc(uuidv7()).create(record);
  }

  async claimVendorSetupLinkRegeneration(input: {
    actorUid: string;
    vendorId: string;
    expectedUid: string;
    expectedInviteVersion: number;
    expectedEmail: string;
    previewHash: string;
    reasonHash: string;
    claimId: string;
    nowMs: number;
    nowIso: string;
    claimExpiresAtMs: number;
  }): Promise<"claimed" | "busy"> {
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(vendorRef);
      if (!snapshot.exists) return "busy" as const;
      const record = snapshot.data() as VendorAuthenticationResetRecord;
      if (
        record.authenticationReset?.status === "claimed" ||
        record.authenticationReset?.status === "prepared"
      ) {
        return "busy" as const;
      }
      const priorClaim = record.setupLinkRegeneration;
      if (
        priorClaim?.status === "claimed" &&
        (!Number.isFinite(priorClaim.claimExpiresAtMs) ||
          priorClaim.claimExpiresAtMs > input.nowMs)
      ) {
        return "busy" as const;
      }
      if (
        record.id !== input.vendorId ||
        record.uid !== input.expectedUid ||
        record.status !== "pending_setup" ||
        record.inviteVersion !== input.expectedInviteVersion ||
        record.email.trim().toLowerCase() !== input.expectedEmail.trim().toLowerCase() ||
        vendorRecordDataMode(record) !== "test" ||
        input.previewHash.trim().length === 0 ||
        input.actorUid.trim().length === 0 ||
        input.reasonHash.trim().length === 0 ||
        input.nowIso.trim().length === 0 ||
        input.claimId.trim().length === 0 ||
        input.claimExpiresAtMs <= input.nowMs
      ) {
        return "busy" as const;
      }
      transaction.update(vendorRef, {
        setupLinkRegeneration: {
          previewHash: input.previewHash,
          uid: input.expectedUid,
          inviteVersion: input.expectedInviteVersion,
          status: "claimed",
          claimId: input.claimId,
          claimExpiresAtMs: input.claimExpiresAtMs,
        },
      });
      const audit: VendorBodylessAudit = {
        actorUid: input.actorUid,
        vendorId: input.vendorId,
        action: "test_vendor_setup_link_regeneration_claimed",
        reasonHash: input.reasonHash,
        createdAt: input.nowIso,
      };
      transaction.set(this.db.collection(VENDOR_COLLECTIONS.audit).doc(uuidv7()), audit);
      return "claimed" as const;
    });
  }

  async renewVendorSetupLinkRegenerationClaim(input: {
    vendorId: string;
    previewHash: string;
    claimId: string;
    nowMs: number;
    claimExpiresAtMs: number;
  }): Promise<boolean> {
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(vendorRef);
      if (!snapshot.exists) return false;
      const record = snapshot.data() as VendorAuthenticationResetRecord;
      const marker = record.setupLinkRegeneration;
      if (
        marker?.status !== "claimed" ||
        marker.previewHash !== input.previewHash ||
        marker.claimId !== input.claimId ||
        marker.claimExpiresAtMs <= input.nowMs ||
        input.claimExpiresAtMs <= input.nowMs
      ) {
        return false;
      }
      transaction.update(vendorRef, {
        setupLinkRegeneration: {
          ...marker,
          claimExpiresAtMs: input.claimExpiresAtMs,
        },
      });
      return true;
    });
  }

  async completeVendorSetupLinkRegeneration(input: {
    actorUid: string;
    vendorId: string;
    expectedUid: string;
    expectedInviteVersion: number;
    expectedEmail: string;
    previewHash: string;
    claimId: string;
    reasonHash: string;
    nowMs: number;
    nowIso: string;
  }): Promise<boolean> {
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(vendorRef);
      if (!snapshot.exists) return false;
      const record = snapshot.data() as VendorAuthenticationResetRecord;
      const marker = record.setupLinkRegeneration;
      if (
        record.id !== input.vendorId ||
        record.uid !== input.expectedUid ||
        record.status !== "pending_setup" ||
        record.inviteVersion !== input.expectedInviteVersion ||
        record.email.trim().toLowerCase() !== input.expectedEmail.trim().toLowerCase() ||
        vendorRecordDataMode(record) !== "test" ||
        marker?.status !== "claimed" ||
        marker.previewHash !== input.previewHash ||
        marker.uid !== input.expectedUid ||
        marker.inviteVersion !== input.expectedInviteVersion ||
        marker.claimId !== input.claimId ||
        marker.claimExpiresAtMs <= input.nowMs
      ) {
        return false;
      }
      transaction.update(vendorRef, {
        setupLinkRegeneration: {
          ...marker,
          status: "completed",
        },
      });
      const audit: VendorBodylessAudit = {
        actorUid: input.actorUid,
        vendorId: input.vendorId,
        action: "test_vendor_setup_link_regenerated",
        reasonHash: input.reasonHash,
        createdAt: input.nowIso,
      };
      transaction.set(this.db.collection(VENDOR_COLLECTIONS.audit).doc(uuidv7()), audit);
      return true;
    });
  }

  async releaseVendorSetupLinkRegenerationClaim(input: {
    vendorId: string;
    previewHash: string;
    claimId: string;
  }): Promise<boolean> {
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(vendorRef);
      if (!snapshot.exists) return false;
      const record = snapshot.data() as VendorAuthenticationResetRecord;
      const marker = record.setupLinkRegeneration;
      if (
        marker?.status !== "claimed" ||
        marker.previewHash !== input.previewHash ||
        marker.claimId !== input.claimId
      ) {
        return false;
      }
      transaction.update(vendorRef, {
        setupLinkRegeneration: FieldValue.delete(),
      });
      return true;
    });
  }

  async claimVendorAuthenticationReset(input: {
    actorUid: string;
    vendorId: string;
    expectedUid: string;
    expectedStatus: VendorRecord["status"];
    expectedInviteVersion: number;
    expectedEmail: string;
    previewHash: string;
    reasonHash: string;
    claimId: string;
    nowMs: number;
    nowIso: string;
    claimExpiresAtMs: number;
  }): Promise<
    | {
        outcome: "claimed";
        record: VendorAuthenticationResetRecord;
        recoveredExpiredClaim: boolean;
      }
    | { outcome: "busy" | "completed" }
  > {
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(vendorRef);
      if (!snapshot.exists) return { outcome: "busy" as const };
      const record = snapshot.data() as VendorAuthenticationResetRecord;
      const setupLinkClaim = record.setupLinkRegeneration;
      const supersedeExpiredSetupLinkClaim =
        setupLinkClaim?.status === "claimed" &&
        Number.isFinite(setupLinkClaim.claimExpiresAtMs) &&
        setupLinkClaim.claimExpiresAtMs <= input.nowMs;
      if (setupLinkClaim?.status === "claimed" && !supersedeExpiredSetupLinkClaim) {
        return { outcome: "busy" as const };
      }
      const setupLinkClaimUpdate = supersedeExpiredSetupLinkClaim
        ? {
            setupLinkRegeneration: {
              ...setupLinkClaim,
              status: "superseded" as const,
            },
          }
        : {};
      const marker = record.authenticationReset;
      const immutableSourceMatches =
        marker !== undefined &&
        marker.sourceUid === input.expectedUid &&
        marker.sourceStatus === input.expectedStatus &&
        marker.sourceInviteVersion === input.expectedInviteVersion;
      const exactSourceMatches =
        immutableSourceMatches && marker?.previewHash === input.previewHash;

      if (marker?.status === "completed" && exactSourceMatches) {
        return { outcome: "completed" as const };
      }
      if (marker?.status === "claimed" || marker?.status === "prepared") {
        if (
          !immutableSourceMatches ||
          marker.claimExpiresAtMs > input.nowMs ||
          input.actorUid.trim().length === 0 ||
          input.reasonHash.trim().length === 0 ||
          input.nowIso.trim().length === 0 ||
          input.claimId.trim().length === 0 ||
          input.claimExpiresAtMs <= input.nowMs
        ) {
          return { outcome: "busy" as const };
        }
        const authenticationReset = {
          ...marker,
          previewHash: input.previewHash,
          claimId: input.claimId,
          claimExpiresAtMs: input.claimExpiresAtMs,
        };
        transaction.update(vendorRef, {
          authenticationReset,
          ...setupLinkClaimUpdate,
        });
        const audit: VendorBodylessAudit = {
          actorUid: input.actorUid,
          vendorId: input.vendorId,
          action: "test_vendor_authentication_reset_recovery_claimed",
          reasonHash: input.reasonHash,
          createdAt: input.nowIso,
        };
        transaction.set(
          this.db.collection(VENDOR_COLLECTIONS.audit).doc(uuidv7()),
          audit,
        );
        return {
          outcome: "claimed" as const,
          record: { ...record, authenticationReset, ...setupLinkClaimUpdate },
          recoveredExpiredClaim: true,
        };
      }

      if (
        record.id !== input.vendorId ||
        record.uid !== input.expectedUid ||
        record.status !== input.expectedStatus ||
        record.inviteVersion !== input.expectedInviteVersion ||
        record.email.trim().toLowerCase() !== input.expectedEmail.trim().toLowerCase() ||
        vendorRecordDataMode(record) !== "test" ||
        input.previewHash.trim().length === 0 ||
        input.actorUid.trim().length === 0 ||
        input.reasonHash.trim().length === 0 ||
        input.nowIso.trim().length === 0 ||
        input.claimId.trim().length === 0 ||
        input.claimExpiresAtMs <= input.nowMs
      ) {
        return { outcome: "busy" as const };
      }
      const authenticationReset: NonNullable<
        VendorAuthenticationResetRecord["authenticationReset"]
      > = {
        previewHash: input.previewHash,
        inviteVersion: record.inviteVersion,
        sourceUid: input.expectedUid,
        sourceStatus: input.expectedStatus,
        sourceInviteVersion: input.expectedInviteVersion,
        status: "claimed",
        claimId: input.claimId,
        claimExpiresAtMs: input.claimExpiresAtMs,
      };
      transaction.update(vendorRef, {
        authenticationReset,
        ...setupLinkClaimUpdate,
      });
      const audit: VendorBodylessAudit = {
        actorUid: input.actorUid,
        vendorId: input.vendorId,
        action: "test_vendor_authentication_reset_claimed",
        reasonHash: input.reasonHash,
        createdAt: input.nowIso,
      };
      transaction.set(this.db.collection(VENDOR_COLLECTIONS.audit).doc(uuidv7()), audit);
      return {
        outcome: "claimed" as const,
        record: { ...record, authenticationReset, ...setupLinkClaimUpdate },
        recoveredExpiredClaim: false,
      };
    });
  }

  async renewVendorAuthenticationResetClaim(input: {
    vendorId: string;
    previewHash: string;
    claimId: string;
    nowMs: number;
    claimExpiresAtMs: number;
  }): Promise<boolean> {
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(vendorRef);
      if (!snapshot.exists) return false;
      const record = snapshot.data() as VendorAuthenticationResetRecord;
      const marker = record.authenticationReset;
      if (
        (marker?.status !== "claimed" && marker?.status !== "prepared") ||
        marker.previewHash !== input.previewHash ||
        marker.claimId !== input.claimId ||
        marker.claimExpiresAtMs <= input.nowMs ||
        input.claimExpiresAtMs <= input.nowMs
      ) {
        return false;
      }
      transaction.update(vendorRef, {
        authenticationReset: {
          ...marker,
          claimExpiresAtMs: input.claimExpiresAtMs,
        },
      });
      return true;
    });
  }

  async resetVendorAuthentication(input: {
    actorUid: string;
    vendorId: string;
    expectedUid: string;
    expectedStatus: VendorRecord["status"];
    expectedInviteVersion: number;
    replacementUid: string;
    expectedEmail: string;
    previewHash: string;
    claimId: string;
    reasonHash: string;
    nowMs: number;
    nowIso: string;
  }): Promise<VendorRecord | null> {
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(vendorRef);
      if (!snapshot.exists) return null;
      const record = snapshot.data() as VendorAuthenticationResetRecord;
      const normalizedExpectedEmail = input.expectedEmail.trim().toLowerCase();
      if (
        record.id !== input.vendorId ||
        record.email.trim().toLowerCase() !== normalizedExpectedEmail ||
        vendorRecordDataMode(record) !== "test" ||
        !["pending_setup", "active", "disabled"].includes(record.status) ||
        !Number.isSafeInteger(record.inviteVersion) ||
        record.inviteVersion < 0
      ) {
        return null;
      }

      const priorReset = record.authenticationReset;
      if (
        record.status === "pending_setup" &&
        priorReset?.previewHash === input.previewHash &&
        priorReset.inviteVersion === record.inviteVersion &&
        priorReset.sourceUid === input.expectedUid &&
        priorReset.sourceStatus === input.expectedStatus &&
        priorReset.sourceInviteVersion === input.expectedInviteVersion &&
        priorReset.status === "prepared" &&
        priorReset.claimId === input.claimId &&
        priorReset.claimExpiresAtMs > input.nowMs &&
        input.replacementUid.trim().length > 0 &&
        input.replacementUid !== input.expectedUid
      ) {
        // A prior attempt already committed the reset and its audit atomically.
        // A disabled, claims-validated replacement may itself have been
        // compensated during a concurrent retry. Swapping only the staged UID
        // repairs that partial failure without a second audit or increment.
        if (record.uid !== input.replacementUid) {
          transaction.update(vendorRef, { uid: input.replacementUid });
        }
        return { ...record, uid: input.replacementUid };
      }

      if (
        priorReset?.status !== "claimed" ||
        priorReset.previewHash !== input.previewHash ||
        priorReset.sourceUid !== input.expectedUid ||
        priorReset.sourceStatus !== input.expectedStatus ||
        priorReset.sourceInviteVersion !== input.expectedInviteVersion ||
        priorReset.claimId !== input.claimId ||
        priorReset.claimExpiresAtMs <= input.nowMs ||
        record.uid !== input.expectedUid ||
        record.status !== input.expectedStatus ||
        record.inviteVersion !== input.expectedInviteVersion ||
        input.replacementUid.trim().length === 0 ||
        input.replacementUid === input.expectedUid
      ) {
        return null;
      }

      const inviteVersion = record.inviteVersion + 1;
      if (!Number.isSafeInteger(inviteVersion)) return null;
      const resetRecord: VendorRecord = {
        ...record,
        uid: input.replacementUid,
        status: "pending_setup",
        inviteVersion,
        identityState: {
          emailVerified: true,
          totpRequired: true,
          totpVerified: false,
        },
        updatedAt: input.nowIso,
      };
      delete resetRecord.activatedAt;
      delete resetRecord.disabledAt;

      transaction.update(vendorRef, {
        uid: input.replacementUid,
        status: resetRecord.status,
        inviteVersion,
        identityState: resetRecord.identityState,
        updatedAt: input.nowIso,
        activatedAt: FieldValue.delete(),
        disabledAt: FieldValue.delete(),
        authenticationReset: {
          previewHash: input.previewHash,
          inviteVersion,
          sourceUid: input.expectedUid,
          sourceStatus: input.expectedStatus,
          sourceInviteVersion: input.expectedInviteVersion,
          status: "prepared",
          claimId: input.claimId,
          claimExpiresAtMs: priorReset.claimExpiresAtMs,
        },
      });
      const audit: VendorBodylessAudit = {
        actorUid: input.actorUid,
        vendorId: input.vendorId,
        action: "test_vendor_authentication_reset",
        reasonHash: input.reasonHash,
        createdAt: input.nowIso,
      };
      const auditRef = this.db.collection(VENDOR_COLLECTIONS.audit).doc(uuidv7());
      transaction.set(auditRef, audit);
      return resetRecord;
    });
  }

  async completeVendorAuthenticationReset(input: {
    vendorId: string;
    replacementUid: string;
    previewHash: string;
    claimId: string;
    nowMs: number;
  }): Promise<VendorRecord | null> {
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(vendorRef);
      if (!snapshot.exists) return null;
      const record = snapshot.data() as VendorAuthenticationResetRecord;
      const marker = record.authenticationReset;
      if (
        record.id !== input.vendorId ||
        record.uid !== input.replacementUid ||
        record.status !== "pending_setup" ||
        vendorRecordDataMode(record) !== "test" ||
        marker?.previewHash !== input.previewHash ||
        marker.inviteVersion !== record.inviteVersion ||
        marker.status !== "prepared" ||
        marker.claimId !== input.claimId ||
        marker.claimExpiresAtMs <= input.nowMs
      ) {
        return null;
      }
      transaction.update(vendorRef, {
        authenticationReset: {
          ...marker,
          status: "completed",
        },
      });
      return record;
    });
  }

  async activateVendor(
    vendorId: string,
    uid: string,
    email: string,
    nowIso: string,
    dataMode: DataMode = "live",
  ) {
    const ref = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(vendorId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const record = snapshot.data() as VendorAuthenticationResetRecord;
      if (
        record.authenticationReset?.status === "claimed" ||
        record.authenticationReset?.status === "prepared" ||
        record.setupLinkRegeneration?.status === "claimed"
      ) {
        return false;
      }
      if (
        record.uid !== uid ||
        record.email.trim().toLowerCase() !== email.trim().toLowerCase() ||
        vendorRecordDataMode(record) !== dataMode ||
        record.status === "disabled"
      ) {
        return false;
      }
      if (record.status !== "active") {
        transaction.update(ref, {
          status: "active",
          updatedAt: nowIso,
          activatedAt: nowIso,
          identityState: {
            emailVerified: true,
            totpRequired: true,
            totpVerified: true,
          },
        });
      }
      return true;
    });
  }

  async isVendorActive(
    vendorId: string,
    uid: string,
    email: string,
    dataMode?: DataMode,
  ): Promise<boolean> {
    const snapshot = await this.db
      .collection(VENDOR_COLLECTIONS.vendors)
      .doc(vendorId)
      .get();
    if (!snapshot.exists) return false;
    const record = snapshot.data() as VendorAuthenticationResetRecord;
    return (
      record.uid === uid &&
      record.email.trim().toLowerCase() === email.trim().toLowerCase() &&
      (dataMode === undefined || vendorRecordDataMode(record) === dataMode) &&
      record.status === "active" &&
      !authenticationResetIsInProgress(record)
    );
  }

  async listAssignedTickets(
    authority: VendorAssignmentAuthority,
  ): Promise<VendorTicketProjection[]> {
    const vendorRef = this.db
      .collection(VENDOR_COLLECTIONS.vendors)
      .doc(authority.vendorId);
    const assignmentQuery = this.db
      .collection(VENDOR_COLLECTIONS.assignments)
      .where("vendor_id", "==", authority.vendorId);
    return this.db.runTransaction(async (transaction) => {
      const [vendorSnapshot, assignments] = await Promise.all([
        transaction.get(vendorRef),
        transaction.get(assignmentQuery),
      ]);
      if (!vendorSnapshot.exists) return [];
      const vendor = vendorSnapshot.data() as VendorAuthenticationResetRecord;
      if (!vendorAuthorityMatches(vendor, authority)) return [];
      const matchingAssignments = assignments.docs
        .map((doc) => doc.data() as AssignmentRecord)
        .filter(
          (assignment) =>
            assignment.active &&
            assignment.vendor_id === authority.vendorId &&
            resolveDataMode(assignment) === authority.dataMode,
        );
      const ticketSnapshots = await Promise.all(
        matchingAssignments.map((assignment) =>
          transaction.get(
            this.db.collection("maintenance_tickets").doc(assignment.ticket_id),
          ),
        ),
      );
      return ticketSnapshots
        .map((snapshot) => {
          if (!snapshot.exists) return null;
          const ticket = snapshot.data() as MaintenanceTicketRecord;
          return resolveDataMode(ticket) === authority.dataMode
            ? ticketProjection(ticket)
            : null;
        })
        .filter((ticket): ticket is VendorTicketProjection => ticket !== null)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    });
  }

  async getAssignedTicket(
    authority: VendorAssignmentAuthority & { ticketId: string },
  ): Promise<VendorTicketProjection | null> {
    const vendorRef = this.db
      .collection(VENDOR_COLLECTIONS.vendors)
      .doc(authority.vendorId);
    const assignmentRef = this.db
      .collection(VENDOR_COLLECTIONS.assignments)
      .doc(authority.ticketId);
    const ticketRef = this.db.collection("maintenance_tickets").doc(authority.ticketId);
    return this.db.runTransaction(async (transaction) => {
      const [vendorSnapshot, assignmentSnapshot, ticketSnapshot] = await Promise.all([
        transaction.get(vendorRef),
        transaction.get(assignmentRef),
        transaction.get(ticketRef),
      ]);
      if (
        !vendorSnapshot.exists ||
        !assignmentSnapshot.exists ||
        !ticketSnapshot.exists
      ) {
        return null;
      }
      const vendor = vendorSnapshot.data() as VendorAuthenticationResetRecord;
      const assignment = assignmentSnapshot.data() as AssignmentRecord;
      const ticket = ticketSnapshot.data() as MaintenanceTicketRecord;
      if (
        !vendorAuthorityMatches(vendor, authority) ||
        !assignment.active ||
        assignment.vendor_id !== authority.vendorId ||
        assignment.ticket_id !== authority.ticketId ||
        resolveDataMode(assignment) !== authority.dataMode ||
        ticket.id !== authority.ticketId ||
        resolveDataMode(ticket) !== authority.dataMode
      ) {
        return null;
      }
      return ticketProjection(ticket);
    });
  }

  async isThreadLinked(
    input: VendorAssignmentAuthority & {
      ticketId: string;
      threadId: string;
    },
  ): Promise<boolean> {
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    const assignmentRef = this.db
      .collection(VENDOR_COLLECTIONS.assignments)
      .doc(input.ticketId);
    const ticketRef = this.db.collection("maintenance_tickets").doc(input.ticketId);
    const threadRef = this.db
      .collection(VENDOR_COLLECTIONS.threadLinks)
      .doc(`${input.vendorId}:${input.ticketId}:${input.threadId}`);
    return this.db.runTransaction(async (transaction) => {
      const [vendorSnapshot, assignmentSnapshot, ticketSnapshot, threadSnapshot] =
        await Promise.all([
          transaction.get(vendorRef),
          transaction.get(assignmentRef),
          transaction.get(ticketRef),
          transaction.get(threadRef),
        ]);
      if (
        !vendorSnapshot.exists ||
        !assignmentSnapshot.exists ||
        !ticketSnapshot.exists ||
        !threadSnapshot.exists
      ) {
        return false;
      }
      const vendor = vendorSnapshot.data() as VendorAuthenticationResetRecord;
      const assignment = assignmentSnapshot.data() as AssignmentRecord;
      const ticket = ticketSnapshot.data() as MaintenanceTicketRecord;
      const thread = threadSnapshot.data() as ThreadLinkRecord;
      return (
        vendorAuthorityMatches(vendor, input) &&
        assignment.active &&
        assignment.vendor_id === input.vendorId &&
        assignment.ticket_id === input.ticketId &&
        resolveDataMode(assignment) === input.dataMode &&
        ticket.id === input.ticketId &&
        resolveDataMode(ticket) === input.dataMode &&
        thread.active &&
        thread.vendor_id === input.vendorId &&
        thread.ticket_id === input.ticketId &&
        thread.thread_id === input.threadId &&
        resolveDataMode(thread) === input.dataMode
      );
    });
  }

  async getGmailLaneContext(input: {
    vendorId: string;
    ticketId: string;
    threadId: string;
    actorUid: string;
    actorEmail: string;
    actorDataMode: DataMode;
    actorIsAdmin: boolean;
  }): Promise<VendorGmailLaneContext | null> {
    const threadLinkId = `${input.vendorId}:${input.ticketId}:${input.threadId}`;
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    const assignmentRef = this.db
      .collection(VENDOR_COLLECTIONS.assignments)
      .doc(input.ticketId);
    const ticketRef = this.db.collection("maintenance_tickets").doc(input.ticketId);
    const threadRef = this.db
      .collection(VENDOR_COLLECTIONS.threadLinks)
      .doc(threadLinkId);
    return this.db.runTransaction(async (transaction) => {
      const [vendorSnapshot, assignmentSnapshot, ticketSnapshot, threadSnapshot] =
        await Promise.all([
          transaction.get(vendorRef),
          transaction.get(assignmentRef),
          transaction.get(ticketRef),
          transaction.get(threadRef),
        ]);
      if (
        !vendorSnapshot.exists ||
        !assignmentSnapshot.exists ||
        !ticketSnapshot.exists ||
        !threadSnapshot.exists
      ) {
        return null;
      }
      const vendor = vendorSnapshot.data() as VendorAuthenticationResetRecord;
      const assignment = assignmentSnapshot.data() as AssignmentRecord;
      const ticket = ticketSnapshot.data() as MaintenanceTicketRecord;
      const thread = threadSnapshot.data() as ThreadLinkRecord;
      const vendorMode = vendorRecordDataMode(vendor);
      if (
        vendor.id !== input.vendorId ||
        vendor.status !== "active" ||
        authenticationResetIsInProgress(vendor) ||
        vendorMode !== input.actorDataMode ||
        (!input.actorIsAdmin &&
          (vendor.uid !== input.actorUid ||
            vendor.email.trim().toLowerCase() !==
              input.actorEmail.trim().toLowerCase())) ||
        !assignment.active ||
        assignment.vendor_id !== input.vendorId ||
        assignment.ticket_id !== input.ticketId ||
        resolveDataMode(assignment) !== vendorMode ||
        ticket.id !== input.ticketId ||
        resolveDataMode(ticket) !== vendorMode ||
        !thread.active ||
        thread.vendor_id !== input.vendorId ||
        thread.ticket_id !== input.ticketId ||
        thread.thread_id !== input.threadId ||
        resolveDataMode(thread) !== vendorMode
      ) {
        return null;
      }
      return {
        vendor: vendorMode,
        assignment: resolveDataMode(assignment),
        ticket: resolveDataMode(ticket),
        thread: resolveDataMode(thread),
      };
    });
  }

  async saveState(state: VendorOAuthState): Promise<void> {
    await this.db
      .collection(VENDOR_COLLECTIONS.oauthStates)
      .doc(state.stateHash)
      .create(state);
  }

  async claimState(stateHash: string, nowMs: number): Promise<VendorOAuthState | null> {
    const ref = this.db.collection(VENDOR_COLLECTIONS.oauthStates).doc(stateHash);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const state = snapshot.data() as VendorOAuthState;
      if (state.usedAtMs || state.expiresAtMs <= nowMs) return null;
      transaction.update(ref, { usedAtMs: nowMs, pkceVerifier: "consumed" });
      return state;
    });
  }

  async saveConnection(connection: VendorMailboxConnection): Promise<void> {
    await this.db
      .collection(VENDOR_COLLECTIONS.connections)
      .doc(connection.vendorId)
      .set(connection);
  }

  async getConnection(vendorId: string): Promise<VendorMailboxConnection | null> {
    const snapshot = await this.db
      .collection(VENDOR_COLLECTIONS.connections)
      .doc(vendorId)
      .get();
    return snapshot.exists ? (snapshot.data() as VendorMailboxConnection) : null;
  }

  async createConfirmation(record: VendorSendConfirmation): Promise<void> {
    await this.db
      .collection(VENDOR_COLLECTIONS.confirmations)
      .doc(record.id)
      .create(record);
  }

  async claimConfirmation(input: {
    id: string;
    actorUid: string;
    payloadHash: string;
    nowMs: number;
  }): Promise<"claimed" | "expired" | "mismatch" | "duplicate" | "ambiguous"> {
    const ref = this.db.collection(VENDOR_COLLECTIONS.confirmations).doc(input.id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return "mismatch" as const;
      const record = snapshot.data() as VendorSendConfirmation;
      if (
        record.actorUid !== input.actorUid ||
        record.payloadHash !== input.payloadHash
      ) {
        return "mismatch" as const;
      }
      if (record.state === "sent") return "duplicate" as const;
      if (record.state === "ambiguous") return "ambiguous" as const;
      if (record.state !== "pending") return "mismatch" as const;
      if (record.expiresAtMs <= input.nowMs) return "expired" as const;
      transaction.update(ref, { state: "sending" });
      return "claimed" as const;
    });
  }

  async markConfirmation(input: {
    id: string;
    state: "sent" | "ambiguous" | "failed";
    result?: { messageId: string; threadId: string };
  }): Promise<void> {
    await this.db
      .collection(VENDOR_COLLECTIONS.confirmations)
      .doc(input.id)
      .update({ state: input.state, ...(input.result ? { result: input.result } : {}) });
  }

  async disableVendor(input: {
    vendorId: string;
    expectedUid: string;
    nowIso: string;
  }): Promise<"disabled" | "already_disabled" | "reset_in_progress" | "stale"> {
    const ref = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return "already_disabled" as const;
      const record = snapshot.data() as VendorAuthenticationResetRecord;
      if (
        record.authenticationReset?.status === "claimed" ||
        record.authenticationReset?.status === "prepared" ||
        record.setupLinkRegeneration?.status === "claimed"
      ) {
        return "reset_in_progress" as const;
      }
      if (record.uid !== input.expectedUid) return "stale" as const;
      if (record.status === "disabled") return "already_disabled" as const;
      transaction.update(ref, {
        status: "disabled",
        disabledAt: input.nowIso,
        updatedAt: input.nowIso,
      });
      return "disabled" as const;
    });
  }

  async markConnectionRevocationPending(vendorId: string, nowIso: string): Promise<void> {
    await this.db.collection(VENDOR_COLLECTIONS.connections).doc(vendorId).update({
      status: "revocation_pending",
      updatedAt: nowIso,
    });
  }

  async enqueueTokenRevocation(input: { vendorId: string; tokenSecretRef: string }) {
    await this.db.collection(VENDOR_COLLECTIONS.revocations).doc(input.vendorId).set({
      vendorId: input.vendorId,
      tokenSecretRef: input.tokenSecretRef,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  }

  async getTestMailbox(input: {
    actorUid: string;
    vendorId: string;
    ticketId: string;
  }): Promise<VendorTestMailboxRecord | null> {
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    const assignmentRef = this.db
      .collection(VENDOR_COLLECTIONS.assignments)
      .doc(input.ticketId);
    const ticketRef = this.db.collection("maintenance_tickets").doc(input.ticketId);
    const mailboxRef = this.db
      .collection(VENDOR_COLLECTIONS.testMailboxes)
      .doc(`${input.vendorId}:${input.ticketId}`);
    return this.db.runTransaction(async (transaction) => {
      const [vendorSnapshot, assignmentSnapshot, ticketSnapshot, mailboxSnapshot] =
        await Promise.all([
          transaction.get(vendorRef),
          transaction.get(assignmentRef),
          transaction.get(ticketRef),
          transaction.get(mailboxRef),
        ]);
      if (
        !vendorSnapshot.exists ||
        !assignmentSnapshot.exists ||
        !ticketSnapshot.exists ||
        !mailboxSnapshot.exists
      ) {
        return null;
      }
      const vendor = vendorSnapshot.data() as VendorAuthenticationResetRecord;
      const assignment = assignmentSnapshot.data() as AssignmentRecord;
      const ticket = ticketSnapshot.data() as MaintenanceTicketRecord;
      const mailbox = mailboxSnapshot.data() as VendorTestMailboxRecord;
      if (
        vendor.id !== input.vendorId ||
        vendor.uid !== input.actorUid ||
        vendor.status !== "active" ||
        vendorRecordDataMode(vendor) !== "test" ||
        authenticationResetIsInProgress(vendor) ||
        !assignment.active ||
        assignment.vendor_id !== input.vendorId ||
        assignment.ticket_id !== input.ticketId ||
        resolveDataMode(assignment) !== "test" ||
        ticket.id !== input.ticketId ||
        resolveDataMode(ticket) !== "test" ||
        mailbox.id !== `${input.vendorId}:${input.ticketId}` ||
        mailbox.vendorId !== input.vendorId ||
        mailbox.ticketId !== input.ticketId ||
        mailbox.data_mode !== "test" ||
        mailbox.liveEvidenceEligible !== false ||
        typeof mailbox.threadId !== "string" ||
        mailbox.threadId.trim().length === 0 ||
        mailbox.threadId.includes("/")
      ) {
        return null;
      }
      const threadSnapshot = await transaction.get(
        this.db
          .collection(VENDOR_COLLECTIONS.threadLinks)
          .doc(`${input.vendorId}:${input.ticketId}:${mailbox.threadId}`),
      );
      if (!threadSnapshot.exists) return null;
      const thread = threadSnapshot.data() as ThreadLinkRecord;
      return thread.active &&
        thread.vendor_id === input.vendorId &&
        thread.ticket_id === input.ticketId &&
        thread.thread_id === mailbox.threadId &&
        resolveDataMode(thread) === "test"
        ? mailbox
        : null;
    });
  }

  async saveTestMailbox(input: {
    actorUid: string;
    record: VendorTestMailboxRecord;
    expectedUpdatedAt: string | null;
  }): Promise<VendorTestMailboxRecord | null> {
    const record = input.record;
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(record.vendorId);
    const assignmentRef = this.db
      .collection(VENDOR_COLLECTIONS.assignments)
      .doc(record.ticketId);
    const ticketRef = this.db.collection("maintenance_tickets").doc(record.ticketId);
    const threadRef = this.db
      .collection(VENDOR_COLLECTIONS.threadLinks)
      .doc(`${record.vendorId}:${record.ticketId}:${record.threadId}`);
    const mailboxRef = this.db
      .collection(VENDOR_COLLECTIONS.testMailboxes)
      .doc(`${record.vendorId}:${record.ticketId}`);
    return this.db.runTransaction(async (transaction) => {
      const [
        vendorSnapshot,
        assignmentSnapshot,
        ticketSnapshot,
        threadSnapshot,
        mailboxSnapshot,
      ] = await Promise.all([
        transaction.get(vendorRef),
        transaction.get(assignmentRef),
        transaction.get(ticketRef),
        transaction.get(threadRef),
        transaction.get(mailboxRef),
      ]);
      if (
        !vendorSnapshot.exists ||
        !assignmentSnapshot.exists ||
        !ticketSnapshot.exists
      ) {
        return null;
      }
      const vendor = vendorSnapshot.data() as VendorAuthenticationResetRecord;
      const assignment = assignmentSnapshot.data() as AssignmentRecord;
      const ticket = ticketSnapshot.data() as MaintenanceTicketRecord;
      const thread = threadSnapshot.exists
        ? (threadSnapshot.data() as ThreadLinkRecord)
        : null;
      const current = mailboxSnapshot.exists
        ? (mailboxSnapshot.data() as VendorTestMailboxRecord)
        : null;
      const baseJoinIsValid =
        vendor.id === record.vendorId &&
        vendor.uid === input.actorUid &&
        vendor.status === "active" &&
        vendorRecordDataMode(vendor) === "test" &&
        vendor.authenticationReset?.status !== "claimed" &&
        vendor.authenticationReset?.status !== "prepared" &&
        assignment.active === true &&
        assignment.vendor_id === record.vendorId &&
        assignment.ticket_id === record.ticketId &&
        resolveDataMode(assignment) === "test" &&
        ticket.id === record.ticketId &&
        resolveDataMode(ticket) === "test" &&
        record.id === `${record.vendorId}:${record.ticketId}` &&
        record.data_mode === "test" &&
        record.liveEvidenceEligible === false;
      if (!baseJoinIsValid) return null;

      if (current) {
        if (
          !thread ||
          !thread.active ||
          thread.vendor_id !== record.vendorId ||
          thread.ticket_id !== record.ticketId ||
          thread.thread_id !== record.threadId ||
          resolveDataMode(thread) !== "test" ||
          current.id !== record.id ||
          current.vendorId !== record.vendorId ||
          current.ticketId !== record.ticketId ||
          current.threadId !== record.threadId ||
          current.data_mode !== "test" ||
          current.liveEvidenceEligible !== false ||
          input.expectedUpdatedAt !== current.updatedAt
        ) {
          return null;
        }
      } else {
        if (input.expectedUpdatedAt !== null) return null;
        if (
          thread &&
          (!thread.active ||
            thread.vendor_id !== record.vendorId ||
            thread.ticket_id !== record.ticketId ||
            thread.thread_id !== record.threadId ||
            resolveDataMode(thread) !== "test")
        ) {
          return null;
        }
        if (!thread) {
          transaction.set(threadRef, {
            vendor_id: record.vendorId,
            ticket_id: record.ticketId,
            thread_id: record.threadId,
            active: true,
            data_mode: "test",
          });
        }
      }
      transaction.set(mailboxRef, record);
      return record;
    });
  }

  async createTestMailboxConfirmation(
    record: VendorTestMailboxConfirmation,
  ): Promise<boolean> {
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(record.vendorId);
    const assignmentRef = this.db
      .collection(VENDOR_COLLECTIONS.assignments)
      .doc(record.ticketId);
    const ticketRef = this.db.collection("maintenance_tickets").doc(record.ticketId);
    const threadRef = this.db
      .collection(VENDOR_COLLECTIONS.threadLinks)
      .doc(`${record.vendorId}:${record.ticketId}:${record.threadId}`);
    const mailboxRef = this.db
      .collection(VENDOR_COLLECTIONS.testMailboxes)
      .doc(`${record.vendorId}:${record.ticketId}`);
    const confirmationRef = this.db
      .collection(VENDOR_COLLECTIONS.testMailboxConfirmations)
      .doc(record.id);
    return this.db.runTransaction(async (transaction) => {
      const [
        vendorSnapshot,
        assignmentSnapshot,
        ticketSnapshot,
        threadSnapshot,
        mailboxSnapshot,
        confirmationSnapshot,
      ] = await Promise.all([
        transaction.get(vendorRef),
        transaction.get(assignmentRef),
        transaction.get(ticketRef),
        transaction.get(threadRef),
        transaction.get(mailboxRef),
        transaction.get(confirmationRef),
      ]);
      if (
        !vendorSnapshot.exists ||
        !assignmentSnapshot.exists ||
        !ticketSnapshot.exists ||
        !threadSnapshot.exists ||
        !mailboxSnapshot.exists ||
        confirmationSnapshot.exists
      ) {
        return false;
      }
      const vendor = vendorSnapshot.data() as VendorAuthenticationResetRecord;
      const assignment = assignmentSnapshot.data() as AssignmentRecord;
      const ticket = ticketSnapshot.data() as MaintenanceTicketRecord;
      const thread = threadSnapshot.data() as ThreadLinkRecord;
      const mailbox = mailboxSnapshot.data() as VendorTestMailboxRecord;
      if (
        vendor.id !== record.vendorId ||
        vendor.uid !== record.actorUid ||
        vendor.status !== "active" ||
        vendorRecordDataMode(vendor) !== "test" ||
        vendor.authenticationReset?.status === "claimed" ||
        vendor.authenticationReset?.status === "prepared" ||
        !assignment.active ||
        assignment.vendor_id !== record.vendorId ||
        assignment.ticket_id !== record.ticketId ||
        resolveDataMode(assignment) !== "test" ||
        ticket.id !== record.ticketId ||
        resolveDataMode(ticket) !== "test" ||
        !thread.active ||
        thread.vendor_id !== record.vendorId ||
        thread.ticket_id !== record.ticketId ||
        thread.thread_id !== record.threadId ||
        resolveDataMode(thread) !== "test" ||
        mailbox.id !== `${record.vendorId}:${record.ticketId}` ||
        mailbox.vendorId !== record.vendorId ||
        mailbox.ticketId !== record.ticketId ||
        mailbox.threadId !== record.threadId ||
        mailbox.data_mode !== "test" ||
        mailbox.liveEvidenceEligible !== false ||
        record.data_mode !== "test" ||
        record.liveEvidenceEligible !== false
      ) {
        return false;
      }
      transaction.set(confirmationRef, record);
      return true;
    });
  }

  async commitTestMailboxReply(input: {
    confirmationId: string;
    actorUid: string;
    vendorId: string;
    ticketId: string;
    threadId: string;
    payloadHash: string;
    messageId: string;
    body: string;
    nowMs: number;
    nowIso: string;
  }): Promise<VendorTestMailboxReplyCommitResult> {
    const confirmationRef = this.db
      .collection(VENDOR_COLLECTIONS.testMailboxConfirmations)
      .doc(input.confirmationId);
    const mailboxRef = this.db
      .collection(VENDOR_COLLECTIONS.testMailboxes)
      .doc(`${input.vendorId}:${input.ticketId}`);
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    const assignmentRef = this.db
      .collection(VENDOR_COLLECTIONS.assignments)
      .doc(input.ticketId);
    const ticketRef = this.db.collection("maintenance_tickets").doc(input.ticketId);
    const threadRef = this.db
      .collection(VENDOR_COLLECTIONS.threadLinks)
      .doc(`${input.vendorId}:${input.ticketId}:${input.threadId}`);
    return this.db.runTransaction(async (transaction) => {
      const [
        confirmationSnapshot,
        mailboxSnapshot,
        vendorSnapshot,
        assignmentSnapshot,
        ticketSnapshot,
        threadSnapshot,
      ] = await Promise.all([
        transaction.get(confirmationRef),
        transaction.get(mailboxRef),
        transaction.get(vendorRef),
        transaction.get(assignmentRef),
        transaction.get(ticketRef),
        transaction.get(threadRef),
      ]);
      if (
        !confirmationSnapshot.exists ||
        !mailboxSnapshot.exists ||
        !vendorSnapshot.exists ||
        !assignmentSnapshot.exists ||
        !ticketSnapshot.exists ||
        !threadSnapshot.exists
      ) {
        return { outcome: "mismatch" } as const;
      }
      const confirmation = confirmationSnapshot.data() as VendorTestMailboxConfirmation;
      const mailbox = mailboxSnapshot.data() as VendorTestMailboxRecord;
      const vendor = vendorSnapshot.data() as VendorAuthenticationResetRecord;
      const assignment = assignmentSnapshot.data() as AssignmentRecord;
      const ticket = ticketSnapshot.data() as MaintenanceTicketRecord;
      const thread = threadSnapshot.data() as ThreadLinkRecord;
      if (
        vendor.id !== input.vendorId ||
        vendor.uid !== input.actorUid ||
        vendor.status !== "active" ||
        vendorRecordDataMode(vendor) !== "test" ||
        vendor.authenticationReset?.status === "claimed" ||
        vendor.authenticationReset?.status === "prepared" ||
        !assignment.active ||
        assignment.vendor_id !== input.vendorId ||
        assignment.ticket_id !== input.ticketId ||
        resolveDataMode(assignment) !== "test" ||
        ticket.id !== input.ticketId ||
        resolveDataMode(ticket) !== "test" ||
        !thread.active ||
        thread.vendor_id !== input.vendorId ||
        thread.ticket_id !== input.ticketId ||
        thread.thread_id !== input.threadId ||
        resolveDataMode(thread) !== "test" ||
        confirmation.id !== input.confirmationId ||
        confirmation.data_mode !== "test" ||
        confirmation.liveEvidenceEligible !== false ||
        confirmation.actorUid !== input.actorUid ||
        confirmation.vendorId !== input.vendorId ||
        confirmation.ticketId !== input.ticketId ||
        confirmation.threadId !== input.threadId ||
        confirmation.messageId !== input.messageId ||
        confirmation.payloadHash !== input.payloadHash ||
        mailbox.id !== `${input.vendorId}:${input.ticketId}` ||
        mailbox.data_mode !== "test" ||
        mailbox.liveEvidenceEligible !== false ||
        mailbox.vendorId !== input.vendorId ||
        mailbox.ticketId !== input.ticketId ||
        mailbox.threadId !== input.threadId ||
        !Array.isArray(mailbox.messages)
      ) {
        return { outcome: "mismatch" } as const;
      }
      if (confirmation.state === "sent") {
        return { outcome: "duplicate", mailbox } as const;
      }
      if (confirmation.state === "ambiguous" || confirmation.state === "sending") {
        return { outcome: "ambiguous" } as const;
      }
      if (confirmation.state !== "pending") return { outcome: "mismatch" } as const;
      if (confirmation.expiresAtMs <= input.nowMs) {
        return { outcome: "expired" } as const;
      }

      const matchingMessage = mailbox.messages.find(
        (message) => message.id === input.messageId,
      );
      if (matchingMessage) {
        if (
          matchingMessage.direction !== "vendor_reply" ||
          matchingMessage.body !== input.body
        ) {
          return { outcome: "ambiguous" } as const;
        }
        transaction.update(confirmationRef, { state: "sent" });
        return { outcome: "duplicate", mailbox } as const;
      }

      const updated: VendorTestMailboxRecord = {
        ...mailbox,
        snippet: input.body.slice(0, 240),
        draftBody: "",
        messages: [
          ...mailbox.messages,
          {
            id: input.messageId,
            direction: "vendor_reply" as const,
            body: input.body,
            createdAt: input.nowIso,
          },
        ].slice(-VENDOR_TEST_MAILBOX_MAX_MESSAGES),
        updatedAt: input.nowIso,
      };
      transaction.set(mailboxRef, updated);
      transaction.update(confirmationRef, { state: "sent" });
      return { outcome: "sent", mailbox: updated } as const;
    });
  }
}
