import type { Firestore } from "firebase-admin/firestore";
import { createHash, randomUUID } from "node:crypto";
import { can, type Capability } from "@/lib/auth/roles";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { canAccessSpaceId } from "@/lib/space-scope-resources";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { getAdminFirestore } from "./admin";
import { EditableLayerError } from "./errors";
import {
  getCurrentPacketSnapshot,
  LEASE_DOCUMENT_PACKET_COLLECTIONS,
  packetHeadId,
} from "./lease-document-packet-snapshots";
import { canonicalJson, hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  resolveLivePacketInput,
  resolveOwnerAcknowledgmentInput,
  PACKET_SOURCE_COLLECTIONS,
} from "@/lib/lease-documents/live-input";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import type {
  LeaseArtifactVersion,
  PacketEvaluationInput,
  RenewalPacketSnapshot,
} from "@/lib/lease-documents/packet-types";
import type { ArtifactFieldMap } from "@/lib/lease-documents/artifact-intake-contract";
import { PET_PROCESSING_FEE_FACT } from "@/lib/lease-documents/charge-policy";
import { formHoldLabels } from "@/lib/lease-documents/form-holds";
import { formNotesOf } from "@/lib/lease-documents/form-notes";
import {
  ownerAcknowledgmentTransactionId,
  packetFilesPreparable,
} from "@/lib/lease-documents/owner-acknowledgment";
import {
  lostPrintedText,
  petFeeConsistencyIssues,
} from "@/lib/lease-documents/prepared-form-checks";
import { readArtifactIntakeManifest } from "./lease-artifact-intake";
import {
  readHistoricalApprovedArtifact,
  resolveApprovedDotloopArtifact,
} from "@/lib/lease-documents/approved-artifact-content";
import {
  buildFillWorksheet,
  mapHashOf,
  slotOverflowMessage,
} from "@/lib/lease-documents/artifact-intake";
import {
  fillAcroformPdf,
  readAcroformValues,
  type PdfFillValue,
} from "@/lib/lease-documents/acroform-pdf";
import {
  STATIC_ADAPTER,
  fillStaticPdf,
  formatStaticValue,
  readStaticPdfValuesByOrder,
  type StaticRegionValue,
} from "@/lib/lease-documents/static-pdf";
import {
  FirestorePublicationContentStore,
  type PublicationContentStore,
} from "@/lib/publication/content";
import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";
import {
  renewalWorkspaceDocId,
  RENEWAL_WORKSPACE_COLLECTIONS,
} from "./renewal-workspace";
import {
  ApproveDerivedArtifactSchema,
  PrepareDerivedArtifactSchema,
  type DerivedArtifactRecord,
  type DerivedArtifactRequest,
} from "@/lib/lease-documents/derived-artifact-contract";

export {
  DERIVED_ARTIFACT_COLLECTIONS,
  derivedHeadId,
} from "@/lib/lease-documents/derived-artifact-contract";
import {
  DERIVED_ARTIFACT_COLLECTIONS,
  derivedHeadId,
  derivedArtifactProvenance as provenance,
} from "@/lib/lease-documents/derived-artifact-contract";
export interface DerivedContext {
  input: PacketEvaluationInput;
  snapshot: RenewalPacketSnapshot | null;
  guards?: Array<{ collection: string; id: string; hash: string }>;
}
export interface DerivedArtifactDeps {
  /**
   * The lease's current packet context. S253: when the named snapshot is the lease's current owner
   * acknowledgment, the context is that packet's; otherwise it is the tenant packet's, as before.
   */
  resolve: (
    actor: AuthenticatedUser,
    leaseId: string,
    snapshotId?: string,
  ) => Promise<DerivedContext>;
  original: typeof resolveApprovedDotloopArtifact;
  historicalOriginal?: typeof readHistoricalApprovedArtifact;
  content: PublicationContentStore;
  now: () => string;
  /** S253: the reviewed map of an unchanged approved attachment, for its form notes. */
  attachmentMap?: (artifact: LeaseArtifactVersion) => Promise<ArtifactFieldMap | null>;
}
export function derivedArtifactDeps(db: Firestore): DerivedArtifactDeps {
  return {
    attachmentMap: async (artifact) => {
      const entry = (await readArtifactIntakeManifest(db)).entries[artifact.kind];
      return entry?.state === "approved" &&
        entry.fieldMap &&
        entry.publication?.reference === artifact.publicationSource.reference &&
        entry.publication.contentHash === artifact.contentHash
        ? entry.fieldMap
        : null;
    },
    resolve: async (actor, leaseId, snapshotId) => {
      const observedAt = new Date().toISOString();
      const [resolved, tenantSnapshot] = await Promise.all([
        resolveLivePacketInput(actor, leaseId, leaseId, observedAt, db),
        getCurrentPacketSnapshot(actor, leaseId, leaseId, db),
      ]);
      // S253: a request that names the lease's current owner acknowledgment snapshot reads that
      // packet. Every other request reads the tenant packet exactly as before.
      const ownerSnapshot =
        snapshotId && tenantSnapshot?.snapshotId !== snapshotId
          ? await getCurrentPacketSnapshot(
              actor,
              leaseId,
              ownerAcknowledgmentTransactionId(leaseId),
              db,
            )
          : null;
      const owner = ownerSnapshot !== null && ownerSnapshot.snapshotId === snapshotId;
      const snapshot = owner ? ownerSnapshot : tenantSnapshot;
      const input = owner
        ? await resolveOwnerAcknowledgmentInput(resolved, observedAt, db)
        : resolved.input;
      // S34: the current work record is the dated head when one exists, otherwise the
      // lease-bound head; guarding only the dated head refused every lease-bound record.
      const [dated, leaseBound] = await Promise.all([
        db
          .collection(RENEWAL_WORKSPACE_COLLECTIONS.head)
          .doc(renewalWorkspaceDocId(leaseId))
          .get(),
        db
          .collection(RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead)
          .doc(renewalWorkspaceDocId(leaseId))
          .get(),
      ]);
      const workspace = dated.exists ? dated : leaseBound;
      const workspaceCollection = dated.exists
        ? RENEWAL_WORKSPACE_COLLECTIONS.head
        : RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead;
      if (
        hashExecutionPreview(workspace.data() ?? {}) !==
        hashExecutionPreview({ ...resolved.workspace })
      )
        fail("The workspace changed while resolving document inputs.");
      return {
        input,
        snapshot,
        guards: [
          {
            collection: PACKET_SOURCE_COLLECTIONS.catalog,
            id: "current",
            hash: resolved.catalogRecordHash,
          },
          {
            collection: PACKET_SOURCE_COLLECTIONS.sources,
            id: renewalWorkspaceDocId(leaseId),
            hash: resolved.mappingRecordHash,
          },
          {
            collection: workspaceCollection,
            id: renewalWorkspaceDocId(leaseId),
            hash: hashExecutionPreview(workspace.data() ?? {}),
          },
          // S66: the staff inputs, charge policy and Working terms the output was filled from.
          {
            collection: "lease_document_packet_inputs",
            id: renewalWorkspaceDocId(leaseId),
            hash: resolved.packetInputsRecordHash,
          },
          {
            collection: "lease_charge_policies",
            id: "current",
            hash: resolved.chargePolicyRecordHash,
          },
          {
            collection: "lease_renewal_working_records",
            id: renewalWorkspaceDocId(leaseId),
            hash: resolved.workingRecordHash,
          },
        ],
      };
    },
    original: resolveApprovedDotloopArtifact,
    historicalOriginal: readHistoricalApprovedArtifact,
    content: new FirestorePublicationContentStore(db),
    now: () => new Date().toISOString(),
  };
}
function allowed(actor: AuthenticatedUser, capability: Capability) {
  if (!can(actor.role, capability) || !canAccessSpaceId(actor, "renewals"))
    throw new EditableLayerError(
      "This user cannot access this renewal artifact operation.",
      403,
    );
  if (capability !== "read") {
    if (isVerificationAccount(actor))
      throw new EditableLayerError(
        "Verification accounts cannot prepare or approve artifacts.",
        403,
      );
    assertMutationAllowed(requireEnvironmentDescriptor());
  }
}
function fail(message: string): never {
  throw new EditableLayerError(message, 409);
}
/**
 * S130: the comparison a record keeps. A static output carries its geometry's region order, never
 * the order of an object's keys, which puts integer-like region ids first.
 */
function comparisonOf(
  filled:
    | Awaited<ReturnType<typeof fillAcroformPdf>>
    | Awaited<ReturnType<typeof fillStaticPdf>>,
): DerivedArtifactRecord["comparison"] {
  return filled.comparison as DerivedArtifactRecord["comparison"];
}
/** The values a saved output reads back as, by the route that wrote it. */
async function outputValues(
  adapter: string,
  content: Uint8Array,
  comparison: DerivedArtifactRecord["comparison"],
) {
  return adapter === STATIC_ADAPTER
    ? readStaticPdfValuesByOrder(content, comparison.regionOrder ?? [])
    : readAcroformValues(content);
}
/**
 * Whether a saved output reads back as the values its comparison records. A map read back from
 * Firestore need not keep its key order, so both sides are compared as canonical JSON.
 */
async function readsBackAs(
  adapter: string,
  content: Uint8Array,
  comparison: DerivedArtifactRecord["comparison"],
) {
  return (
    canonicalJson(await outputValues(adapter, content, comparison)) ===
    canonicalJson(comparison.allFields)
  );
}
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function currentArtifact(
  context: DerivedContext,
  request: DerivedArtifactRequest,
  mutable = false,
): LeaseArtifactVersion {
  const snapshot = context.snapshot;
  if (
    !snapshot ||
    !snapshot.current ||
    snapshot.snapshotId !== request.snapshotId ||
    snapshot.leaseId !== request.leaseId ||
    context.input.leaseId !== request.leaseId ||
    evaluateRenewalPacket(context.input).payloadHash !== snapshot.payloadHash ||
    // S253: an owner acknowledgment may be prepared while the tenant packet's execution proof
    // is the only thing it lacks; every other packet must be ready for preview.
    !packetFilesPreparable(snapshot)
  )
    fail("The packet or its sources changed. Evaluate and review current truth.");
  if (mutable && snapshot.execution)
    fail(
      "A packet with provider execution evidence cannot replace or approve document bytes.",
    );
  const matches = context.input.catalog.artifacts.filter(
    (artifact) =>
      artifact.artifactId === request.artifactId &&
      artifact.status === "active" &&
      snapshot.manifest?.includedArtifacts.some(
        (item) => item.artifactId === artifact.artifactId,
      ),
  );
  const artifact = matches[0];
  if (
    matches.length !== 1 ||
    !artifact.fillMapping ||
    artifact.fillMapping.mapHash !== mapHashOf(artifact.fillMapping.map) ||
    artifact.fillMapping.map.templateVersion !== artifact.publicationSource.reference
  )
    fail("An exact approved field or region mapping in this packet is required.");
  return artifact;
}
function inputHash(context: DerivedContext, artifact: LeaseArtifactVersion) {
  return hashExecutionPreview({
    packetHash: context.snapshot!.payloadHash,
    input: context.input,
    mappingHash: artifact.fillMapping!.mapHash,
  });
}
async function guardedRead(
  transaction: Parameters<Parameters<Firestore["runTransaction"]>[0]>[0],
  db: Firestore,
  context: DerivedContext,
) {
  const snapshot = context.snapshot!;
  const head = await transaction.get(
    db
      .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.heads)
      .doc(packetHeadId(snapshot.leaseId, snapshot.transactionId)),
  );
  if (
    head.data()?.snapshot_id !== snapshot.snapshotId ||
    head.data()?.payload_hash !== snapshot.payloadHash
  )
    fail("The current packet changed during review.");
  const execution = await transaction.get(
    db
      .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.executionProjections)
      .doc(snapshot.snapshotId),
  );
  if (execution.exists)
    fail("Provider execution has started; the packet's document bytes are frozen.");
  const freeze = await transaction.get(
    db.collection(DERIVED_ARTIFACT_COLLECTIONS.freezes).doc(snapshot.snapshotId),
  );
  if (freeze.exists)
    fail("A provider attempt has claimed this packet; its document bytes are frozen.");
  for (const guard of context.guards ?? []) {
    const source = await transaction.get(db.collection(guard.collection).doc(guard.id));
    if (hashExecutionPreview(source.data() ?? {}) !== guard.hash)
      fail("Approved source mappings changed during review.");
  }
}
async function recordById(id: string, db: Firestore): Promise<DerivedArtifactRecord> {
  const data = (
    await db.collection(DERIVED_ARTIFACT_COLLECTIONS.records).doc(id).get()
  ).data() as unknown as DerivedArtifactRecord | undefined;
  if (
    !data ||
    data.schemaVersion !== "approved-derived-pdf/v1" ||
    data.id !== id ||
    data.provenanceHash !== provenance(data)
  )
    fail("The filled artifact record is unavailable or inconsistent.");
  return data;
}
export async function readCurrentDerivedArtifact(
  actor: AuthenticatedUser,
  request: DerivedArtifactRequest,
  db = getAdminFirestore(),
  deps = derivedArtifactDeps(db),
) {
  allowed(actor, "read");
  const context = await deps.resolve(actor, request.leaseId, request.snapshotId);
  const artifact = currentArtifact(context, request);
  const head = await db
    .collection(DERIVED_ARTIFACT_COLLECTIONS.heads)
    .doc(derivedHeadId(request.snapshotId, request.artifactId))
    .get();
  if (!head.exists) return null;
  const record = await recordById(String(head.data()?.id ?? ""), db);
  validateCurrent(record, context, artifact);
  return record;
}

/**
 * S253 (R-S253-8, R-S253-9, R-S253-10, R-S253-11): what a form says about itself on this lease:
 * what it leaves blank, the question this lease raises, the text it prints and what it waits for.
 * Every part is absent when the form has nothing to say, so a form without any reads as before.
 */
function formStatusNotes(
  context: DerivedContext,
  artifact: LeaseArtifactVersion,
  map: ArtifactFieldMap | null,
) {
  const manifest = context.snapshot?.manifest;
  const tenants = manifest
    ? manifest.participants.filter((participant) => participant.kind === "tenant").length
    : null;
  const notes = formNotesOf(map, manifest?.audience === "tenant" ? tenants : null);
  const holds = formHoldLabels(manifest?.formHolds, artifact.kind);
  return {
    ...(notes.notes.length ? { notes: notes.notes } : {}),
    ...(notes.questions.length ? { questions: notes.questions } : {}),
    ...(notes.printed.length ? { printed: notes.printed } : {}),
    ...(notes.mapIssues.length ? { mapIssues: notes.mapIssues } : {}),
    ...(holds.length ? { holds } : {}),
  };
}

export async function readDerivedArtifactStatus(
  actor: AuthenticatedUser,
  request: DerivedArtifactRequest,
  db = getAdminFirestore(),
  deps = derivedArtifactDeps(db),
) {
  allowed(actor, "read");
  const context = await deps.resolve(actor, request.leaseId, request.snapshotId);
  const artifact = context.input.catalog.artifacts.find(
    (item) =>
      item.artifactId === request.artifactId &&
      context.snapshot?.snapshotId === request.snapshotId &&
      context.snapshot.manifest?.includedArtifacts.some(
        (included) => included.artifactId === item.artifactId,
      ),
  );
  if (!artifact) fail("The document does not belong to the current packet.");
  if (!artifact.fillMapping) {
    if (!artifact.unchangedAttachment)
      return {
        supported: false,
        reason:
          "This original needs a reviewed field or region mapping before a filled PDF can be prepared. Until then a person completes it in Dotloop.",
        record: null,
      };
    const documentRef = artifact.providerBindings?.dotloopDocumentRef;
    const status = formStatusNotes(
      context,
      artifact,
      (await deps.attachmentMap?.(artifact).catch(() => null)) ?? null,
    );
    return {
      supported: false,
      unchangedAttachment: true,
      reason:
        "Unchanged approved attachment: it has no variable values and is used exactly as approved.",
      record: null,
      ...status,
      // A form with protected areas offers its exact approved file for inspection: it is the
      // file the packet uses, byte for byte, so its protected areas can be seen untouched.
      ...(documentRef &&
      Object.keys(status).length > 0 &&
      context.snapshot?.transactionId === request.leaseId
        ? {
            originalHref: `/api/lease-renewal/document-artifact?${new URLSearchParams({ leaseId: request.leaseId, documentRef })}`,
          }
        : {}),
    };
  }
  const status = formStatusNotes(context, artifact, artifact.fillMapping.map);
  // A held form has no output to read: it waits, and the packet's other forms go on.
  if (status.holds || status.mapIssues)
    return { supported: true, record: null, ...status };
  return {
    supported: true,
    record: await readCurrentDerivedArtifact(actor, request, db, deps),
    ...status,
  };
}

/** Immutable audit access does not depend on current catalog, source, cycle or packet heads. */
export async function readHistoricalDerivedArtifactContent(
  actor: AuthenticatedUser,
  request: DerivedArtifactRequest & { derivedId: string; requireApproval?: boolean },
  db = getAdminFirestore(),
  deps = derivedArtifactDeps(db),
) {
  allowed(actor, "read");
  const record = await recordById(request.derivedId, db);
  if (
    record.leaseId !== request.leaseId ||
    record.snapshotId !== request.snapshotId ||
    record.artifactId !== request.artifactId
  )
    fail("The retained artifact does not belong to this lease and packet.");
  if (
    request.requireApproval &&
    (!record.approval ||
      record.approval.outputHash !== record.outputHash ||
      record.approval.provenanceHash !== record.provenanceHash)
  )
    fail("The retained artifact lacks its exact approval.");
  if (!deps.historicalOriginal) fail("The retained original reader is unavailable.");
  const original = await deps.historicalOriginal(actor, record);
  const content = await deps.content.read(record.contentRef);
  if (
    sha(content) !== record.outputHash ||
    !(await readsBackAs(record.adapter, content, record.comparison))
  )
    fail("The retained filled output failed byte readback.");
  return {
    record,
    content,
    original,
    fileName: record.fileName,
    contentType: "application/pdf",
  };
}
export async function listDerivedArtifactHistory(
  actor: AuthenticatedUser,
  leaseId: string,
  db = getAdminFirestore(),
) {
  allowed(actor, "read");
  if (!/^[1-9]\d*$/.test(leaseId))
    throw new EditableLayerError("An exact lease is required.", 400);
  const result = await db
    .collection(DERIVED_ARTIFACT_COLLECTIONS.records)
    .where("leaseId", "==", leaseId)
    .limit(100)
    .get();
  const records = await Promise.all(result.docs.map((doc) => recordById(doc.id, db)));
  return {
    records: records
      .sort((a, b) => b.preparedAt.localeCompare(a.preparedAt))
      .map((record) => ({
        id: record.id,
        leaseId: record.leaseId,
        snapshotId: record.snapshotId,
        artifactId: record.artifactId,
        fileName: record.fileName,
        preparedAt: record.preparedAt,
        outputHash: record.outputHash,
        approved: Boolean(
          record.approval?.outputHash === record.outputHash &&
          record.approval?.provenanceHash === record.provenanceHash,
        ),
      })),
    bounded: result.docs.length === 100,
  };
}
function validateCurrent(
  record: DerivedArtifactRecord,
  context: DerivedContext,
  artifact: LeaseArtifactVersion,
) {
  if (
    record.leaseId !== context.input.leaseId ||
    record.snapshotId !== context.snapshot!.snapshotId ||
    record.packetHash !== context.snapshot!.payloadHash ||
    record.artifactId !== artifact.artifactId ||
    record.originalHash !== artifact.contentHash ||
    record.originalPublication !== artifact.publicationSource.reference ||
    record.mapHash !== artifact.fillMapping!.mapHash ||
    record.inputSnapshotHash !== inputHash(context, artifact)
  )
    fail(
      "The filled output is stale. Prepare and review a new output from current sources.",
    );
}
export async function prepareDerivedArtifact(
  actor: AuthenticatedUser,
  raw: unknown,
  db = getAdminFirestore(),
  deps = derivedArtifactDeps(db),
) {
  allowed(actor, "edit");
  const request = PrepareDerivedArtifactSchema.parse(raw);
  const context = await deps.resolve(actor, request.leaseId, request.snapshotId);
  const artifact = currentArtifact(context, request, true);
  // S253 (R-S253-11): a form that waits on a named input is never prepared, and says what it
  // waits for. The packet's other forms are prepared as usual.
  const waiting = formHoldLabels(context.snapshot!.manifest?.formHolds, artifact.kind);
  if (waiting.length)
    fail(
      `${artifact.label} waits: ${waiting
        .map((need) => (/[.!?]$/.test(need) ? need : `${need}.`))
        .join(" ")} The lease's other forms can be prepared.`,
    );
  // S253: a map that would answer an open question for the business is refused with the reason.
  const openQuestionIssues = formNotesOf(artifact.fillMapping!.map).mapIssues;
  if (openQuestionIssues.length) fail(openQuestionIssues.join(" "));
  const requestHash = hashExecutionPreview({
    ...request,
    actorUid: actor.uid,
    inputSnapshotHash: inputHash(context, artifact),
  });
  const id = `filled_${hashExecutionPreview({ leaseId: request.leaseId, operationId: request.operationId })}`;
  const recordRef = db.collection(DERIVED_ARTIFACT_COLLECTIONS.records).doc(id);
  const previous = await recordRef.get();
  if (previous.exists) {
    const record = await recordById(id, db);
    if (record.requestHash !== requestHash)
      fail("This preparation identity has already been used for different inputs.");
    validateCurrent(record, context, artifact);
    return (
      await readDerivedArtifactContent(actor, { ...request, derivedId: id }, db, deps)
    ).record;
  }
  const original = await deps.original(actor, {
    catalog: context.input.catalog,
    artifactId: artifact.artifactId,
    expectedContentHash: artifact.contentHash,
  });
  const map = artifact.fillMapping!.map;
  const worksheet = buildFillWorksheet(map, context.input);
  if (!worksheet.complete) fail("Required mapped values are missing or unverified.");
  // S235 R-S235-3: the same places message the readiness view shows.
  const capacityFail = (
    field: (typeof map.fields)[number],
    slots: number,
    rows: number,
  ): never =>
    fail(
      `${slotOverflowMessage(field.multiplicity === "per_animal" ? "per_animal" : "per_party", slots, rows)} An approved form or attachment with room for everyone is required.`,
    );
  let filled:
    | Awaited<ReturnType<typeof fillAcroformPdf>>
    | Awaited<ReturnType<typeof fillStaticPdf>>;
  if (map.static) {
    // S130 static route: each region shows its field's value for its repeat slot; an unused slot
    // stays blank and more parties or animals than slots is refused, never dropped.
    const geometry = map.static;
    const values: StaticRegionValue[] = [];
    for (const field of map.fields) {
      const rows = worksheet.rows.filter((row) => row.fieldId === field.fieldId);
      const slots =
        Math.max(
          ...geometry.regions
            .filter((region) => region.fieldId === field.fieldId)
            .map((region) => region.slot),
        ) + 1;
      if (rows.length > slots) capacityFail(field, slots, rows.length);
      if (field.required && !rows.length) fail("A required mapped value is unavailable.");
      for (const region of geometry.regions.filter(
        (entry) => entry.fieldId === field.fieldId,
      )) {
        const row = rows[region.slot];
        if (!row || row.state !== "filled") {
          if (row?.required) fail("A required mapped value is unavailable.");
          values.push({ regionId: region.regionId, text: "" });
          continue;
        }
        values.push({
          regionId: region.regionId,
          text: formatStaticValue(region.format, row.value!, row.displayValue),
        });
      }
    }
    filled = await fillStaticPdf(original.content, geometry, values);
  } else {
    const values: PdfFillValue[] = [];
    // Every reviewed target, written or not: one left unchanged may not keep a stored default.
    const reviewed: string[] = [];
    const earlier = await readAcroformValues(original.content);
    for (const field of map.fields) {
      const rows = worksheet.rows.filter((row) => row.fieldId === field.fieldId);
      const targets =
        field.pdfFieldNames ?? (field.multiplicity === "single" ? [field.fieldId] : []);
      reviewed.push(...targets);
      if (rows.length > targets.length) capacityFail(field, targets.length, rows.length);
      if (field.required && !rows.length) fail("A required mapped value is unavailable.");
      targets.forEach((target, index) => {
        const row = rows[index];
        if (!row || row.state !== "filled") {
          if (row?.required) fail("A required mapped value is unavailable.");
          // A mapped target without a current value is blank: one that holds an earlier value,
          // whether a single field or an unused repeated slot, is cleared, so no earlier person or
          // amount survives (R-F10-04); a blank target is left exactly as approved.
          const previous = earlier[target];
          if (previous)
            values.push({
              name: target,
              value: typeof previous === "string" ? "" : false,
            });
          return;
        }
        values.push({
          name: target,
          value:
            typeof row.value === "boolean"
              ? row.value
              : (row.displayValue ?? String(row.value)),
        });
      });
    }
    filled = await fillAcroformPdf(original.content, values, reviewed);
  }
  // S253 (R-S253-5): one fee on the finished pet agreement. The value the fill placed and the
  // text a program reads from the saved file both state the published amount, or nothing is kept.
  const publishedFee = context.input.facts.find(
    (fact) => fact.fieldKey === PET_PROCESSING_FEE_FACT && fact.confidence === "Verified",
  );
  if (
    artifact.kind === "animal_agreement" &&
    typeof publishedFee?.normalizedValue === "number"
  ) {
    const feeFields = new Set(
      map.fields
        .filter((field) => field.factKey === PET_PROCESSING_FEE_FACT)
        .map((field) => field.fieldId),
    );
    const feeTargets = map.static
      ? map.static.regions
          .filter((region) => feeFields.has(region.fieldId))
          .map((region) => region.regionId)
      : map.fields
          .filter((field) => feeFields.has(field.fieldId))
          .flatMap((field) => field.pdfFieldNames ?? [field.fieldId]);
    const written = filled.comparison.allFields as Record<string, unknown>;
    const feeIssues = await petFeeConsistencyIssues({
      output: filled.content,
      publishedFeeCents: Math.round(publishedFee.normalizedValue * 100),
      drawnFees: feeTargets.map((target) => String(written[target] ?? "")),
    });
    if (feeIssues.length) fail(feeIssues.join(" "));
  }
  // S253 (R-S253-10): the organization, representative and signer text a form prints is still
  // printed on the prepared file. Each form is read against itself only.
  const lost = await lostPrintedText({
    original: original.content,
    output: filled.content,
    printed: map.printedParties ?? [],
  });
  if (lost.length) fail(lost.join(" "));
  const contentRef = await deps.content.put({
    content: filled.content,
    contentHash: filled.outputHash,
    // Operation identity is stable; staging byte ownership is not shared by concurrent callers.
    // A failed chunk write may remove only this attempt's bytes, never a peer's published PDF.
    contentId: `filled_${randomUUID()}`,
  });
  let publicationAttempted = false;
  let publicationRefused = false;
  try {
    // Read the saved chunks; a successful in-memory fill is not persistence evidence.
    const saved = await deps.content.read(contentRef);
    if (
      sha(saved) !== filled.outputHash ||
      !(await readsBackAs(filled.adapter, saved, comparisonOf(filled)))
    )
      fail("Stored filled bytes did not read back exactly.");
    const base: Omit<DerivedArtifactRecord, "provenanceHash"> = {
      schemaVersion: "approved-derived-pdf/v1",
      id,
      leaseId: request.leaseId,
      snapshotId: request.snapshotId,
      packetHash: context.snapshot!.payloadHash,
      artifactId: artifact.artifactId,
      originalPublication: artifact.publicationSource.reference,
      originalHash: artifact.contentHash,
      mapVersion: artifact.fillMapping!.map.mapVersion,
      mapHash: artifact.fillMapping!.mapHash,
      inputSnapshotHash: inputHash(context, artifact),
      adapter: filled.adapter,
      outputHash: filled.outputHash,
      fileName: original.fileName.replace(/\.pdf$/i, "") + "-filled.pdf",
      contentRef,
      comparison: comparisonOf(filled),
      preparedBy: actor.uid,
      preparedAt: deps.now(),
      requestHash,
    };
    const record: DerivedArtifactRecord = { ...base, provenanceHash: provenance(base) };
    publicationAttempted = true;
    const publishedContentId = await db.runTransaction(async (transaction) => {
      try {
        await guardedRead(transaction, db, context);
        const headRef = db
          .collection(DERIVED_ARTIFACT_COLLECTIONS.heads)
          .doc(derivedHeadId(request.snapshotId, request.artifactId));
        const [head, old] = await Promise.all([
          transaction.get(headRef),
          transaction.get(recordRef),
        ]);
        if (old.exists) {
          const winner = old.data() as DerivedArtifactRecord;
          if (
            winner.id !== id ||
            winner.schemaVersion !== "approved-derived-pdf/v1" ||
            winner.provenanceHash !== provenance(winner) ||
            winner.requestHash !== requestHash
          )
            fail("Preparation identity conflict.");
          return winner.contentRef.contentId;
        }
        if ((head.data()?.id ?? null) !== request.expectedCurrentId)
          fail("Another preparation changed this document. Reload before preparing.");
        transaction.create(
          recordRef,
          stampProductRecordRetention(
            "lease_renewal_progress",
            record as unknown as Record<string, unknown>,
          ),
        );
        transaction.set(
          headRef,
          stampProductRecordRetention(
            "lease_renewal_progress",
            { id, snapshotId: request.snapshotId, artifactId: request.artifactId },
            head.data(),
          ),
        );
        return contentRef.contentId;
      } catch (error) {
        // A local validation refusal never dispatches this transaction's writes.
        if (error instanceof EditableLayerError) publicationRefused = true;
        throw error;
      }
    });
    if (publishedContentId !== contentRef.contentId) {
      // The immutable operation record positively names the peer that won. This unique staging
      // copy is unreferenced and can be removed without touching the published output or original.
      await deps.content.delete(contentRef);
    }
  } catch (error) {
    let unreferenced = !publicationAttempted || publicationRefused;
    if (!unreferenced) {
      try {
        const winner = await recordById(id, db);
        unreferenced = winner.contentRef.contentId !== contentRef.contentId;
      } catch {
        // A failed/absent read after an ambiguous commit is not proof of nonpublication.
        // Retain those exact bytes; an idempotent retry can recover the immutable record.
      }
    }
    if (unreferenced) await deps.content.delete(contentRef).catch(() => undefined);
    throw error;
  }
  return (
    await readDerivedArtifactContent(actor, { ...request, derivedId: id }, db, deps)
  ).record;
}
export async function readDerivedArtifactContent(
  actor: AuthenticatedUser,
  request: DerivedArtifactRequest & { derivedId: string; requireApproval?: boolean },
  db = getAdminFirestore(),
  deps = derivedArtifactDeps(db),
) {
  const record = await readCurrentDerivedArtifact(actor, request, db, deps);
  if (!record || record.id !== request.derivedId)
    fail("This is not the current filled output.");
  if (
    request.requireApproval &&
    (!record.approval ||
      record.approval.outputHash !== record.outputHash ||
      record.approval.provenanceHash !== record.provenanceHash)
  )
    fail("Review and approve the exact filled output first.");
  const context = await deps.resolve(actor, request.leaseId, request.snapshotId);
  const artifact = currentArtifact(context, request);
  validateCurrent(record, context, artifact);
  await deps.original(actor, {
    catalog: context.input.catalog,
    artifactId: artifact.artifactId,
    expectedContentHash: artifact.contentHash,
  });
  const content = await deps.content.read(record.contentRef);
  if (
    sha(content) !== record.outputHash ||
    !(await readsBackAs(record.adapter, content, record.comparison))
  )
    fail("Filled output readback failed.");
  return { record, content, fileName: record.fileName, contentType: "application/pdf" };
}
export async function approveDerivedArtifact(
  actor: AuthenticatedUser,
  raw: unknown,
  db = getAdminFirestore(),
  deps = derivedArtifactDeps(db),
) {
  // S182: ordinary renewal staff approve the exact output they inspected.
  allowed(actor, renewalRoleCapability("approve_filled_artifact"));
  const request = ApproveDerivedArtifactSchema.parse(raw);
  const context = await deps.resolve(actor, request.leaseId, request.snapshotId);
  currentArtifact(context, request, true);
  const { record } = await readDerivedArtifactContent(actor, request, db, deps);
  if (record.outputHash !== request.outputHash)
    fail("The inspected output hash changed.");
  await db.runTransaction(async (transaction) => {
    await guardedRead(transaction, db, context);
    const ref = db.collection(DERIVED_ARTIFACT_COLLECTIONS.records).doc(record.id);
    const [head, current] = await Promise.all([
      transaction.get(
        db
          .collection(DERIVED_ARTIFACT_COLLECTIONS.heads)
          .doc(derivedHeadId(record.snapshotId, record.artifactId)),
      ),
      transaction.get(ref),
    ]);
    if (
      head.data()?.id !== record.id ||
      current.data()?.provenanceHash !== record.provenanceHash
    )
      fail("The filled output changed during approval.");
    const old = current.data()?.approval;
    if (old) {
      if (
        old.operationId !== request.operationId ||
        old.actorUid !== actor.uid ||
        old.outputHash !== request.outputHash
      )
        fail("This output already has a different approval.");
      return;
    }
    transaction.update(ref, {
      approval: {
        actorUid: actor.uid,
        approvedAt: deps.now(),
        operationId: request.operationId,
        outputHash: record.outputHash,
        provenanceHash: record.provenanceHash,
      },
    });
  });
  return (
    await readDerivedArtifactContent(
      actor,
      { ...request, requireApproval: true },
      db,
      deps,
    )
  ).record;
}
