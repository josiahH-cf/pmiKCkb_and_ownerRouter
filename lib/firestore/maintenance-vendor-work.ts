import { createHash } from "node:crypto";
import { FieldPath, type Firestore, type Transaction } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type {
  VendorPrincipal,
  VendorRecord,
  VendorTicketProjection,
} from "@/lib/vendor/model";
import { VendorBoundaryError } from "@/lib/vendor/model";
import {
  vendorAssignmentGeneration,
  reviewedVendorPacket,
} from "@/lib/vendor/work-projection";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import { hasCurrentRecordedOwnerDecision } from "@/lib/maintenance/lifecycle";
import {
  getMaintenancePropertyPreapproval,
  readMaintenancePropertyPreapprovalRecord,
  MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION,
} from "./maintenance-property-preapprovals";
import { readCurrentMaintenancePolicyOwnerRefs } from "@/lib/maintenance/policy-source";
import { evaluateMaintenanceStandingPolicy } from "@/lib/maintenance/property-preapproval";
import { maintenanceWorkScope } from "@/lib/maintenance/lifecycle";
import {
  VendorRosterInputSchema,
  MaintenanceVendorCommandSchema,
  VendorContributionInputSchema,
  VendorArtifactInputSchema,
  vendorPacketCurrent,
  type VendorRosterInput,
  type VendorRosterRecord,
  type VendorSelection,
  type VendorPacket,
  type MaintenanceVendorCommand,
  type VendorContributionInput,
  type VendorContribution,
  type VendorArtifactInput,
  type VendorArtifact,
} from "@/lib/maintenance/vendor-work-model";
import {
  assertMaintenanceCaseActor,
  maintenanceCaseId,
} from "./maintenance-case-records";
import { maintenanceOperationKey } from "./maintenance-tickets";
import { vendorAuthorityMatches } from "./vendors";
import { getAdminFirestore } from "./admin";
import { EditableLayerError } from "./errors";
import { stampProductRecordRetention as stamp } from "@/lib/operations/product-record-retention";
import {
  FirestorePublicationContentStore,
  publicationContentChunkDocumentId,
} from "@/lib/publication/content";
import type { PublicationContentReference } from "@/lib/publication/types";
import { validateWorkflowAttachment } from "@/lib/gmail-runtime/workflow-mime";
export const VENDOR_WORK_COLLECTIONS = {
  roster: "maintenance_vendor_roster",
  rosterOps: "maintenance_vendor_roster_operations",
  rosterHistory: "maintenance_vendor_roster_history",
  selections: "maintenance_vendor_selections",
  packets: "maintenance_vendor_packets",
  contributions: "maintenance_vendor_contributions",
  operations: "maintenance_vendor_operations",
  artifacts: "maintenance_vendor_artifacts",
} as const;
const C = VENDOR_WORK_COLLECTIONS,
  sha = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex"),
  vendorId = (id: string) =>
    z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,160}$/)
      .parse(id),
  submissionKey = (ticketId: string, vendor: string, id: string) =>
    sha([ticketId, vendor, id]);
export async function readMaintenanceVendorRoster(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
) {
  assertMaintenanceCaseActor(actor);
  const [records, vendors] = await Promise.all([
    db.collection(C.roster).orderBy(FieldPath.documentId()).limit(1001).get(),
    db.collection("vendors").orderBy(FieldPath.documentId()).limit(1001).get(),
  ]);
  if (records.size > 1000 || vendors.size > 1000)
    throw new EditableLayerError(
      "The complete roster exceeds this view's bound; no incomplete preference list was inferred.",
      409,
    );
  return {
    roster: records.docs.map((d) => d.data() as VendorRosterRecord),
    vendors: vendors.docs
      .filter((d) => d.data().data_mode !== "test")
      .map((d) => {
        const v = d.data();
        return {
          id: d.id,
          displayName: v.displayName ?? null,
          email: v.email,
          status: v.status,
          identityState: v.identityState ?? null,
        };
      }),
  };
}
export async function saveMaintenanceVendorRoster(
  actor: AuthenticatedUser,
  input: VendorRosterInput,
  db: Firestore = getAdminFirestore(),
) {
  assertMaintenanceCaseActor(actor, true);
  if (actor.role !== "Admin")
    throw new EditableLayerError(
      "An Admin manages verified shared vendor preferences.",
      403,
    );
  const command = VendorRosterInputSchema.parse(input),
    fingerprint = sha(command),
    ref = db.collection(C.roster).doc(command.vendorId),
    operation = db.collection(C.rosterOps).doc(sha([actor.uid, command.operationId]));
  return db.runTransaction(async (tx) => {
    const [prior, current, vendor, duplicates] = await Promise.all([
      tx.get(operation),
      tx.get(ref),
      tx.get(db.collection("vendors").doc(command.vendorId)),
      tx.get(
        db
          .collection(C.roster)
          .where("contactEmail", "==", command.contactEmail.toLowerCase())
          .where("active", "==", true)
          .limit(3),
      ),
    ]);
    if (prior.exists) {
      if (prior.data()!.state === "stopped")
        throw new EditableLayerError(
          "This exact original roster operation was stopped before commitment. Review current preferences as new work.",
          409,
        );
      if (prior.data()!.fingerprint !== fingerprint)
        throw new EditableLayerError(
          "That original roster operation records different work.",
          409,
        );
      return current.data() as VendorRosterRecord;
    }
    if (
      !vendor.exists ||
      vendor.data()!.id !== command.vendorId ||
      vendor.data()!.status === "disabled" ||
      vendor.data()!.data_mode === "test" ||
      String(vendor.data()!.email).toLowerCase() !== command.contactEmail.toLowerCase()
    )
      throw new EditableLayerError(
        "Use an actual current vendor identity and its exact verified contact; preferences do not create an account.",
        409,
      );
    if (command.active && duplicates.docs.some((d) => d.id !== command.vendorId))
      throw new EditableLayerError(
        "This contact is already assigned to another active roster identity. Resolve the actual identity before choosing it.",
        409,
      );
    if ((current.data()?.version ?? 0) !== command.expectedVersion)
      throw new EditableLayerError(
        "Shared vendor preferences changed. Read current preferences before applying your retained words.",
        409,
      );
    const { operationId, expectedVersion, ...terms } = command;
    void expectedVersion;
    const at = new Date().toISOString(),
      record: VendorRosterRecord = {
        ...terms,
        contactEmail: terms.contactEmail.toLowerCase(),
        version: (current.data()?.version ?? 0) + 1,
        recordedBy: actor.uid,
        recordedAt: at,
      };
    tx.set(ref, stamp(C.roster, { ...record }, current.data()));
    tx.create(
      db.collection(C.rosterHistory).doc(uuidv7()),
      stamp(C.rosterHistory, { record, previous: current.data() ?? null }),
    );
    tx.create(
      operation,
      stamp(C.rosterOps, {
        actorUid: actor.uid,
        operationId,
        fingerprint,
        vendorId: command.vendorId,
        committedVersion: record.version,
        createdAt: at,
      }),
    );
    return stamp(C.roster, { ...record }, current.data());
  });
}
export async function readMaintenanceRosterOperation(
  actor: AuthenticatedUser,
  operationId: string,
  db: Firestore = getAdminFirestore(),
) {
  assertMaintenanceCaseActor(actor);
  z.string().uuid().parse(operationId);
  const result = await db
    .collection(C.rosterOps)
    .doc(sha([actor.uid, operationId]))
    .get();
  if (!result.exists)
    return {
      state: "not_recorded",
      operationId,
      detail:
        "No settled receipt is recorded. Preserve this exact original operation; absence does not establish failure.",
    };
  if (result.data()!.state === "stopped")
    return {
      state: "stopped",
      operationId,
      detail:
        "Original roster save stopped before commitment. No vendor preference was changed by stopping it.",
    };
  const head = await db.collection(C.roster).doc(result.data()!.vendorId).get();
  return {
    state: "committed",
    operationId,
    committedVersion: result.data()!.committedVersion,
    record: head.data() ?? null,
  };
}
/** Transactional app-owned cutoff races the original save on its same actor-bound document. */
export async function stopMaintenanceRosterOperation(
  actor: AuthenticatedUser,
  operationId: string,
  db: Firestore = getAdminFirestore(),
) {
  assertMaintenanceCaseActor(actor, true);
  if (actor.role !== "Admin")
    throw new EditableLayerError(
      "An Admin manages verified shared vendor preferences.",
      403,
    );
  z.string().uuid().parse(operationId);
  const ref = db.collection(C.rosterOps).doc(sha([actor.uid, operationId]));
  await db.runTransaction(async (tx) => {
    const prior = await tx.get(ref);
    if (prior.exists) return;
    tx.create(
      ref,
      stamp(C.rosterOps, {
        actorUid: actor.uid,
        operationId,
        state: "stopped",
        createdAt: new Date().toISOString(),
      }),
    );
  });
  return readMaintenanceRosterOperation(actor, operationId, db);
}

function event(
  tx: Transaction,
  db: Firestore,
  ticket: MaintenanceTicketRecord,
  actor: { id: string; kind: "staff" | "vendor" },
  kind: string,
  summary: string,
  snapshot: Record<string, unknown>,
  occurredAt: string,
  at: string,
) {
  const id = uuidv7();
  tx.create(
    db.collection("maintenance_case_events").doc(id),
    stamp("maintenance_case_events", {
      id,
      ticket_id: ticket.id,
      ticket_version: ticket.record_version ?? 0,
      kind,
      actor_kind: actor.kind,
      actor_id: actor.id,
      summary,
      occurred_at: occurredAt,
      recorded_at: at,
      evidence_refs: [],
      association: ticket.maintenance_association ?? null,
      ...snapshot,
    }),
  );
  tx.create(
    db.collection("maintenance_ticket_activity").doc(id),
    stamp("maintenance_ticket_activity", {
      id,
      ticket_id: ticket.id,
      ticket_version: ticket.record_version ?? 0,
      actor_uid: actor.id,
      action: kind,
      text: summary,
      created_at: at,
    }),
  );
}
export async function applyMaintenanceVendorOperation(
  actor: AuthenticatedUser,
  ticketId: string,
  input: MaintenanceVendorCommand,
  db: Firestore = getAdminFirestore(),
) {
  assertMaintenanceCaseActor(actor, true);
  maintenanceCaseId(ticketId);
  const command = MaintenanceVendorCommandSchema.parse(input),
    fingerprint = sha(command),
    op = db
      .collection("maintenance_ticket_operations")
      .doc(maintenanceOperationKey(actor, ticketId, command.operationId)),
    ticketRef = db.collection("maintenance_tickets").doc(ticketId);
  let verifiedOwnerRefs: readonly string[] = [];
  if (
    ((command.op === "vendor_packet" && command.packet.costLimitCents !== null) ||
      command.op === "vendor_handoff_report") &&
    !(await op.get()).exists
  ) {
    const source = await ticketRef.get(),
      t = source.data() as MaintenanceTicketRecord | undefined;
    if (t?.property_id && !hasCurrentRecordedOwnerDecision(t)) {
      const policy = await getMaintenancePropertyPreapproval(actor, t.property_id, db);
      if (policy?.policy_terms?.scope === "owner")
        verifiedOwnerRefs = await readCurrentMaintenancePolicyOwnerRefs(t.property_id);
    }
  }
  return db.runTransaction(async (tx) => {
    const [ticketDoc, prior, selectionDoc, packetDoc] = await tx.getAll(
      ticketRef,
      op,
      db.collection(C.selections).doc(ticketId),
      db.collection(C.packets).doc(ticketId),
    );
    if (!ticketDoc.exists || ticketDoc.data()!.data_mode !== "live")
      throw new EditableLayerError("That maintenance case is unavailable.", 404);
    const ticket = ticketDoc.data() as MaintenanceTicketRecord;
    let packetAuthorization: VendorPacket["authorizationBinding"] = null;

    if (prior.exists) {
      if (prior.data()!.fingerprint !== fingerprint)
        throw new EditableLayerError(
          "Recover the original case operation; its content differs.",
          409,
        );
      return ticket;
    }
    if ((ticket.record_version ?? 0) !== command.expectedVersion)
      throw new EditableLayerError(
        "The case changed. Keep your words and read current work before applying a new edit.",
        409,
      );
    const selection = selectionDoc.exists
        ? (selectionDoc.data() as VendorSelection)
        : null,
      packet = packetDoc.exists ? (packetDoc.data() as VendorPacket) : null,
      at = new Date().toISOString(),
      next = {
        ...ticket,
        record_version: (ticket.record_version ?? 0) + 1,
        updated_at: at,
      };
    let meaning = command.op as string,
      summary = "",
      snapshot: Record<string, unknown> = {},
      write: {
        ref: FirebaseFirestore.DocumentReference;
        data: Record<string, unknown>;
        collection: typeof C.selections | typeof C.packets | typeof C.contributions;
        current?: Record<string, unknown>;
      } | null = null,
      occurredAt = at;
    if (
      command.op === "vendor_selection" ||
      command.op === "vendor_packet" ||
      command.op === "vendor_handoff_report"
    ) {
      const currentPolicy = await currentPacketPolicy(tx, db, ticket);
      const selectedId =
        command.op === "vendor_selection" ? command.vendorId : selection?.vendorId;
      if (!selectedId)
        throw new EditableLayerError("Deliberately select a verified vendor first.", 409);
      const [rosterDoc, vendor] = await tx.getAll(
          db.collection(C.roster).doc(selectedId),
          db.collection("vendors").doc(selectedId),
        ),
        roster = rosterDoc.exists ? (rosterDoc.data() as VendorRosterRecord) : null;
      if (
        !roster ||
        !roster.active ||
        roster.availability === "unavailable" ||
        !vendor.exists ||
        vendor.data()!.status === "disabled" ||
        vendor.data()!.data_mode === "test" ||
        String(vendor.data()!.email).toLowerCase() !== roster.contactEmail
      )
        throw new EditableLayerError(
          "The actual vendor/contact is unavailable or changed. Read and review another suitable choice.",
          409,
        );
      if (command.op === "vendor_selection") {
        if (roster.version !== command.rosterVersion)
          throw new EditableLayerError(
            "Vendor preferences changed before this selection.",
            409,
          );
        const record: VendorSelection = {
          ticketId,
          vendorId: command.vendorId,
          version: (selection?.version ?? 0) + 1,
          rosterVersion: roster.version,
          reason: command.reason,
          selectedBy: actor.uid,
          selectedAt: at,
        };
        write = {
          ref: selectionDoc.ref,
          data: record as unknown as Record<string, unknown>,
          collection: C.selections,
          current: selectionDoc.data(),
        };
        summary = command.reason;
        snapshot = { selection: record, previous_selection: selection };
      } else if (command.op === "vendor_packet") {
        if (
          selection!.version !== command.selectionVersion ||
          selection!.rosterVersion !== roster.version ||
          command.rosterVersion !== roster.version
        )
          throw new EditableLayerError(
            "The selected vendor/preferences changed. Review the current handoff.",
            409,
          );
        if (command.packet.costLimitCents !== null) {
          let evidence: string | null = null;
          let authorized = hasCurrentRecordedOwnerDecision(ticket);
          if (authorized) {
            evidence = ticket.owner_decision!.evidence_ref;
            packetAuthorization = {
              kind: "owner_decision",
              snapshot: JSON.stringify(ticket.owner_decision),
            };
          } else if (ticket.property_id) {
            const policyDoc = await tx.get(
              db
                .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION)
                .doc(ticket.property_id),
            );
            const policy = policyDoc.exists
              ? readMaintenancePropertyPreapprovalRecord(policyDoc.data()!)
              : null;
            authorized = evaluateMaintenanceStandingPolicy(
              ticket,
              policy,
              at,
              verifiedOwnerRefs,
            ).authorized;
            evidence = policy?.policy_terms?.evidence_ref ?? null;
            packetAuthorization = {
              kind: "standing_policy",
              snapshot: JSON.stringify(policy),
            };
          }
          if (
            !authorized ||
            !Number.isSafeInteger(ticket.estimate_amount_cents) ||
            command.packet.costLimitCents > ticket.estimate_amount_cents! ||
            command.packet.authorizationRef !== evidence
          )
            throw new EditableLayerError(
              "A handoff cost limit must stay within the current exact assessed work authorization and use its actual evidence reference.",
              409,
            );
        }
        const artifacts = command.packet.artifactIds.length
          ? await tx.getAll(
              ...command.packet.artifactIds.map((id) =>
                db.collection("maintenance_retained_artifacts").doc(id),
              ),
            )
          : [];
        if (
          artifacts.some(
            (a) =>
              !a.exists ||
              a.data()!.ticket_id !== ticketId ||
              a.data()!.state !== "retained",
          )
        )
          throw new EditableLayerError(
            "Every packet attachment must be an actual retained file in this case.",
            409,
          );
        const record: VendorPacket = {
          ...command.packet,
          ticketId,
          vendorId: selectedId,
          version: (packet?.version ?? 0) + 1,
          selectionVersion: selection!.version,
          rosterVersion: roster.version,
          authorizationBinding: packetAuthorization,
          workScope: maintenanceWorkScope(ticket),
          costBasis:
            command.packet.costLimitCents === null
              ? null
              : (ticket.estimate_cost_basis ?? null),
          recordedBy: actor.uid,
          recordedAt: at,
        };
        write = {
          ref: packetDoc.ref,
          data: record as unknown as Record<string, unknown>,
          collection: C.packets,
          current: packetDoc.data(),
        };
        summary = command.packet.reason;
        snapshot = { packet: record, previous_packet: packet };
      } else {
        if (
          !vendorPacketCurrent(
            packet,
            selection,
            roster,
            ticket,
            currentPolicy,
            verifiedOwnerRefs,
          ) ||
          packet!.version !== command.packetVersion
        )
          throw new EditableLayerError(
            "That packet is no longer current. Review changed work before recording a handoff.",
            409,
          );
        if (Date.parse(command.occurredAt) > Date.now() + 60000)
          throw new EditableLayerError(
            "A staff-recorded external handoff cannot occur in the future.",
            400,
          );
        meaning = "vendor_handoff_report";
        summary = command.reason;
        occurredAt = command.occurredAt;
        snapshot = {
          packet_version: packet!.version,
          vendor_id: selectedId,
          staff_reported_external_handoff: true,
          source_ref: command.sourceRef,
          provider_verified: false,
        };
      }
    } else {
      const docs = await tx.get(
        db
          .collection(C.contributions)
          .where("ticketId", "==", ticketId)
          .where("submissionId", "==", command.submissionId)
          .limit(2),
      );
      if (docs.size !== 1)
        throw new EditableLayerError(
          "The exact vendor submission could not be resolved.",
          409,
        );
      const d = docs.docs[0],
        current = d.data() as VendorContribution;
      if (current.version !== command.expectedSubmissionVersion)
        throw new EditableLayerError(
          "The vendor revised this submission. Review its current version.",
          409,
        );
      const reviewed: VendorContribution = {
        ...current,
        review: {
          state: command.decision,
          reason: command.reason,
          recordedBy: actor.uid,
          recordedAt: at,
        },
      };
      write = {
        ref: d.ref,
        data: reviewed as unknown as Record<string, unknown>,
        collection: C.contributions,
        current: d.data(),
      };
      summary = command.reason;
      snapshot = { submission: reviewed, previous_review: current.review };
    }
    if (write) tx.set(write.ref, stamp(write.collection, write.data, write.current));
    tx.set(ticketRef, stamp("maintenance_tickets", next, ticketDoc.data()));
    tx.create(
      op,
      stamp("maintenance_ticket_operations", {
        actor_uid: actor.uid,
        ticket_id: ticketId,
        operation_id: command.operationId,
        fingerprint,
        state: "committed",
        committed_version: next.record_version,
        created_at: at,
      }),
    );
    event(
      tx,
      db,
      next,
      { id: actor.uid, kind: "staff" },
      meaning,
      summary,
      snapshot,
      occurredAt,
      at,
    );
    return next;
  });
}
export async function readStaffVendorWork(
  actor: AuthenticatedUser,
  ticketId: string,
  db: Firestore = getAdminFirestore(),
) {
  assertMaintenanceCaseActor(actor);
  maintenanceCaseId(ticketId);
  const [ticket, selection, packet, submissions, artifacts, coreArtifacts] =
    await Promise.all([
      db.collection("maintenance_tickets").doc(ticketId).get(),
      db.collection(C.selections).doc(ticketId).get(),
      db.collection(C.packets).doc(ticketId).get(),
      db.collection(C.contributions).where("ticketId", "==", ticketId).limit(1001).get(),
      db.collection(C.artifacts).where("ticketId", "==", ticketId).limit(1001).get(),
      db
        .collection("maintenance_retained_artifacts")
        .where("ticket_id", "==", ticketId)
        .limit(1001)
        .get(),
    ]);
  if (!ticket.exists || ticket.data()!.data_mode !== "live")
    throw new EditableLayerError("That maintenance case is unavailable.", 404);
  if (submissions.size > 1000 || artifacts.size > 1000 || coreArtifacts.size > 1000)
    throw new EditableLayerError(
      "The complete vendor evidence exceeds this view's bound.",
      409,
    );
  const choice = selection.exists ? (selection.data() as VendorSelection) : null,
    record = packet.exists ? (packet.data() as VendorPacket) : null,
    roster = choice ? await db.collection(C.roster).doc(choice.vendorId).get() : null;
  const verifiedOwnerRefs = await packetOwnerRefs(
      db,
      ticket.data() as MaintenanceTicketRecord,
    ),
    policyDoc = ticket.data()!.property_id
      ? await db
          .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION)
          .doc(ticket.data()!.property_id)
          .get()
      : null,
    policy = policyDoc?.exists
      ? readMaintenancePropertyPreapprovalRecord(policyDoc.data()!)
      : null;
  return {
    coreArtifacts: coreArtifacts.docs
      .filter((d) => d.data().state === "retained")
      .map((d) => ({
        id: d.id,
        filename: String(d.data().filename),
        purpose: String(d.data().purpose),
      })),
    selection: choice,
    packet: record,
    packetCurrent: vendorPacketCurrent(
      record,
      choice,
      roster?.exists ? (roster.data() as VendorRosterRecord) : null,
      ticket.data() as MaintenanceTicketRecord,
      policy,
      verifiedOwnerRefs,
    ),
    contributions: submissions.docs.map((d) =>
      contributionView(d.data() as VendorContribution),
    ),
    artifacts: artifacts.docs.map((d) => artifactView(d.data() as StoredVendorArtifact)),
  };
}
async function currentPacketPolicy(
  tx: Transaction,
  db: Firestore,
  ticket: MaintenanceTicketRecord,
) {
  if (!ticket.property_id) return null;
  const doc = await tx.get(
    db.collection(MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION).doc(ticket.property_id),
  );
  return doc.exists ? readMaintenancePropertyPreapprovalRecord(doc.data()!) : null;
}
async function packetOwnerRefs(db: Firestore, ticket: MaintenanceTicketRecord) {
  if (!ticket.property_id) return [] as string[];
  const d = await db
    .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION)
    .doc(ticket.property_id)
    .get();
  if (d.data()?.policy_terms?.scope !== "owner") return [] as string[];
  return readCurrentMaintenancePolicyOwnerRefs(ticket.property_id).catch(() => []);
}
async function assignedPacketOwnerRefs(
  db: Firestore,
  p: VendorPrincipal,
  ticketId: string,
) {
  const ticket = await db.runTransaction(
    async (tx) => (await currentAssignment(tx, db, p, ticketId)).ticket,
  );
  return packetOwnerRefs(db, ticket);
}
function assertPrincipal(p: VendorPrincipal) {
  if (
    p.dataMode !== "live" ||
    p.emailVerified !== true ||
    p.totpVerified !== true ||
    !p.uid ||
    !p.email
  )
    throw new VendorBoundaryError("Verified current vendor access is required.", 403);
  vendorId(p.vendorId);
}
async function currentAssignment(
  tx: Transaction,
  db: Firestore,
  p: VendorPrincipal,
  ticketId: string,
) {
  assertPrincipal(p);
  maintenanceCaseId(ticketId);
  const [v, a, t] = await tx.getAll(
    db.collection("vendors").doc(p.vendorId),
    db.collection("vendor_ticket_assignments").doc(ticketId),
    db.collection("maintenance_tickets").doc(ticketId),
  );
  if (
    !v.exists ||
    !a.exists ||
    !t.exists ||
    !vendorAuthorityMatches(v.data() as VendorRecord, {
      vendorId: p.vendorId,
      uid: p.uid,
      email: p.email,
      dataMode: "live",
    }) ||
    !a.data()!.active ||
    a.data()!.vendor_id !== p.vendorId ||
    a.data()!.ticket_id !== ticketId ||
    a.data()!.data_mode !== "live" ||
    t.data()!.data_mode !== "live" ||
    t.data()!.id !== ticketId ||
    t.data()!.vendor_id !== p.vendorId
  )
    throw new VendorBoundaryError("Assigned work is unavailable.", 404);
  const generation = vendorAssignmentGeneration(
    v.data() as VendorRecord,
    a.data() as { vendor_id: string; ticket_id: string; updated_at?: string },
    t.data() as MaintenanceTicketRecord,
  );
  if (!generation)
    throw new VendorBoundaryError(
      "The current assignment needs PMI reconciliation before contributions.",
      409,
    );
  return { ticket: t.data() as MaintenanceTicketRecord, generation };
}
function contributionView(r: VendorContribution): VendorContribution {
  return {
    submissionId: r.submissionId,
    assignmentGeneration: r.assignmentGeneration,
    kind: r.kind,
    description: r.description,
    occurredAt: r.occurredAt,
    quoteBasis: r.quoteBasis,
    lines: r.lines.map((l) => ({
      description: l.description,
      amountCents: l.amountCents,
    })),
    invoiceId: r.invoiceId,
    ...(r.invoiceMeaning ? { invoiceMeaning: r.invoiceMeaning } : {}),
    issueDate: r.issueDate,
    serviceDate: r.serviceDate,
    proposedStart: r.proposedStart,
    proposedEnd: r.proposedEnd,
    progressKind: r.progressKind,
    unresolvedIssues: r.unresolvedIssues,
    artifactIds: r.artifactIds,
    revisionReason: r.revisionReason,
    ticketId: r.ticketId,
    vendorId: r.vendorId,
    version: r.version,
    recordedBy: r.recordedBy,
    recordedAt: r.recordedAt,
    review: {
      state: r.review.state,
      reason: r.review.reason,
      recordedBy: r.review.recordedBy,
      recordedAt: r.review.recordedAt,
    },
  };
}
export async function submitVendorContribution(
  p: VendorPrincipal,
  ticketId: string,
  input: VendorContributionInput,
  db: Firestore = getAdminFirestore(),
) {
  assertPrincipal(p);
  const command = VendorContributionInputSchema.parse(input),
    fingerprint = sha(command),
    ref = db
      .collection(C.contributions)
      .doc(submissionKey(ticketId, p.vendorId, command.submissionId)),
    operation = db
      .collection(C.operations)
      .doc(sha([p.uid, ticketId, command.operationId]));
  return db.runTransaction(async (tx) => {
    const { ticket, generation } = await currentAssignment(tx, db, p, ticketId),
      [prior, current] = await tx.getAll(operation, ref);
    if (prior.exists) {
      if (prior.data()!.fingerprint !== fingerprint)
        throw new VendorBoundaryError(
          "That original submission identity records different content.",
          409,
        );
      return contributionView(current.data() as VendorContribution);
    }
    if (generation !== command.assignmentGeneration)
      throw new VendorBoundaryError(
        "The assignment changed. Keep your words and read current assigned work before submitting.",
        409,
      );
    const previous = current.exists ? (current.data() as VendorContribution) : null;
    if (
      (previous?.version ?? 0) !== command.expectedSubmissionVersion ||
      (previous && previous.kind !== command.kind)
    )
      throw new VendorBoundaryError(
        "The original submission changed. Read its current version before an explicit revision.",
        409,
      );
    if (Date.parse(command.occurredAt) > Date.now() + 60000)
      throw new VendorBoundaryError(
        "Record actual occurred work; future visits belong in a schedule proposal.",
        400,
      );
    const artifacts = command.artifactIds.length
      ? await tx.getAll(
          ...command.artifactIds.map((id) => db.collection(C.artifacts).doc(id)),
        )
      : [];
    if (
      artifacts.some(
        (a) =>
          !a.exists ||
          a.data()!.ticketId !== ticketId ||
          a.data()!.vendorId !== p.vendorId ||
          a.data()!.state !== "retained",
      )
    )
      throw new VendorBoundaryError(
        "Reference only your retained artifacts in this assigned case.",
        409,
      );
    if (
      command.kind === "invoice" &&
      !artifacts.some(
        (a) =>
          a.data()!.purpose === "invoice" &&
          ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
            String(a.data()!.mimeType),
          ),
      )
    )
      throw new VendorBoundaryError(
        "An invoice or credit needs its original retained invoice document, not an unrelated work photo.",
        409,
      );
    if (!previous) {
      const count = await tx.get(
        db.collection(C.contributions).where("ticketId", "==", ticketId).limit(1001),
      );
      if (
        command.kind === "invoice" &&
        count.docs.some(
          (d) =>
            d.data().vendorId === p.vendorId &&
            d.data().kind === "invoice" &&
            d.data().invoiceId === command.invoiceId,
        )
      )
        throw new VendorBoundaryError(
          "This invoice identity is already recorded in this case. Keep these words and explicitly revise its original report; a second invoice entry was not created.",
          409,
        );
      if (count.size >= 1000)
        throw new VendorBoundaryError(
          "This case has reached its bounded contribution limit.",
          409,
        );
    }
    const { operationId, expectedSubmissionVersion, ...terms } = command;
    void expectedSubmissionVersion;
    const at = new Date().toISOString(),
      record: VendorContribution = {
        ...terms,
        ticketId,
        vendorId: p.vendorId,
        version: (previous?.version ?? 0) + 1,
        recordedBy: p.uid,
        recordedAt: at,
        review: { state: "pending", reason: "", recordedBy: null, recordedAt: null },
      };
    tx.set(ref, stamp(C.contributions, { ...record }, current.data()));
    tx.create(
      operation,
      stamp(C.operations, {
        vendorId: p.vendorId,
        actorUid: p.uid,
        ticketId,
        operationId,
        fingerprint,
        submissionId: command.submissionId,
        committedVersion: record.version,
        createdAt: at,
      }),
    );
    event(
      tx,
      db,
      ticket,
      { id: p.vendorId, kind: "vendor" },
      `vendor_${command.kind}`,
      command.description,
      { submission: record, previous_submission: previous },
      command.occurredAt,
      at,
    );
    return record;
  });
}
export async function readVendorWork(
  p: VendorPrincipal,
  ticketId: string,
  operationId?: string,
  db: Firestore = getAdminFirestore(),
) {
  assertPrincipal(p);
  if (operationId) z.string().uuid().parse(operationId);
  const verifiedOwnerRefs = await assignedPacketOwnerRefs(db, p, ticketId);
  return db.runTransaction(async (tx) => {
    const { ticket, generation } = await currentAssignment(tx, db, p, ticketId),
      [packet, selection, roster, submissions, artifacts, operation] = await Promise.all([
        tx.get(db.collection(C.packets).doc(ticketId)),
        tx.get(db.collection(C.selections).doc(ticketId)),
        tx.get(db.collection(C.roster).doc(p.vendorId)),
        tx.get(
          db
            .collection(C.contributions)
            .where("ticketId", "==", ticketId)
            .where("vendorId", "==", p.vendorId)
            .limit(1001),
        ),
        tx.get(
          db
            .collection(C.artifacts)
            .where("ticketId", "==", ticketId)
            .where("vendorId", "==", p.vendorId)
            .limit(1001),
        ),
        operationId
          ? tx.get(db.collection(C.operations).doc(sha([p.uid, ticketId, operationId])))
          : null,
      ]);
    if (submissions.size > 1000 || artifacts.size > 1000)
      throw new VendorBoundaryError(
        "The complete assigned history exceeds this view's bound.",
        409,
      );
    const currentPolicy = await currentPacketPolicy(tx, db, ticket);
    const projection: VendorTicketProjection = {
      id: ticket.id,
      status: ticket.status,
      priority: ticket.priority,
      summary: ticket.summary,
      unitLabel: ticket.unit?.label ?? null,
      updatedAt: ticket.updated_at,
      dataMode: "live",
      assignmentGeneration: generation,
      reviewedPacket: reviewedVendorPacket(
        packet.exists ? (packet.data() as VendorPacket) : null,
        selection.exists ? (selection.data() as VendorSelection) : null,
        roster.exists && roster.data()!.contactEmail === p.email.toLowerCase()
          ? (roster.data() as VendorRosterRecord)
          : null,
        ticket,
        p.vendorId,
        currentPolicy,
        verifiedOwnerRefs,
      ),
    };
    return {
      ticket: projection,
      contributions: submissions.docs.map((d) =>
        contributionView(d.data() as VendorContribution),
      ),
      artifacts: artifacts.docs.map((d) =>
        artifactView(d.data() as StoredVendorArtifact),
      ),
      operation: operationId
        ? {
            operationId,
            state: operation?.exists ? "committed" : "not_recorded",
            committedVersion: operation?.data()?.committedVersion ?? null,
            detail: operation?.exists
              ? "Original app submission recorded; no provider effect or final closure was established."
              : "No settled original receipt is recorded. Absence does not prove failure; preserve this exact intent.",
          }
        : null,
    };
  });
}
interface StoredVendorArtifact extends VendorArtifact {
  fingerprint: string;
  content: PublicationContentReference;
}
function artifactView(r: StoredVendorArtifact): VendorArtifact {
  return {
    id: r.id,
    ticketId: r.ticketId,
    vendorId: r.vendorId,
    filename: r.filename,
    mimeType: r.mimeType,
    purpose: r.purpose,
    sha256: r.sha256,
    sizeBytes: r.sizeBytes,
    state: r.state,
    assignmentGeneration: r.assignmentGeneration,
    recordedBy: r.recordedBy,
    recordedAt: r.recordedAt,
  };
}
export async function uploadVendorArtifact(
  p: VendorPrincipal,
  ticketId: string,
  input: VendorArtifactInput,
  db: Firestore = getAdminFirestore(),
) {
  assertPrincipal(p);
  const command = VendorArtifactInputSchema.parse(input),
    bytes = Buffer.from(command.base64, "base64"),
    hash = createHash("sha256").update(bytes).digest("hex");
  if (bytes.toString("base64") !== command.base64)
    throw new VendorBoundaryError("Use exact selected file bytes.", 400);
  try {
    validateWorkflowAttachment({ ...command, bytes, sha256: hash });
  } catch {
    throw new VendorBoundaryError(
      "Use a passive PDF, JPEG, PNG or WebP up to 5 MiB with matching name/type.",
      400,
    );
  }
  const { base64, ...terms } = command;
  void base64;
  const fingerprint = sha([p.uid, ticketId, terms, hash]),
    ref = db.collection(C.artifacts).doc(command.operationId),
    contentId = `maintenance_artifact_vendor_${command.operationId}`,
    record = await db.runTransaction(async (tx) => {
      const { generation } = await currentAssignment(tx, db, p, ticketId),
        prior = await tx.get(ref);
      if (prior.exists) {
        const a = prior.data() as StoredVendorArtifact;
        if (
          a.fingerprint !== fingerprint ||
          a.vendorId !== p.vendorId ||
          a.ticketId !== ticketId
        )
          throw new VendorBoundaryError(
            "Recover the exact original file; this identity records different bytes or work.",
            409,
          );
        if (a.state === "retained") return a;
      }
      if (generation !== command.assignmentGeneration)
        throw new VendorBoundaryError(
          "The current assignment changed before file retention.",
          409,
        );
      if (prior.exists) return prior.data() as StoredVendorArtifact;
      const count = await tx.get(
        db.collection(C.artifacts).where("ticketId", "==", ticketId).limit(1001),
      );
      if (count.size >= 1000)
        throw new VendorBoundaryError(
          "This case has reached its bounded vendor-artifact limit.",
          409,
        );
      const a: StoredVendorArtifact = {
        id: command.operationId,
        ticketId,
        vendorId: p.vendorId,
        filename: command.filename,
        mimeType: command.mimeType,
        purpose: command.purpose,
        sha256: hash,
        sizeBytes: bytes.length,
        state: "uploading",
        assignmentGeneration: generation,
        recordedBy: p.uid,
        recordedAt: new Date().toISOString(),
        fingerprint,
        content: {
          contentId,
          contentHash: hash,
          storage: "firestore-chunks-v1",
          byteSize: bytes.length,
          chunkCount: Math.ceil(bytes.length / (384 * 1024)),
        },
      };
      tx.create(ref, stamp(C.artifacts, { ...a }));
      return a;
    });
  if (record.state === "retained") return artifactView(record);
  try {
    const store = new FirestorePublicationContentStore(db);
    await store.putImmutable({ contentId, contentHash: hash, content: bytes });
    await store.read(record.content);
    for (let index = 0; index < record.content.chunkCount; index++) {
      const chunk = db
        .collection("publication_content_chunks")
        .doc(publicationContentChunkDocumentId(contentId, index));
      await db.runTransaction(async (tx) => {
        const s = await tx.get(chunk);
        if (!s.exists) throw Error("Missing retained chunk");
        tx.set(chunk, stamp(C.artifacts, s.data()!, s.data()));
      });
    }
    return db.runTransaction(async (tx) => {
      const { ticket, generation } = await currentAssignment(tx, db, p, ticketId),
        prior = await tx.get(ref),
        a = prior.data() as StoredVendorArtifact;
      if (generation !== a.assignmentGeneration)
        throw new VendorBoundaryError(
          "Assignment changed during upload. PMI must reconcile the retained original; no new artifact was submitted.",
          409,
        );
      if (a.state === "retained") return artifactView(a);
      const retained = stamp(
        C.artifacts,
        { ...a, state: "retained" as const },
        prior.data(),
      );
      tx.set(ref, retained);
      event(
        tx,
        db,
        ticket,
        { id: p.vendorId, kind: "vendor" },
        "vendor_artifact",
        `Vendor retained ${a.purpose}: ${a.filename}`,
        { artifact: artifactView(retained) },
        a.recordedAt,
        new Date().toISOString(),
      );
      return artifactView(retained);
    });
  } catch (error) {
    if (error instanceof VendorBoundaryError) throw error;
    throw new VendorBoundaryError(
      "The file outcome is unresolved. Check and resume only this exact original file; no duplicate was created.",
      409,
    );
  }
}
export async function readVendorArtifact(
  p: VendorPrincipal,
  ticketId: string,
  id: string,
  db: Firestore = getAdminFirestore(),
  download = false,
) {
  assertPrincipal(p);
  z.string().uuid().parse(id);
  const artifact = await db.runTransaction(async (tx) => {
    await currentAssignment(tx, db, p, ticketId);
    const doc = await tx.get(db.collection(C.artifacts).doc(id)),
      a = doc.data() as StoredVendorArtifact | undefined;
    if (!a || a.vendorId !== p.vendorId || a.ticketId !== ticketId)
      throw new VendorBoundaryError("Assigned artifact is unavailable.", 404);
    return a;
  });
  const bytes =
    download && artifact.state === "retained"
      ? await new FirestorePublicationContentStore(db).read(artifact.content)
      : null;
  if (download)
    await db.runTransaction(async (tx) => {
      await currentAssignment(tx, db, p, ticketId);
    });
  return { artifact: artifactView(artifact), bytes };
}

export async function readVendorPacketArtifact(
  p: VendorPrincipal,
  ticketId: string,
  id: string,
  db: Firestore = getAdminFirestore(),
  download = false,
) {
  assertPrincipal(p);
  z.string().uuid().parse(id);
  const verifiedOwnerRefs = await assignedPacketOwnerRefs(db, p, ticketId);
  const resolve = () =>
    db.runTransaction(async (tx) => {
      const { ticket } = await currentAssignment(tx, db, p, ticketId),
        [packet, selection, roster, file] = await tx.getAll(
          db.collection(C.packets).doc(ticketId),
          db.collection(C.selections).doc(ticketId),
          db.collection(C.roster).doc(p.vendorId),
          db.collection("maintenance_retained_artifacts").doc(id),
        );
      const currentPolicy = await currentPacketPolicy(tx, db, ticket);
      const projection = reviewedVendorPacket(
          packet.exists ? (packet.data() as VendorPacket) : null,
          selection.exists ? (selection.data() as VendorSelection) : null,
          roster.exists && roster.data()!.contactEmail === p.email.toLowerCase()
            ? (roster.data() as VendorRosterRecord)
            : null,
          ticket,
          p.vendorId,
          currentPolicy,
          verifiedOwnerRefs,
        ),
        record = file.data();
      if (
        !projection?.artifactIds.includes(id) ||
        !record ||
        record.ticket_id !== ticketId ||
        record.state !== "retained"
      )
        throw new VendorBoundaryError(
          "Reviewed assigned attachment is unavailable.",
          404,
        );
      return record;
    });
  const file = await resolve(),
    bytes = download
      ? await new FirestorePublicationContentStore(db).read(
          file.content as PublicationContentReference,
        )
      : null;
  if (download) await resolve();
  return {
    artifact: {
      id,
      filename: String(file.filename),
      mimeType: String(file.mimeType),
      sha256: String(file.sha256),
      sizeBytes: Number(file.sizeBytes),
    },
    bytes,
  };
}
export async function readStaffVendorArtifact(
  actor: AuthenticatedUser,
  ticketId: string,
  id: string,
  db: Firestore = getAdminFirestore(),
  download = false,
) {
  assertMaintenanceCaseActor(actor);
  maintenanceCaseId(ticketId);
  z.string().uuid().parse(id);
  const [ticket, doc] = await Promise.all([
      db.collection("maintenance_tickets").doc(ticketId).get(),
      db.collection(C.artifacts).doc(id).get(),
    ]),
    record = doc.data() as StoredVendorArtifact | undefined;
  if (
    !ticket.exists ||
    ticket.data()!.data_mode !== "live" ||
    !record ||
    record.ticketId !== ticketId
  )
    throw new EditableLayerError(
      "That vendor evidence is unavailable in this case.",
      404,
    );
  return {
    artifact: artifactView(record),
    bytes:
      download && record.state === "retained"
        ? await new FirestorePublicationContentStore(db).read(record.content)
        : null,
  };
}
