// S236 ARCH-S236-1/2: the one server read the lease page and the returned-state route share. It
// resolves the lease's current cycle, current packet snapshot, packet people, reviewed signer maps,
// each included document's current version and the cycle's staff records, then projects the
// business states and who still must sign. Every read is an app record; nothing here reads or
// writes Dotloop, so the "Dotloop shows" line stays beside the records and never inside them.

import type { Firestore } from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { readArtifactIntakeManifest } from "@/lib/firestore/lease-artifact-intake";
import { readLoopAssociation } from "@/lib/firestore/lease-document-loop-association";
import { getCurrentPacketSnapshot } from "@/lib/firestore/lease-document-packet-snapshots";
import {
  listReturnedStateRecords,
  recordReturnedState,
  type RecordReturnedStateInput,
  type ReturnedStateContext,
} from "@/lib/firestore/lease-document-returned-states";
import { getPacketInputs } from "@/lib/firestore/lease-packet-inputs";
import { getRenewalWorkspace } from "@/lib/firestore/renewal-workspace";
import {
  DERIVED_ARTIFACT_COLLECTIONS,
  derivedHeadId,
} from "@/lib/lease-documents/derived-artifact-contract";
import {
  projectReturnedState,
  type ReturnedDocumentProjection,
  type ReturnedDocumentState,
} from "@/lib/lease-documents/returned-state";
import {
  projectShownPacketState,
  type ShownPacketState,
} from "@/lib/lease-documents/packet-shown-state";
import {
  currentReturnedDocuments,
  dotloopShowsLine,
  type ReturnedDocumentVersion,
} from "@/lib/lease-documents/returned-state-view";

export interface ReturnedSignerChoice {
  readonly personId: string;
  readonly signerRole: string;
  readonly label: string;
}

export interface ReturnedStateView {
  readonly leaseId: string;
  readonly cycleId: string | null;
  readonly snapshotId: string | null;
  /** Why nothing can be recorded yet, in operator words; null when recording is possible. */
  readonly unavailable: string | null;
  readonly documents: readonly (ReturnedDocumentProjection & {
    readonly contentHash: string;
    readonly versionLabel: string;
    /** The record revision staff must have read before adding to it. */
    readonly revision: number;
  })[];
  readonly overall: ReturnedDocumentState;
  readonly signaturesComplete: boolean;
  readonly signers: readonly ReturnedSignerChoice[];
  readonly dotloopShows: string | null;
  /** S235 R-S235-4: the packet state from its recorded events, for the current snapshot. */
  readonly packetState: ShownPacketState | null;
  /**
   * R-S236-6: true when every included document of the current packet is prepared and has a
   * reviewed signer map, so "Required signatures complete" follows the signer records.
   */
  readonly tracksSignerDetail: boolean;
  /** R-S236-6: how a staff-recorded "Required signatures complete" reads beside these records. */
  readonly manualCompletion: string | null;
}

export const WITHOUT_SIGNER_DETAIL_LABEL = "Recorded by staff without signer detail";

const CAPACITY_WORDS: Record<string, string> = {
  tenant: "tenant",
  owner: "owner",
  property_manager: "property manager for the owner",
  broker: "broker",
  guarantor: "guarantor",
};

/** Each artifact's filled copy for this snapshot: present when prepared, with its approved hash. */
async function derivedOutputs(
  snapshotId: string,
  artifactIds: readonly string[],
  db: Firestore,
): Promise<Map<string, { approvedHash: string | null }>> {
  const result = new Map<string, { approvedHash: string | null }>();
  await Promise.all(
    artifactIds.map(async (artifactId) => {
      const head = await db
        .collection(DERIVED_ARTIFACT_COLLECTIONS.heads)
        .doc(derivedHeadId(snapshotId, artifactId))
        .get();
      const id = head.get("id");
      if (typeof id !== "string" || !id) return;
      const record = await db
        .collection(DERIVED_ARTIFACT_COLLECTIONS.records)
        .doc(id)
        .get();
      if (
        record.get("snapshotId") !== snapshotId ||
        record.get("artifactId") !== artifactId
      )
        return;
      const approval = record.get("approval") as { outputHash?: unknown } | undefined;
      result.set(artifactId, {
        approvedHash:
          typeof approval?.outputHash === "string" &&
          approval.outputHash === record.get("outputHash")
            ? approval.outputHash
            : null,
      });
    }),
  );
  return result;
}

/** The binding context and records for one lease, read from the current app records. */
export async function resolveReturnedState(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<{ context: ReturnedStateContext; view: ReturnedStateView }> {
  const [workspace, snapshot, inputs, manifest] = await Promise.all([
    getRenewalWorkspace(actor, leaseId, db),
    getCurrentPacketSnapshot(actor, leaseId, leaseId, db),
    getPacketInputs(actor, leaseId, db),
    readArtifactIntakeManifest(db),
  ]);
  const current = snapshot?.current && snapshot.manifest ? snapshot : null;
  const association = current ? await readLoopAssociation(leaseId, db) : null;
  const included = current?.manifest?.includedArtifacts ?? [];
  const derived = current
    ? await derivedOutputs(
        current.snapshotId,
        included.flatMap((artifact) =>
          artifact.artifactId ? [artifact.artifactId] : [],
        ),
        db,
      )
    : new Map<string, { approvedHash: string | null }>();
  const approved = new Map(
    [...derived].flatMap(([artifactId, output]) =>
      output.approvedHash ? [[artifactId, output.approvedHash] as const] : [],
    ),
  );
  const { documents, versions } = current
    ? currentReturnedDocuments({
        snapshot: current,
        manifest,
        association,
        approvedOutputs: approved,
      })
    : { documents: [], versions: [] as ReturnedDocumentVersion[] };
  const cycleId = workspace?.cycleId ?? null;
  const people = inputs?.people.entries ?? [];
  const records =
    cycleId && current ? await listReturnedStateRecords(actor, leaseId, cycleId, db) : [];
  // A signature observed before the current Working terms were recorded does not count.
  const termsChangedAt =
    workspace?.ownerResponse?.terms && workspace.termsRevision > 0
      ? workspace.ownerResponse.recordedAt
      : null;
  const projection = projectReturnedState({
    leaseId,
    cycleId: cycleId ?? "",
    snapshotId: current?.snapshotId ?? "",
    documents,
    people,
    records,
    termsChangedAt,
  });
  const unavailable = !cycleId
    ? "Start or record this lease's renewal work first; returned documents belong to a renewal cycle."
    : !current
      ? "No current app packet exists for this lease. Record Required signatures complete with its source under Work recorded by staff."
      : documents.length === 0
        ? "The current packet has no included documents to track."
        : null;
  const tracksSignerDetail =
    !unavailable &&
    documents.every((document) => document.prepared && document.signers !== null);
  const manual = workspace?.activities.signatures;
  const manualCompletion =
    manual?.outcome !== "done"
      ? null
      : tracksSignerDetail
        ? projection.signaturesComplete
          ? null
          : "Required signatures complete was recorded by staff before these signer records; the records show who still must sign."
        : `Required signatures complete: ${WITHOUT_SIGNER_DETAIL_LABEL} (${manual.source}).`;
  const context: ReturnedStateContext = {
    leaseId,
    cycleId,
    snapshotId: current?.snapshotId ?? null,
    documents,
    people,
  };
  const view: ReturnedStateView = {
    leaseId,
    cycleId,
    snapshotId: current?.snapshotId ?? null,
    unavailable,
    documents: projection.documents.map((document, index) => {
      const version = versions[index];
      const record = records.find(
        (entry) =>
          entry.snapshotId === current?.snapshotId &&
          entry.kind === document.kind &&
          entry.documentContentHash === version.contentHash,
      );
      return {
        ...document,
        contentHash: version.contentHash,
        versionLabel: version.versionLabel,
        revision: record?.revision ?? 0,
      };
    }),
    overall: projection.overall,
    signaturesComplete: projection.signaturesComplete,
    signers: people.flatMap((person) =>
      person.roles.map((role) => ({
        personId: person.personId,
        signerRole: role.signerRole,
        label: `${person.fullName} (${CAPACITY_WORDS[role.signerRole] ?? role.signerRole})`,
      })),
    ),
    dotloopShows: current ? dotloopShowsLine(current) : null,
    packetState: current
      ? projectShownPacketState({
          snapshot: current,
          documents: included.flatMap((artifact) => {
            if (!artifact.artifactId) return [];
            const entry = manifest.entries[artifact.kind];
            const map =
              entry?.state === "approved" &&
              entry.publication?.contentHash === artifact.contentHash
                ? (entry.fieldMap ?? null)
                : null;
            const documentRef = entry?.providerBindings?.dotloopDocumentRef ?? null;
            const live = association?.state === "current" ? association : null;
            return [
              {
                artifactId: artifact.artifactId,
                fillable: Boolean(map && !map.unchangedAttachment),
                unchanged: Boolean(map?.unchangedAttachment),
                prepared: derived.has(artifact.artifactId),
                approved: approved.has(artifact.artifactId),
                uploaded: Boolean(
                  live?.documents.some(
                    (document) =>
                      document.snapshotId === current.snapshotId &&
                      document.artifactId === artifact.artifactId,
                  ),
                ),
                uploadPending: Boolean(
                  documentRef &&
                  live?.pendingUploads?.some(
                    (pending) => pending.documentRef === documentRef,
                  ),
                ),
              },
            ];
          }),
        })
      : null,
    tracksSignerDetail,
    manualCompletion,
  };
  return { context, view };
}

/**
 * R-S236-6: "Required signatures complete" cannot be recorded Done while the signer records of a
 * fully tracked current packet show a required signer missing. Without a current packet, or when
 * any document lacks a prepared version or a reviewed signer map, staff record it themselves and it
 * reads as recorded without signer detail. An unreadable read refuses rather than guessing.
 */
export async function assertSignaturesCompletable(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  let view: ReturnedStateView;
  try {
    ({ view } = await resolveReturnedState(actor, leaseId, db));
  } catch {
    throw new EditableLayerError(
      "Returned documents could not be read, so Required signatures complete was not recorded. Reload and try again.",
      409,
    );
  }
  if (!view.tracksSignerDetail || view.signaturesComplete) return;
  const missing = view.documents.flatMap((document) =>
    document.stillMustSign.map((entry) => `${entry.name} (${document.label})`),
  );
  throw new EditableLayerError(
    `Required signatures are not complete for the current packet${missing.length ? `: ${missing.join(", ")} still must sign` : ""}. Record each signer's result under Returned documents and signatures.`,
    409,
  );
}

/** Record one change against the freshly resolved context, then return the refreshed view. */
export async function recordReturnedStateChange(
  actor: AuthenticatedUser,
  input: RecordReturnedStateInput,
  db: Firestore = getAdminFirestore(),
): Promise<{ view: ReturnedStateView; duplicate: boolean }> {
  const { context } = await resolveReturnedState(actor, input.leaseId, db);
  const { duplicate } = await recordReturnedState(actor, input, context, db);
  const { view } = await resolveReturnedState(actor, input.leaseId, db);
  return { view, duplicate };
}
