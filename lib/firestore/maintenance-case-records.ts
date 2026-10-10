import { readApplicableOperatingPolicyInTransaction } from "./maintenance-operating-policy-reader";
import { projectMaintenanceUrgency } from "@/lib/maintenance/operating-policy";
import { maintenanceResponsibilityContext } from "@/lib/maintenance/responsibility-context";
import { createHash } from "node:crypto";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import { getAdminFirestore } from "./admin";
import { EditableLayerError } from "./errors";
import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";
import {
  MaintenanceCaseCommandSchema,
  financialProjection,
  validateFinancialAllocation,
  rawSourceAvailability,
  type MaintenanceCaseCommand,
  type MaintenanceCaseEvent,
  type FinancialEntry,
  type FinancialSourceAllocation,
  type CaseAssociation,
} from "@/lib/maintenance/case-model";
import {
  verifyMaintenanceCaseAssociation,
  type VerifiedMaintenanceAssociation,
} from "@/lib/maintenance/case-source";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import {
  MAINTENANCE_TICKET_COLLECTIONS,
  maintenanceOperationKey,
} from "./maintenance-tickets";
export const MAINTENANCE_CASE_COLLECTIONS = {
  events: "maintenance_case_events",
  financial: "maintenance_financial_entries",
  sources: "maintenance_financial_sources",
  artifacts: "maintenance_retained_artifacts",
} as const;
export function assertMaintenanceCaseActor(actor: AuthenticatedUser, write = false) {
  if (
    !actor.uid ||
    !hasSpaceAccess(actor, "maintenance") ||
    !["Editor", "Approver", "Admin"].includes(actor.role) ||
    !can(actor.role, write ? "edit" : "read") ||
    actor.hd !== "pmikcmetro.com" ||
    !actor.email.toLowerCase().endsWith("@pmikcmetro.com") ||
    (write && isVerificationAccount(actor))
  )
    throw new EditableLayerError(
      "Current managed Maintenance staff access is required.",
      403,
    );
}
export const maintenanceCaseId = (value: string) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,160}$/)
    .parse(value);
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function applyMaintenanceCaseOperation(
  actor: AuthenticatedUser,
  ticketId: string,
  input: MaintenanceCaseCommand,
  options: {
    db?: Firestore;
    verifyAssociation?: (
      input: Extract<MaintenanceCaseCommand, { op: "association" }>["association"],
    ) => Promise<VerifiedMaintenanceAssociation>;
    at?: string;
  } = {},
) {
  assertMaintenanceCaseActor(actor, true);
  maintenanceCaseId(ticketId);
  const command = MaintenanceCaseCommandSchema.parse(input),
    db = options.db ?? getAdminFirestore(),
    fingerprint = sha(command),
    at = options.at ?? new Date().toISOString(),
    ticketRef = db.collection(MAINTENANCE_TICKET_COLLECTIONS.tickets).doc(ticketId),
    operationRef = db
      .collection(MAINTENANCE_TICKET_COLLECTIONS.operations)
      .doc(maintenanceOperationKey(actor, ticketId, command.operationId));
  // Read the original receipt before a source probe: a settled operation stays recoverable during outage.
  const priorRead = await operationRef.get();
  let verified: VerifiedMaintenanceAssociation | null = null;
  if (!priorRead.exists && command.op === "association")
    verified = await (options.verifyAssociation ?? verifyMaintenanceCaseAssociation)(
      command.association,
    );
  return db.runTransaction(async (tx) => {
    const [snapshot, prior] = await tx.getAll(ticketRef, operationRef);
    if (!snapshot.exists)
      throw new EditableLayerError("That maintenance case is unavailable.", 404);
    const persisted = snapshot.data()!,
      ticket = { ...persisted, id: snapshot.id } as MaintenanceTicketRecord;
    if (ticket.data_mode !== "live")
      throw new EditableLayerError("Legacy Test maintenance cases are retired.", 409);
    if (prior.exists) {
      if (
        prior.data()!.actor_uid !== actor.uid ||
        prior.data()!.fingerprint !== fingerprint ||
        prior.data()!.ticket_id !== ticketId
      )
        throw new EditableLayerError(
          "The original operation records different work. Recover its original result.",
          409,
        );
      return ticket;
    }
    if ((ticket.record_version ?? 0) !== command.expectedVersion)
      throw new EditableLayerError(
        "This case changed. Your words are kept; read its current version before a new change.",
        409,
      );
    const version = (ticket.record_version ?? 0) + 1;
    let updated: MaintenanceTicketRecord = {
      ...ticket,
      record_version: version,
      updated_at: at,
      lifecycle_started_at: ticket.lifecycle_started_at ?? at,
      lifecycle_origin: ticket.lifecycle_origin ?? "legacy_starting_state",
    };
    const event: MaintenanceCaseEvent = {
      id: uuidv7(),
      ticket_id: ticketId,
      ticket_version: version,
      kind: command.op,
      actor_kind: "staff",
      actor_id: actor.uid,
      occurred_at: at,
      recorded_at: at,
      summary: "",
      evidence_refs: [],
      association: ticket.maintenance_association ?? null,
    };
    let financialWrite: {
        key: string;
        record: FinancialEntry;
        current: Record<string, unknown> | undefined;
      } | null = null,
      sourceWrite: {
        key: string;
        record: FinancialSourceAllocation;
        current: Record<string, unknown> | undefined;
      } | null = null;
    if (command.op === "association") {
      if (!verified)
        throw new EditableLayerError(
          "The current association identity has not been verified.",
          409,
        );
      const association: CaseAssociation = {
        ...command.association,
        ownerRef: command.association.ownerRef ?? null,
        ownerLabel: verified.ownerLabel ?? null,
        unitLabel: verified.unitLabel,
        ownershipBasis: command.association.ownerRef
          ? "staff_reviewed_event_date_evidence"
          : "not_established",
        version: (ticket.maintenance_association?.version ?? 0) + 1,
        identityStatus:
          command.association.kind === "unresolved" ? "unresolved" : "verified",
        tenancyBasis:
          command.association.kind === "lease"
            ? "staff_reviewed_event_date_evidence"
            : "not_applicable",
        verifiedAt: at,
        recordedBy: actor.uid,
        sourceHash: verified.sourceHash,
      };
      updated = {
        ...updated,
        maintenance_association: association,
        property_id: association.propertyId ?? undefined,
        unit:
          association.unitId && verified.unitLabel
            ? { unitId: `unit:${association.unitId}`, label: verified.unitLabel }
            : null,
        owner_decision: undefined,
      };
      event.association = association;
      event.previous_association = ticket.maintenance_association ?? null;
      event.summary = command.association.reason;
      event.evidence_refs = [command.association.evidenceRef];
      event.occurred_at = command.association.eventDate;
      event.occurrence_precision = "date";
    } else if (command.op === "financial") {
      const key = sha([ticketId, command.entry.id]),
        ref = db.collection(MAINTENANCE_CASE_COLLECTIONS.financial).doc(key),
        old = await tx.get(ref),
        previous = old.exists ? (old.data() as unknown as FinancialEntry) : null;
      if ((previous?.version ?? 0) !== command.entry.expectedEntryVersion)
        throw new EditableLayerError(
          "This financial entry changed. Review the current version before correcting it.",
          409,
        );
      if (
        previous &&
        [
          previous.kind,
          previous.vendorId,
          previous.externalIdentity,
          previous.currency,
        ].join("|") !==
          [
            command.entry.kind,
            command.entry.vendorId,
            command.entry.externalIdentity,
            command.entry.currency,
          ].join("|")
      )
        throw new EditableLayerError(
          "Preserve the original financial identity. Void that entry with its reason before recording a different source or kind.",
          409,
        );
      if (!previous && (ticket.financial_entry_count ?? 0) >= 1000)
        throw new EditableLayerError(
          "This case has reached the bounded financial-entry limit; current evidence remains available for review/export.",
          409,
        );
      if (command.entry.vendorId) {
        const vendor = await tx.get(db.collection("vendors").doc(command.entry.vendorId));
        if (
          !vendor.exists ||
          vendor.data()!.data_mode === "test" ||
          (!previous && vendor.data()!.status !== "active")
        )
          throw new EditableLayerError(
            "Select an actual current vendor identity before recording vendor financial evidence.",
            409,
          );
      }
      const { expectedEntryVersion, ...payload } = command.entry;
      void expectedEntryVersion;
      const record: FinancialEntry = {
        ...payload,
        version: (previous?.version ?? 0) + 1,
        ticket_id: ticketId,
        recorded_by_uid: actor.uid,
        recorded_at: at,
      };
      if (["vendor_invoice", "vendor_credit", "quote"].includes(record.kind)) {
        const sourceKey = sha([
            record.kind,
            record.vendorId,
            record.externalIdentity,
            record.currency,
          ]),
          sourceRef = db.collection(MAINTENANCE_CASE_COLLECTIONS.sources).doc(sourceKey),
          source = await tx.get(sourceRef),
          existing = source.exists
            ? (source.data() as unknown as FinancialSourceAllocation)
            : null,
          allocationKey = `${ticketId}:${record.id}`,
          sourceHash = sha([
            record.sourceTotalCents,
            record.sourceLines,
            record.invoiceDate,
          ]);
        const blocker = validateFinancialAllocation(existing, {
          allocationKey,
          amountCents: record.reviewState === "void" ? 0 : record.amountCents,
          totalCents: record.sourceTotalCents!,
          currency: record.currency,
          sourceHash,
          correction: previous !== null,
        });
        if (blocker) throw new EditableLayerError(blocker, 409);
        const allocations = { ...existing?.allocations };
        if (record.reviewState === "void") delete allocations[allocationKey];
        else allocations[allocationKey] = record.amountCents;
        sourceWrite = {
          key: sourceKey,
          current: source.data(),
          record: {
            totalCents: record.sourceTotalCents!,
            currency: record.currency,
            sourceHash,
            allocations,
          },
        };
      }
      financialWrite = { key, record, current: old.data() };
      updated = {
        ...updated,
        financial_entry_count: (ticket.financial_entry_count ?? 0) + (previous ? 0 : 1),
      };
      event.financial_snapshot = record;
      event.previous_financial_snapshot = previous;
      event.summary = record.correctionReason;
      event.evidence_refs = [record.sourceRef];
      event.occurred_at = record.paymentDate ?? record.invoiceDate ?? record.serviceDate;
      event.occurrence_precision = "date";
    } else if (command.op === "urgency_review") {
      if (ticket.status === "Closed")
        throw new EditableLayerError(
          "Closed urgency history is retained. Reopen the actual work before a new urgency decision.",
          409,
        );
      const applicable = await readApplicableOperatingPolicyInTransaction(
          tx,
          db,
          "emergency",
          ticket.property_id ?? ticket.maintenance_association?.propertyId ?? null,
          at,
        ),
        policy = applicable.policy;
      if (
        command.review.expectedPolicy.id !== (policy?.id ?? null) ||
        command.review.expectedPolicy.version !== (policy?.version ?? null)
      )
        throw new EditableLayerError(
          "The applicable emergency policy changed. Review current guidance before saving your kept facts.",
          409,
        );
      const decision = projectMaintenanceUrgency(command.review.facts, policy);
      updated = {
        ...updated,
        priority: decision.priority,
        priority_provenance: "staff-reviewed-facts",
        operating_policy_decision: decision,
        urgency_reviewed_at: at,
        urgency_reviewed_by: actor.uid,
      };
      event.summary = command.review.reason;
      event.evidence_refs = command.review.evidenceRefs;
      event.urgency_review = {
        originalFacts: { summary: ticket.summary, description: ticket.description },
        reviewedFacts: command.review.facts,
        reason: command.review.reason,
        previousDecision: ticket.operating_policy_decision ?? null,
        decision,
      };
    } else if (command.op === "responsibility_review") {
      const review = command.review,
        applicable = await readApplicableOperatingPolicyInTransaction(
          tx,
          db,
          "chargeback",
          ticket.maintenance_association?.propertyId ?? ticket.property_id ?? null,
          at,
        ),
        policy = applicable.policy;
      if (
        review.expectedAssessmentVersion !== (ticket.assessment?.version ?? 0) ||
        review.expectedPolicy.id !== (policy?.id ?? null) ||
        review.expectedPolicy.version !== (policy?.version ?? null)
      )
        throw new EditableLayerError(
          "The assessment or applicable responsibility policy changed. Read current facts before saving your kept review.",
          409,
        );
      if (review.state === "reviewed") {
        if (applicable.state !== "approved" || policy?.purpose !== "chargeback")
          throw new EditableLayerError(
            "An applicable actual approved responsibility policy is required for a responsibility assertion.",
            409,
          );
        if (!ticket.assessment || ticket.assessment.outcome === "needs_information")
          throw new EditableLayerError(
            "Complete the actual issue assessment before asserting responsibility.",
            409,
          );
        if (
          policy.reviewConditions.includes("lease_evidence") &&
          !review.leaseEvidenceRefs.length
        )
          throw new EditableLayerError(
            "This approved policy requires actual reviewed lease evidence.",
            409,
          );
        for (const allocation of review.allocations) {
          const association = ticket.maintenance_association;
          if (
            allocation.party === "resident" &&
            (!association ||
              association.kind !== "lease" ||
              association.identityStatus !== "verified" ||
              allocation.identityRef !== association.leaseId ||
              !review.leaseEvidenceRefs.length)
          )
            throw new EditableLayerError(
              "Resident responsibility requires the verified event-date lease and actual reviewed lease evidence.",
              409,
            );
          if (
            allocation.party === "owner" &&
            (!association?.ownerRef || allocation.identityRef !== association.ownerRef)
          )
            throw new EditableLayerError(
              "Owner responsibility requires the recorded event-date owner and actual ownership evidence.",
              409,
            );
          if (
            allocation.party === "vendor" &&
            (!ticket.vendor_id || allocation.identityRef !== ticket.vendor_id)
          )
            throw new EditableLayerError(
              "Use the actual case vendor identity for vendor responsibility.",
              409,
            );
          if (allocation.party === "pmi" && allocation.identityRef !== null)
            throw new EditableLayerError(
              "PMI responsibility is an organization decision, without an invented external identifier.",
              400,
            );
        }
      }
      const decision = {
        ...review,
        version: (ticket.responsibility_decision?.version ?? 0) + 1,
        recordedAt: at,
        recordedBy: actor.uid,
        contextHash: sha(maintenanceResponsibilityContext(ticket, policy)),
        contextSnapshot: maintenanceResponsibilityContext(ticket, policy),
        meaning: "staff_recorded_responsibility_and_proposal" as const,
        ledgerPosting: "not_executed" as const,
        paymentVerification: "not_established" as const,
      };
      updated = { ...updated, responsibility_decision: decision };
      event.summary = review.reason;
      event.evidence_refs = [...review.evidenceRefs, ...review.leaseEvidenceRefs];
      event.previous_responsibility = ticket.responsibility_decision ?? null;
      event.responsibility_snapshot = decision;
    } else {
      if (Date.parse(command.occurredAt) > Date.parse(at) + 60000)
        throw new EditableLayerError(
          "A reviewed work summary cannot occur in the future.",
          400,
        );
      event.summary = command.summary;
      event.occurred_at = command.occurredAt;
      event.evidence_refs = command.evidenceRefs;
      event.raw_sources = command.rawSources;
    }
    // All reads precede writes. Existing legal holds survive every current-head correction.
    tx.set(
      ticketRef,
      stripUndefined(
        stampProductRecordRetention(
          "maintenance_tickets",
          updated as unknown as Record<string, unknown>,
          persisted,
        ),
      ),
    );
    tx.set(
      operationRef,
      stampProductRecordRetention("maintenance_ticket_operations", {
        actor_uid: actor.uid,
        ticket_id: ticketId,
        operation_id: command.operationId,
        fingerprint,
        committed_version: version,
        created_at: at,
        state: "committed",
      }),
    );
    tx.set(
      db.collection(MAINTENANCE_CASE_COLLECTIONS.events).doc(event.id),
      stampProductRecordRetention(
        "maintenance_case_events",
        event as unknown as Record<string, unknown>,
      ),
    );
    tx.set(
      db.collection(MAINTENANCE_TICKET_COLLECTIONS.activity).doc(event.id),
      stampProductRecordRetention("maintenance_ticket_activity", {
        id: event.id,
        ticket_id: ticketId,
        ticket_version: version,
        actor_uid: actor.uid,
        action: command.op,
        text: event.summary,
        created_at: at,
        occurred_at: event.occurred_at,
      }),
    );
    if (financialWrite)
      tx.set(
        db.collection(MAINTENANCE_CASE_COLLECTIONS.financial).doc(financialWrite.key),
        stampProductRecordRetention(
          "maintenance_financial_entries",
          financialWrite.record as unknown as Record<string, unknown>,
          financialWrite.current,
        ),
      );
    if (sourceWrite)
      tx.set(
        db.collection(MAINTENANCE_CASE_COLLECTIONS.sources).doc(sourceWrite.key),
        stampProductRecordRetention(
          "maintenance_financial_sources",
          sourceWrite.record as unknown as Record<string, unknown>,
          sourceWrite.current,
        ),
      );
    return updated;
  });
}
export async function readMaintenanceCaseHistory(
  actor: AuthenticatedUser,
  ticketId: string,
  options: { db?: Firestore; after?: string | null; at?: string } = {},
) {
  assertMaintenanceCaseActor(actor);
  maintenanceCaseId(ticketId);
  const db = options.db ?? getAdminFirestore(),
    ticket = await db
      .collection(MAINTENANCE_TICKET_COLLECTIONS.tickets)
      .doc(ticketId)
      .get();
  if (!ticket.exists || ticket.data()!.data_mode === "test")
    throw new EditableLayerError("That maintenance case is unavailable.", 404);
  let query = db
    .collection(MAINTENANCE_CASE_COLLECTIONS.events)
    .where("ticket_id", "==", ticketId)
    .orderBy(FieldPath.documentId())
    .limit(51);
  if (options.after) {
    z.string().uuid().parse(options.after);
    query = query.startAfter(options.after);
  }
  const [events, financial, artifacts] = await Promise.all([
    query.get(),
    db
      .collection(MAINTENANCE_CASE_COLLECTIONS.financial)
      .where("ticket_id", "==", ticketId)
      .limit(1001)
      .get(),
    db
      .collection(MAINTENANCE_CASE_COLLECTIONS.artifacts)
      .where("ticket_id", "==", ticketId)
      .limit(1001)
      .get(),
  ]);
  if (financial.size > 1000 || artifacts.size > 1000)
    throw new EditableLayerError(
      "The complete case evidence exceeds this bounded read. No truncated totals were produced.",
      409,
    );
  const entries = financial.docs
    .map((d) => d.data() as unknown as FinancialEntry)
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const at = options.at ?? new Date().toISOString();
  return {
    ticket: { ...ticket.data(), id: ticket.id } as MaintenanceTicketRecord,
    coverage: {
      startedAt: ticket.data()!.lifecycle_started_at ?? null,
      origin: ticket.data()!.lifecycle_origin ?? "legacy_starting_state",
      historicalBackfill: false,
    },
    events: events.docs.slice(0, 50).map((d) => {
      const e = d.data() as unknown as MaintenanceCaseEvent;
      return {
        ...e,
        raw_sources:
          e.raw_sources?.map((source) => ({
            kind: source.kind,
            expiresAt: source.expiresAt,
            availability: rawSourceAvailability(source, at),
          })) ?? [],
      };
    }),
    nextCursor: events.size > 50 ? events.docs[49].id : null,
    financial: entries,
    totals: financialProjection(entries),
    artifacts: artifacts.docs
      .filter((d) => d.data().state === "retained" || d.data().actor_uid === actor.uid)
      .map((d) => {
        const v = { ...d.data() };
        for (const key of [
          "folder_id",
          "provider_file_id",
          "app_properties",
          "content",
          "fingerprint",
          "association_snapshot",
        ])
          delete v[key];
        return v;
      }),
  };
}
function stripUndefined(v: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(v).filter(([, value]) => value !== undefined));
}

export async function readMaintenanceReviewContext(
  actor: AuthenticatedUser,
  ticketId: string,
  options: { db?: Firestore; at?: string } = {},
): Promise<import("@/lib/maintenance/review-model").MaintenanceReviewContext> {
  assertMaintenanceCaseActor(actor);
  maintenanceCaseId(ticketId);
  const db = options.db ?? getAdminFirestore(),
    at = options.at ?? new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const saved = await tx.get(
      db.collection(MAINTENANCE_TICKET_COLLECTIONS.tickets).doc(ticketId),
    );
    if (!saved.exists || saved.data()!.data_mode !== "live")
      throw new EditableLayerError("This current maintenance case is unavailable.", 404);
    const ticket = { ...saved.data(), id: saved.id } as MaintenanceTicketRecord,
      property = ticket.maintenance_association?.propertyId ?? ticket.property_id ?? null,
      [emergency, chargeback] = await Promise.all([
        readApplicableOperatingPolicyInTransaction(tx, db, "emergency", property, at),
        readApplicableOperatingPolicyInTransaction(tx, db, "chargeback", property, at),
      ]),
      decision = ticket.responsibility_decision;
    const urgencyNeedsReview =
        ticket.status !== "Closed" &&
        (ticket.operating_policy_decision?.policyId !== (emergency.policy?.id ?? null) ||
          ticket.operating_policy_decision?.policyVersion !==
            (emergency.policy?.version ?? null)),
      responsibilityNeedsReview =
        !!decision &&
        decision.contextHash !==
          sha(maintenanceResponsibilityContext(ticket, chargeback.policy));
    const policy = chargeback.policy,
      assessed = !!ticket.assessment && ticket.assessment.outcome !== "needs_information",
      currentReviewed = decision?.state === "reviewed" && !responsibilityNeedsReview;
    const available =
      policy?.purpose === "chargeback" &&
      assessed &&
      (policy.timing === "after_assessment" || currentReviewed) &&
      (!policy.reviewConditions.includes("lease_evidence") ||
        !!decision?.leaseEvidenceRefs.length) &&
      (!policy.reviewConditions.includes("staff_review") || currentReviewed);
    return {
      ticket,
      emergency,
      chargeback,
      urgencyNeedsReview,
      responsibilityNeedsReview,
      approvedGuidance:
        available && policy?.purpose === "chargeback" ? policy.wording : null,
      guidanceHold: available
        ? null
        : "Responsibility guidance waits for applicable actual approval, its required assessment/evidence and current staff review. Maintenance intake and urgent care remain available.",
    };
  });
}
