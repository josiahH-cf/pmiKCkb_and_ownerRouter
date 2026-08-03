import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { getAdminFirestore } from "@/lib/firestore/admin";
import { resolveStoredDataMode, type DataMode } from "@/lib/data-mode";
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
import { VendorBoundaryError, vendorRecordDataMode } from "@/lib/vendor/model";
import type { VendorOAuthState, VendorOAuthStore } from "@/lib/vendor/oauth";
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

interface VendorRuntimeRecord extends VendorRecord {
  setupEffectFence?: unknown;
}

function setupEffectIsInProgress(record: VendorRuntimeRecord) {
  return record.setupEffectFence !== undefined;
}

function vendorAuthorityMatches(
  record: VendorRuntimeRecord,
  authority: VendorAssignmentAuthority,
) {
  return (
    record.id === authority.vendorId &&
    record.uid === authority.uid &&
    record.email.trim().toLowerCase() === authority.email.trim().toLowerCase() &&
    record.status === "active" &&
    authority.dataMode === "live" &&
    vendorRecordDataMode(record) === "live" &&
    !setupEffectIsInProgress(record)
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
    dataMode: resolveStoredDataMode(ticket),
  };
}

function auditTimestamp(value: unknown): string | null {
  if (typeof value === "string") {
    return Number.isFinite(Date.parse(value)) ? value : null;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime())
      ? date.toISOString()
      : null;
  }
  return null;
}

export class FirestoreVendorStore
  implements
    VendorInviteStore,
    VendorOAuthStore,
    VendorGmailAssignmentRepository,
    VendorGmailStateStore,
    VendorLifecycleStore
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

  async listBodylessAudit(vendorId: string, limit = 50): Promise<VendorBodylessAudit[]> {
    const snapshot = await this.db
      .collection(VENDOR_COLLECTIONS.audit)
      .where("vendorId", "==", vendorId)
      .get();
    return snapshot.docs
      .map((doc) => {
        const raw = doc.data() as Omit<VendorBodylessAudit, "createdAt"> & {
          createdAt?: unknown;
        };
        const createdAt = auditTimestamp(raw.createdAt);
        return createdAt ? ({ ...raw, createdAt } as VendorBodylessAudit) : null;
      })
      .filter(
        (record): record is VendorBodylessAudit =>
          record !== null && record.vendorId === vendorId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, Math.max(1, Math.min(limit, 100)));
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
      const record = snapshot.data() as VendorRuntimeRecord;
      if (dataMode !== "live" || setupEffectIsInProgress(record)) {
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
    const record = snapshot.data() as VendorRuntimeRecord;
    return (
      record.uid === uid &&
      record.email.trim().toLowerCase() === email.trim().toLowerCase() &&
      (dataMode ?? "live") === "live" &&
      vendorRecordDataMode(record) === "live" &&
      record.status === "active" &&
      !setupEffectIsInProgress(record)
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
      const vendor = vendorSnapshot.data() as VendorRuntimeRecord;
      if (!vendorAuthorityMatches(vendor, authority)) return [];
      const matchingAssignments = assignments.docs
        .map((doc) => doc.data() as AssignmentRecord)
        .filter(
          (assignment) =>
            assignment.active &&
            assignment.vendor_id === authority.vendorId &&
            resolveStoredDataMode(assignment) === authority.dataMode,
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
          return resolveStoredDataMode(ticket) === authority.dataMode
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
      const vendor = vendorSnapshot.data() as VendorRuntimeRecord;
      const assignment = assignmentSnapshot.data() as AssignmentRecord;
      const ticket = ticketSnapshot.data() as MaintenanceTicketRecord;
      if (
        !vendorAuthorityMatches(vendor, authority) ||
        !assignment.active ||
        assignment.vendor_id !== authority.vendorId ||
        assignment.ticket_id !== authority.ticketId ||
        resolveStoredDataMode(assignment) !== authority.dataMode ||
        ticket.id !== authority.ticketId ||
        resolveStoredDataMode(ticket) !== authority.dataMode
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
      const vendor = vendorSnapshot.data() as VendorRuntimeRecord;
      const assignment = assignmentSnapshot.data() as AssignmentRecord;
      const ticket = ticketSnapshot.data() as MaintenanceTicketRecord;
      const thread = threadSnapshot.data() as ThreadLinkRecord;
      return (
        vendorAuthorityMatches(vendor, input) &&
        assignment.active &&
        assignment.vendor_id === input.vendorId &&
        assignment.ticket_id === input.ticketId &&
        resolveStoredDataMode(assignment) === input.dataMode &&
        ticket.id === input.ticketId &&
        resolveStoredDataMode(ticket) === input.dataMode &&
        thread.active &&
        thread.vendor_id === input.vendorId &&
        thread.ticket_id === input.ticketId &&
        thread.thread_id === input.threadId &&
        resolveStoredDataMode(thread) === input.dataMode
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
      const vendor = vendorSnapshot.data() as VendorRuntimeRecord;
      const assignment = assignmentSnapshot.data() as AssignmentRecord;
      const ticket = ticketSnapshot.data() as MaintenanceTicketRecord;
      const thread = threadSnapshot.data() as ThreadLinkRecord;
      const vendorMode = vendorRecordDataMode(vendor);
      if (
        vendor.id !== input.vendorId ||
        vendor.status !== "active" ||
        setupEffectIsInProgress(vendor) ||
        input.actorDataMode !== "live" ||
        vendorMode !== "live" ||
        (!input.actorIsAdmin &&
          (vendor.uid !== input.actorUid ||
            vendor.email.trim().toLowerCase() !==
              input.actorEmail.trim().toLowerCase())) ||
        !assignment.active ||
        assignment.vendor_id !== input.vendorId ||
        assignment.ticket_id !== input.ticketId ||
        resolveStoredDataMode(assignment) !== vendorMode ||
        ticket.id !== input.ticketId ||
        resolveStoredDataMode(ticket) !== vendorMode ||
        !thread.active ||
        thread.vendor_id !== input.vendorId ||
        thread.ticket_id !== input.ticketId ||
        thread.thread_id !== input.threadId ||
        resolveStoredDataMode(thread) !== vendorMode
      ) {
        return null;
      }
      return {
        vendor: vendorMode,
        assignment: resolveStoredDataMode(assignment),
        ticket: resolveStoredDataMode(ticket),
        thread: resolveStoredDataMode(thread),
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

  async saveConnection(
    connection: VendorMailboxConnection,
    authority: VendorAssignmentAuthority,
  ): Promise<void> {
    const vendorRef = this.db
      .collection(VENDOR_COLLECTIONS.vendors)
      .doc(authority.vendorId);
    const connectionRef = this.db
      .collection(VENDOR_COLLECTIONS.connections)
      .doc(connection.vendorId);
    await this.db.runTransaction(async (transaction) => {
      const vendorSnapshot = await transaction.get(vendorRef);
      const vendor = vendorSnapshot.exists
        ? (vendorSnapshot.data() as VendorRuntimeRecord)
        : null;
      if (
        !vendor ||
        !vendorAuthorityMatches(vendor, authority) ||
        connection.vendorId !== authority.vendorId ||
        connection.mailboxEmail.trim().toLowerCase() !==
          authority.email.trim().toLowerCase() ||
        connection.status !== "connected" ||
        connection.dataMode !== authority.dataMode
      ) {
        throw new VendorBoundaryError("Vendor account is unavailable.", 404);
      }
      transaction.set(connectionRef, connection);
    });
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
    actorEmail: string;
    actorDataMode: "live";
    actorIsAdmin: boolean;
    vendorId: string;
    mailboxEmail: string;
    ticketId: string;
    threadId: string;
    payloadHash: string;
    nowMs: number;
  }): Promise<"claimed" | "expired" | "mismatch" | "duplicate" | "ambiguous"> {
    const ref = this.db.collection(VENDOR_COLLECTIONS.confirmations).doc(input.id);
    const vendorRef = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    const assignmentRef = this.db
      .collection(VENDOR_COLLECTIONS.assignments)
      .doc(input.ticketId);
    const ticketRef = this.db.collection("maintenance_tickets").doc(input.ticketId);
    const threadRef = this.db
      .collection(VENDOR_COLLECTIONS.threadLinks)
      .doc(`${input.vendorId}:${input.ticketId}:${input.threadId}`);
    const connectionRef = this.db
      .collection(VENDOR_COLLECTIONS.connections)
      .doc(input.vendorId);
    return this.db.runTransaction(async (transaction) => {
      const [
        snapshot,
        vendorSnapshot,
        assignmentSnapshot,
        ticketSnapshot,
        threadSnapshot,
        connectionSnapshot,
      ] = await Promise.all([
        transaction.get(ref),
        transaction.get(vendorRef),
        transaction.get(assignmentRef),
        transaction.get(ticketRef),
        transaction.get(threadRef),
        transaction.get(connectionRef),
      ]);
      if (!snapshot.exists) return "mismatch" as const;
      const record = snapshot.data() as VendorSendConfirmation;
      if (
        record.actorUid !== input.actorUid ||
        record.vendorId !== input.vendorId ||
        record.mailboxEmail.trim().toLowerCase() !==
          input.mailboxEmail.trim().toLowerCase() ||
        record.ticketId !== input.ticketId ||
        record.threadId !== input.threadId ||
        record.payloadHash !== input.payloadHash
      ) {
        return "mismatch" as const;
      }
      if (record.state === "sent") return "duplicate" as const;
      if (record.state === "ambiguous") return "ambiguous" as const;
      if (record.state !== "pending") return "mismatch" as const;
      if (record.expiresAtMs <= input.nowMs) return "expired" as const;
      if (
        !vendorSnapshot.exists ||
        !assignmentSnapshot.exists ||
        !ticketSnapshot.exists ||
        !threadSnapshot.exists ||
        !connectionSnapshot.exists
      ) {
        return "mismatch" as const;
      }
      const vendor = vendorSnapshot.data() as VendorRuntimeRecord;
      const assignment = assignmentSnapshot.data() as AssignmentRecord;
      const ticket = ticketSnapshot.data() as MaintenanceTicketRecord;
      const thread = threadSnapshot.data() as ThreadLinkRecord;
      const connection = connectionSnapshot.data() as VendorMailboxConnection;
      const vendorMode = vendorRecordDataMode(vendor);
      if (
        vendor.id !== input.vendorId ||
        vendor.status !== "active" ||
        setupEffectIsInProgress(vendor) ||
        input.actorDataMode !== "live" ||
        vendorMode !== "live" ||
        (!input.actorIsAdmin &&
          (vendor.uid !== input.actorUid ||
            vendor.email.trim().toLowerCase() !==
              input.actorEmail.trim().toLowerCase())) ||
        !assignment.active ||
        assignment.vendor_id !== input.vendorId ||
        assignment.ticket_id !== input.ticketId ||
        resolveStoredDataMode(assignment) !== vendorMode ||
        ticket.id !== input.ticketId ||
        resolveStoredDataMode(ticket) !== vendorMode ||
        !thread.active ||
        thread.vendor_id !== input.vendorId ||
        thread.ticket_id !== input.ticketId ||
        thread.thread_id !== input.threadId ||
        resolveStoredDataMode(thread) !== vendorMode ||
        connection.vendorId !== input.vendorId ||
        connection.mailboxEmail.trim().toLowerCase() !==
          input.mailboxEmail.trim().toLowerCase() ||
        connection.status !== "connected" ||
        connection.dataMode !== vendorMode
      ) {
        return "mismatch" as const;
      }
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
      const record = snapshot.data() as VendorRuntimeRecord;
      if (setupEffectIsInProgress(record)) {
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
}
