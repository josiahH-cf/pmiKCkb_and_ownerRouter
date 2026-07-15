import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { getAdminFirestore } from "@/lib/firestore/admin";
import { resolveDataMode, type DataMode } from "@/lib/data-mode";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
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
      const record = snapshot.data() as VendorRecord;
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
    const record = snapshot.data() as VendorRecord;
    return (
      record.uid === uid &&
      record.email.trim().toLowerCase() === email.trim().toLowerCase() &&
      (dataMode === undefined || vendorRecordDataMode(record) === dataMode) &&
      record.status === "active"
    );
  }

  async listAssignedTickets(vendorId: string): Promise<VendorTicketProjection[]> {
    const vendor = await this.getVendorById(vendorId);
    if (!vendor) return [];
    const vendorMode = vendorRecordDataMode(vendor);
    const assignments = await this.db
      .collection(VENDOR_COLLECTIONS.assignments)
      .where("vendor_id", "==", vendorId)
      .where("active", "==", true)
      .get();
    const tickets = await Promise.all(
      assignments.docs.map(async (doc) => {
        const assignment = doc.data() as AssignmentRecord;
        if (resolveDataMode(assignment) !== vendorMode) return null;
        const ticket = await this.db
          .collection("maintenance_tickets")
          .doc(assignment.ticket_id)
          .get();
        if (!ticket.exists) return null;
        const record = ticket.data() as MaintenanceTicketRecord;
        return resolveDataMode(record) === vendorMode ? ticketProjection(record) : null;
      }),
    );
    return tickets
      .filter((ticket): ticket is VendorTicketProjection => ticket !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getAssignedTicket(
    vendorId: string,
    ticketId: string,
  ): Promise<VendorTicketProjection | null> {
    const vendor = await this.getVendorById(vendorId);
    if (!vendor) return null;
    const vendorMode = vendorRecordDataMode(vendor);
    const assignment = await this.db
      .collection(VENDOR_COLLECTIONS.assignments)
      .doc(ticketId)
      .get();
    if (!assignment.exists) return null;
    const data = assignment.data() as AssignmentRecord;
    if (
      !data.active ||
      data.vendor_id !== vendorId ||
      data.ticket_id !== ticketId ||
      resolveDataMode(data) !== vendorMode
    )
      return null;
    const ticket = await this.db.collection("maintenance_tickets").doc(ticketId).get();
    if (!ticket.exists) return null;
    const record = ticket.data() as MaintenanceTicketRecord;
    return resolveDataMode(record) === vendorMode ? ticketProjection(record) : null;
  }

  async isThreadLinked(input: {
    vendorId: string;
    ticketId: string;
    threadId: string;
  }): Promise<boolean> {
    const vendor = await this.getVendorById(input.vendorId);
    if (!vendor) return false;
    const id = `${input.vendorId}:${input.ticketId}:${input.threadId}`;
    const snapshot = await this.db
      .collection(VENDOR_COLLECTIONS.threadLinks)
      .doc(id)
      .get();
    if (!snapshot.exists) return false;
    const link = snapshot.data() as ThreadLinkRecord;
    return (
      link.active &&
      resolveDataMode(link) === vendorRecordDataMode(vendor) &&
      link.vendor_id === input.vendorId &&
      link.ticket_id === input.ticketId &&
      link.thread_id === input.threadId
    );
  }

  async getGmailLaneContext(input: {
    vendorId: string;
    ticketId: string;
    threadId: string;
  }): Promise<VendorGmailLaneContext | null> {
    const threadLinkId = `${input.vendorId}:${input.ticketId}:${input.threadId}`;
    const [vendorSnapshot, assignmentSnapshot, ticketSnapshot, threadSnapshot] =
      await Promise.all([
        this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId).get(),
        this.db.collection(VENDOR_COLLECTIONS.assignments).doc(input.ticketId).get(),
        this.db.collection("maintenance_tickets").doc(input.ticketId).get(),
        this.db.collection(VENDOR_COLLECTIONS.threadLinks).doc(threadLinkId).get(),
      ]);
    if (
      !vendorSnapshot.exists ||
      !assignmentSnapshot.exists ||
      !ticketSnapshot.exists ||
      !threadSnapshot.exists
    ) {
      return null;
    }
    const vendor = vendorSnapshot.data() as VendorRecord;
    const assignment = assignmentSnapshot.data() as AssignmentRecord;
    const ticket = ticketSnapshot.data() as MaintenanceTicketRecord;
    const thread = threadSnapshot.data() as ThreadLinkRecord;
    if (
      vendor.id !== input.vendorId ||
      vendor.status !== "active" ||
      !assignment.active ||
      assignment.vendor_id !== input.vendorId ||
      assignment.ticket_id !== input.ticketId ||
      !thread.active ||
      thread.vendor_id !== input.vendorId ||
      thread.ticket_id !== input.ticketId ||
      thread.thread_id !== input.threadId
    ) {
      return null;
    }
    return {
      vendor: vendorRecordDataMode(vendor),
      assignment: resolveDataMode(assignment),
      ticket: resolveDataMode(ticket),
      thread: resolveDataMode(thread),
    };
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
    nowIso: string;
  }): Promise<"disabled" | "already_disabled"> {
    const ref = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(input.vendorId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return "already_disabled" as const;
      const record = snapshot.data() as VendorRecord;
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

  async getTestMailbox(
    vendorId: string,
    ticketId: string,
  ): Promise<VendorTestMailboxRecord | null> {
    const snapshot = await this.db
      .collection(VENDOR_COLLECTIONS.testMailboxes)
      .doc(`${vendorId}:${ticketId}`)
      .get();
    return snapshot.exists ? (snapshot.data() as VendorTestMailboxRecord) : null;
  }

  async saveTestMailbox(record: VendorTestMailboxRecord): Promise<void> {
    await this.db.collection(VENDOR_COLLECTIONS.testMailboxes).doc(record.id).set(record);
  }

  async createTestMailboxConfirmation(
    record: VendorTestMailboxConfirmation,
  ): Promise<void> {
    await this.db
      .collection(VENDOR_COLLECTIONS.testMailboxConfirmations)
      .doc(record.id)
      .create(record);
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
    return this.db.runTransaction(async (transaction) => {
      const [confirmationSnapshot, mailboxSnapshot] = await Promise.all([
        transaction.get(confirmationRef),
        transaction.get(mailboxRef),
      ]);
      if (!confirmationSnapshot.exists || !mailboxSnapshot.exists) {
        return { outcome: "mismatch" } as const;
      }
      const confirmation = confirmationSnapshot.data() as VendorTestMailboxConfirmation;
      const mailbox = mailboxSnapshot.data() as VendorTestMailboxRecord;
      if (
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
