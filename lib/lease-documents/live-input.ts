import { evaluateRenewalPacket } from "./evaluate-packet";
import { isRenewalArtifactPublicationSpace } from "./publication-space";
import { withRenewalNoticeAdmission } from "@/lib/firestore/renewal-notice-safety";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  getRenewalWorkspace,
  renewalWorkspaceDocId,
} from "@/lib/firestore/renewal-workspace";
import {
  parseRenewalWorkingRecord,
  RENEWAL_WORKING_RECORD_COLLECTIONS,
  renewalWorkingRecordDocId,
} from "@/lib/firestore/renewal-working-record";
import {
  PACKET_INPUT_COLLECTIONS,
  packetInputsDocId,
  parsePacketInputs,
} from "@/lib/firestore/lease-packet-inputs";
import {
  CHARGE_POLICY_COLLECTIONS,
  CHARGE_POLICY_DOC_ID,
} from "@/lib/firestore/lease-charge-policy";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { requireCurrentLeaseViews } from "@/lib/lease-renewal/live-lease-cache";
import { leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  ApprovedLeaseCatalogSchema,
  ApprovedPacketSourcesSchema,
} from "./live-source-schema";
import {
  LEASE_ARTIFACT_FAMILIES,
  REQUIRED_LEASE_ARTIFACTS,
  unavailableLeaseArtifactCatalog,
} from "./artifact-catalog";
import { ChargePolicyRecordSchema } from "./charge-policy";
import {
  currentOwnerApproval,
  ownerApprovalNotice,
  packetEconomics,
} from "./owner-approval-binding";
import {
  assemblePacketSources,
  packetChargeBasis,
  rentVinePacketSource,
} from "./packet-assembly";
import { PUBLICATION_COLLECTIONS } from "@/lib/publication/service";
import { resolveStoredDataMode } from "@/lib/data-mode";
import type { CalculatedCharges } from "./charge-policy";
import { packetFormHolds } from "./form-holds";
import { buildOwnerAcknowledgmentInput } from "./owner-acknowledgment";
import type { LeaseArtifactCatalog, PacketEvaluationInput } from "./packet-types";
import type { PacketInputsRecord } from "./packet-inputs";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import type { RawLease } from "@/lib/integrations/rentvine/client";
export const PACKET_SOURCE_COLLECTIONS = {
  catalog: "lease_artifact_catalogs",
  sources: "lease_document_source_mappings",
} as const;

function sameKinds(
  left: readonly { kind: string }[],
  right: readonly { kind: string }[],
) {
  return (
    JSON.stringify(left.map((entry) => entry.kind).sort()) ===
    JSON.stringify(right.map((entry) => entry.kind).sort())
  );
}

/**
 * Catalog and mappings are private Admin-approved records; resource URLs never constitute
 * publications or mapped legal facts. S66: the staff packet inputs, the published charge policy,
 * the current RentVine read and the owner approval bound to the Working terms join them, each with
 * its own source. Reading writes nothing.
 */
export async function resolveLivePacketInput(
  actor: AuthenticatedUser,
  leaseId: string,
  transactionId: string,
  observedAt: string,
  db: Firestore = getAdminFirestore(),
) {
  if (transactionId !== leaseId)
    throw new EditableLayerError(
      "The normal packet must belong to this exact lease workspace.",
      409,
    );
  const config = buildLiveRentVineConfig();
  if (!config.ok)
    throw new EditableLayerError(
      "RentVine is unavailable; retained packet evidence remains visible.",
      409,
    );
  return resolvePacketInputFromViews(
    actor,
    leaseId,
    transactionId,
    observedAt,
    requireCurrentLeaseViews(
      withRenewalNoticeAdmission(actor, config.rentvineClient, db),
      Date.now(),
    ),
    db,
  );
}

/**
 * S235 A03: reuse the page's already-admitted current source. Unlike effect admission, this
 * display entry does not construct/read a provider, observe notice metadata, or save a snapshot.
 * It still resolves current private records and validates exact active publications below.
 */
export async function resolveDisplayedPacketInput(
  actor: AuthenticatedUser,
  leaseId: string,
  transactionId: string,
  observedAt: string,
  views: readonly RawLease[],
  db: Firestore = getAdminFirestore(),
) {
  if (transactionId !== leaseId)
    throw new EditableLayerError(
      "The normal packet must belong to this exact lease workspace.",
      409,
    );
  if (views.filter((view) => leaseViewId(view) === leaseId).length !== 1)
    throw new EditableLayerError("The packet lease is missing or ambiguous.", 409);
  return resolvePacketInputFromViews(
    actor,
    leaseId,
    transactionId,
    observedAt,
    Promise.resolve(views),
    db,
  );
}

async function resolvePacketInputFromViews(
  actor: AuthenticatedUser,
  leaseId: string,
  transactionId: string,
  observedAt: string,
  viewsRead: Promise<readonly RawLease[]>,
  db: Firestore,
) {
  const [views, workspace, catalogDoc, sourceDoc, workingDoc, inputsDoc, policyDoc] =
    await Promise.all([
      viewsRead,
      getRenewalWorkspace(actor, leaseId, db),
      db.collection(PACKET_SOURCE_COLLECTIONS.catalog).doc("current").get(),
      db
        .collection(PACKET_SOURCE_COLLECTIONS.sources)
        .doc(renewalWorkspaceDocId(leaseId))
        .get(),
      db
        .collection(RENEWAL_WORKING_RECORD_COLLECTIONS.head)
        .doc(renewalWorkingRecordDocId(leaseId))
        .get(),
      db.collection(PACKET_INPUT_COLLECTIONS.head).doc(packetInputsDocId(leaseId)).get(),
      db.collection(CHARGE_POLICY_COLLECTIONS.current).doc(CHARGE_POLICY_DOC_ID).get(),
    ]);
  const leases = views.filter((view) => leaseViewId(view) === leaseId);
  if (leases.length !== 1)
    throw new EditableLayerError("The packet lease is missing or ambiguous.", 409);
  const lease = leases[0],
    leaseSourceHash = hashExecutionPreview({ ...lease });
  const catalogRecord = ApprovedLeaseCatalogSchema.safeParse(catalogDoc.data());
  const sourceRecord = ApprovedPacketSourcesSchema.safeParse(sourceDoc.data());
  const notices: string[] = [];
  let catalog = unavailableLeaseArtifactCatalog(observedAt);
  if (catalogRecord.success) {
    catalog = catalogRecord.data.catalog;
    if (catalog.familyUse) {
      // S66: a catalog with Admin family use lists every representable family once, and the use
      // decides which can hold a packet. It cannot drop a family to bypass its configured use.
      const used = catalog.familyUse.map((entry) => ({ kind: entry.kind }));
      if (
        !sameKinds(catalog.requirements, LEASE_ARTIFACT_FAMILIES) ||
        !sameKinds(used, LEASE_ARTIFACT_FAMILIES)
      )
        throw new EditableLayerError(
          "The approved catalog does not record every form family's use.",
          409,
        );
      catalog = { ...catalog, requirements: [...LEASE_ARTIFACT_FAMILIES] };
    } else {
      // The required families remain owning policy; a supplied map cannot omit one to bypass applicability.
      if (!sameKinds(catalog.requirements, REQUIRED_LEASE_ARTIFACTS))
        throw new EditableLayerError(
          "The approved catalog does not preserve required form-family applicability.",
          409,
        );
      catalog = { ...catalog, requirements: [...REQUIRED_LEASE_ARTIFACTS] };
    }
  } else
    notices.push(
      "Approved legal publications, form applicability, and field/signature mappings are pending (S66 / S34, B-DL3).",
    );
  const sources =
    sourceRecord.success &&
    workspace &&
    sourceRecord.data.leaseId === leaseId &&
    sourceRecord.data.cycleId === workspace.cycleId &&
    sourceRecord.data.termsRevision === workspace.termsRevision &&
    sourceRecord.data.leaseSourceHash === leaseSourceHash
      ? sourceRecord.data
      : null;

  let inputs: PacketInputsRecord | null = null;
  try {
    inputs = inputsDoc.exists ? parsePacketInputs(inputsDoc.data(), leaseId) : null;
  } catch {
    notices.push(
      "The saved packet inputs for this lease are unreadable. Nothing was changed; ask an Admin to review them.",
    );
  }
  const policyRecord = policyDoc.exists
    ? ChargePolicyRecordSchema.safeParse(policyDoc.data())
    : null;
  const policy = policyRecord?.success ? policyRecord.data : null;
  if (policyRecord && !policyRecord.success)
    notices.push(
      "The published charge policy is unreadable; charges cannot be calculated.",
    );
  let working: RenewalWorkingRecord | null = null;
  try {
    working = workingDoc.exists
      ? parseRenewalWorkingRecord(workingDoc.data(), leaseId)
      : null;
  } catch {
    notices.push("The Working renewal terms for this lease are unreadable.");
  }

  const economics = packetEconomics(leaseId, inputs, policy);
  const approval = currentOwnerApproval({
    workspace,
    working,
    economicsHash: economics.hash,
    packetChargesHash: packetChargeBasis({ leaseId, mapping: sources, inputs, policy })
      .hash,
  });
  // S234 R-S234-3: the notice names exactly which Working terms changed.
  const approvalNotice = ownerApprovalNotice(approval.coverage);
  if (approvalNotice) notices.push(approvalNotice);
  if (approval.notice) notices.push(approval.notice);

  const source = rentVinePacketSource(lease, observedAt);
  const assembled = assemblePacketSources({
    leaseId,
    mapping: sources,
    inputs,
    policy,
    source,
    approvedTermFacts: approval.facts,
  });
  notices.push(...assembled.notices);
  if (sourceDoc.exists && !sources)
    notices.push(
      "Current approved original-lease facts and participant/field mappings are pending or stale (S34, B-DL3).",
    );
  else if (!sources && !inputs)
    notices.push(
      "Enter the packet facts, people and animals for this lease in Packet inputs.",
    );

  // S253 (R-S253-11): a form that waits on one named input holds only itself.
  const formHolds = packetFormHolds({
    catalog,
    facts: assembled.facts,
    calculated: assembled.calculated,
  });
  const input: PacketEvaluationInput = {
    leaseId,
    transactionId,
    facts: assembled.facts,
    participants: assembled.participants,
    charges: assembled.charges,
    animals: assembled.animals,
    catalog,
    ...(formHolds.length ? { formHolds } : {}),
  };
  await markUnavailablePublications(input, catalog, observedAt, notices, db);
  const recordHash = (doc: { data(): unknown }) =>
    hashExecutionPreview((doc.data() as Record<string, unknown> | undefined) ?? {});
  return {
    input,
    workspace,
    leaseSourceHash,
    sources,
    inputs,
    policy,
    // S253: the Working terms a saved owner explanation is compared with.
    working,
    calculated: assembled.calculated,
    contacts: assembled.contacts,
    sourceFacts: source.facts,
    sourceParties: source.parties,
    replacedSourceFacts: assembled.replacedSourceFacts,
    ownerApproval: approval.state,
    ownerApprovalNotice: approvalNotice,
    notices,
    catalogRecordHash: recordHash(catalogDoc),
    mappingRecordHash: recordHash(sourceDoc),
    // S66: the claim and derived-file guards also bind the inputs the packet was evaluated from.
    packetInputsRecordHash: recordHash(inputsDoc),
    chargePolicyRecordHash: recordHash(policyDoc),
    workingRecordHash: recordHash(workingDoc),
  };
}

/**
 * S253 (R-S253-7): the owner acknowledgment's evaluation input for a lease whose tenant input is
 * already resolved. It reads the same resolved records and adds only the explanation staff wrote
 * on this lease for its current cycle, then checks that each form the owner packet includes is
 * still the exact active approved publication. Nothing is written.
 */
export async function resolveOwnerAcknowledgmentInput(
  resolved: {
    input: PacketEvaluationInput;
    inputs: PacketInputsRecord | null;
    workspace: { cycleId: string } | null;
    calculated: Pick<CalculatedCharges, "petAgreement"> | null;
    notices: string[];
  },
  observedAt: string,
  db: Firestore = getAdminFirestore(),
): Promise<PacketEvaluationInput> {
  const input = buildOwnerAcknowledgmentInput({
    tenant: resolved.input,
    inputs: resolved.inputs,
    cycleId: resolved.workspace?.cycleId ?? null,
    calculated: resolved.calculated,
  });
  await markUnavailablePublications(
    input,
    input.catalog,
    observedAt,
    resolved.notices,
    db,
  );
  return input;
}

/** Marks an included form inactive when its exact active approved publication cannot be shown. */
async function markUnavailablePublications(
  input: PacketEvaluationInput,
  catalog: LeaseArtifactCatalog,
  observedAt: string,
  notices: string[],
  db: Firestore,
): Promise<void> {
  // Availability is scoped to the evaluated packet. An excluded form cannot block an unrelated renewal.
  const includedIds = new Set(
    evaluateRenewalPacket(input).manifest?.includedArtifacts.map((a) => a.artifactId) ??
      [],
  );
  for (const artifact of catalog.artifacts.filter((a) => includedIds.has(a.artifactId))) {
    const publicationSource = artifact.publicationSource;
    const id =
      publicationSource.system === "s21_publication" &&
      publicationSource.reference.startsWith("publication:")
        ? publicationSource.reference.slice("publication:".length)
        : "";
    let available =
      !!id &&
      !id.includes("/") &&
      Number.isFinite(Date.parse(artifact.effectiveFrom)) &&
      Date.parse(artifact.effectiveFrom) <= Date.parse(observedAt) &&
      (!artifact.effectiveUntil ||
        Date.parse(artifact.effectiveUntil) >= Date.parse(observedAt));
    if (available) {
      const published = await db
        .collection(PUBLICATION_COLLECTIONS.versions)
        .doc(id)
        .get();
      const record = published.data();
      const resource = record?.resourceId
        ? await db
            .collection(PUBLICATION_COLLECTIONS.resources)
            .doc(record.resourceId)
            .get()
        : null;
      available =
        !!record?.validated &&
        isRenewalArtifactPublicationSpace(record.spaceId) &&
        resolveStoredDataMode(record) === "live" &&
        record.contentHash === artifact.contentHash &&
        resource?.get("activeVersionId") === id;
    }
    if (!available) {
      artifact.status = "inactive";
      notices.push(
        `${artifact.label}: its exact active approved publication is unavailable or changed (B-DL3).`,
      );
    }
  }
}
