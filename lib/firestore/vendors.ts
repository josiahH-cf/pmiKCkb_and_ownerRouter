import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { getAdminFirestore } from "@/lib/firestore/admin";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import type { VendorAssignmentRepository } from "@/lib/vendor/assignment";
import type { VendorGmailStateStore, VendorSendConfirmation } from "@/lib/vendor/gmail";
import type { VendorInviteStore } from "@/lib/vendor/invite";
import type { VendorLifecycleStore } from "@/lib/vendor/lifecycle";
import type {
  VendorBodylessAudit,
  VendorMailboxConnection,
  VendorRecord,
  VendorTicketProjection,
} from "@/lib/vendor/model";
import type { VendorOAuthState, VendorOAuthStore } from "@/lib/vendor/oauth";

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
  };
}

export class FirestoreVendorStore
  implements
    VendorInviteStore,
    VendorOAuthStore,
    VendorAssignmentRepository,
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

  async activateVendor(vendorId: string, uid: string, nowIso: string) {
    const ref = this.db.collection(VENDOR_COLLECTIONS.vendors).doc(vendorId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const record = snapshot.data() as VendorRecord;
      if (record.uid !== uid || record.status === "disabled") return false;
      if (record.status !== "active") {
        transaction.update(ref, { status: "active", updatedAt: nowIso });
      }
      return true;
    });
  }

  async isVendorActive(vendorId: string, uid: string): Promise<boolean> {
    const snapshot = await this.db
      .collection(VENDOR_COLLECTIONS.vendors)
      .doc(vendorId)
      .get();
    if (!snapshot.exists) return false;
    const record = snapshot.data() as VendorRecord;
    return record.uid === uid && record.status === "active";
  }

  async listAssignedTickets(vendorId: string): Promise<VendorTicketProjection[]> {
    const assignments = await this.db
      .collection(VENDOR_COLLECTIONS.assignments)
      .where("vendor_id", "==", vendorId)
      .where("active", "==", true)
      .get();
    const tickets = await Promise.all(
      assignments.docs.map(async (doc) => {
        const assignment = doc.data() as AssignmentRecord;
        const ticket = await this.db
          .collection("maintenance_tickets")
          .doc(assignment.ticket_id)
          .get();
        return ticket.exists
          ? ticketProjection(ticket.data() as MaintenanceTicketRecord)
          : null;
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
    const assignment = await this.db
      .collection(VENDOR_COLLECTIONS.assignments)
      .doc(ticketId)
      .get();
    if (!assignment.exists) return null;
    const data = assignment.data() as AssignmentRecord;
    if (!data.active || data.vendor_id !== vendorId || data.ticket_id !== ticketId)
      return null;
    const ticket = await this.db.collection("maintenance_tickets").doc(ticketId).get();
    return ticket.exists
      ? ticketProjection(ticket.data() as MaintenanceTicketRecord)
      : null;
  }

  async isThreadLinked(input: {
    vendorId: string;
    ticketId: string;
    threadId: string;
  }): Promise<boolean> {
    const id = `${input.vendorId}:${input.ticketId}:${input.threadId}`;
    const snapshot = await this.db
      .collection(VENDOR_COLLECTIONS.threadLinks)
      .doc(id)
      .get();
    if (!snapshot.exists) return false;
    const link = snapshot.data() as ThreadLinkRecord;
    return (
      link.active &&
      link.vendor_id === input.vendorId &&
      link.ticket_id === input.ticketId &&
      link.thread_id === input.threadId
    );
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
}
