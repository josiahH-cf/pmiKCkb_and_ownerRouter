import { evaluateRenewalPacket } from "./evaluate-packet";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  getRenewalWorkspace,
  renewalWorkspaceDocId,
} from "@/lib/firestore/renewal-workspace";
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
  REQUIRED_LEASE_ARTIFACTS,
  unavailableLeaseArtifactCatalog,
} from "./artifact-catalog";
import { PUBLICATION_COLLECTIONS } from "@/lib/publication/service";
import { resolveStoredDataMode } from "@/lib/data-mode";
import type { PacketEvaluationInput, PacketFact } from "./packet-types";
export const PACKET_SOURCE_COLLECTIONS = {
  catalog: "lease_artifact_catalogs",
  sources: "lease_document_source_mappings",
} as const;
/** Catalog and mappings are private Admin-approved records. Resource URLs never constitute publications or mapped legal facts. */
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
  const [views, workspace, catalogDoc, sourceDoc] = await Promise.all([
    requireCurrentLeaseViews(config.rentvineClient, Date.now()),
    getRenewalWorkspace(actor, leaseId, db),
    db.collection(PACKET_SOURCE_COLLECTIONS.catalog).doc("current").get(),
    db
      .collection(PACKET_SOURCE_COLLECTIONS.sources)
      .doc(renewalWorkspaceDocId(leaseId))
      .get(),
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
    // The required families remain owning policy; a supplied map cannot omit one to bypass applicability.
    if (
      JSON.stringify(catalog.requirements.map((r) => r.kind).sort()) !==
      JSON.stringify(REQUIRED_LEASE_ARTIFACTS.map((r) => r.kind).sort())
    )
      throw new EditableLayerError(
        "The approved catalog does not preserve required form-family applicability.",
        409,
      );
    catalog = { ...catalog, requirements: [...REQUIRED_LEASE_ARTIFACTS] };
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
  if (!sources)
    notices.push(
      "Current approved original-lease facts and participant/field mappings are pending or stale (S34, B-DL3).",
    );
  const facts: PacketFact[] = [...(sources?.facts ?? [])];
  const add = (fieldKey: string, normalizedValue: string | number) =>
    facts.push({
      fieldKey,
      normalizedValue,
      displayValue: String(normalizedValue),
      source: {
        system: "staff_recorded_owner_approval",
        reference: `renewal-cycle:${workspace!.cycleId}:terms:${workspace!.termsRevision}`,
        retrievedAt: workspace!.ownerResponse!.recordedAt,
        version: String(workspace!.termsRevision),
      },
      confidence: "Verified",
      applicability: "Applicable",
      verifiedBy: workspace!.ownerResponse!.actorUid,
      blockingScope: "owner_terms",
    });
  if (
    workspace?.ownerResponse?.outcome === "approved_terms" &&
    workspace.ownerResponse.terms
  ) {
    add("renewal.approved_rent", workspace.ownerResponse.terms.rent);
    add("renewal.effective_date", workspace.ownerResponse.terms.effectiveDate);
    add("renewal.end_date", workspace.ownerResponse.terms.endDate);
  } else
    notices.push(
      "Record explicit owner approval of the current renewal terms before packet execution.",
    );
  const input: PacketEvaluationInput = {
    leaseId,
    transactionId,
    facts,
    participants: sources?.participants ?? [],
    charges: sources?.charges ?? [],
    animals: sources?.animals ?? [],
    catalog,
  };
  // Availability is scoped to the evaluated packet. An excluded form cannot block an unrelated renewal.
  const includedIds = new Set(
    evaluateRenewalPacket(input).manifest?.includedArtifacts.map((a) => a.artifactId) ??
      [],
  );
  for (const artifact of catalog.artifacts.filter((a) => includedIds.has(a.artifactId))) {
    const source = artifact.publicationSource;
    const id =
      source.system === "s21_publication" && source.reference.startsWith("publication:")
        ? source.reference.slice("publication:".length)
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
        record.spaceId === "renewals" &&
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
  return {
    input,
    workspace,
    leaseSourceHash,
    sources,
    notices,
    catalogRecordHash: hashExecutionPreview(catalogDoc.data() ?? {}),
    mappingRecordHash: hashExecutionPreview(sourceDoc.data() ?? {}),
  };
}
