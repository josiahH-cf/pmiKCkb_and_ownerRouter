// S236 ARCH-S236-2: per-document and overall business states for returned renewal documents, and
// who still must sign, joined from the reviewed map's signers, the packet's people and roles, and
// staff-attested returned-state records. Staff attestations read "Recorded by staff, not
// provider-verified". ARCH-S236-3: Dotloop loop/document readback is not an input here, so provider
// metadata can never set a signed state. Pure and deterministic; it writes nothing.

import type {
  ArtifactFieldMap,
  SignerRole,
} from "@/lib/lease-documents/artifact-intake-contract";
import type { PacketPersonInput } from "@/lib/lease-documents/packet-inputs";
import type { LeaseArtifactKind } from "@/lib/lease-documents/packet-types";

export const STAFF_ATTESTATION_LABEL = "Recorded by staff, not provider-verified";
export const SIGNER_MAP_PENDING_LABEL = "Signer requirements pending the reviewed map";
/**
 * PR #161 review: the current packet was prepared from earlier Working renewal terms. Its recorded
 * signatures stay as history for those terms; none completes the current renewal.
 */
export const OLDER_TERMS_NOTE =
  "The Working renewal terms changed after this packet was prepared. Signatures recorded on it are kept for the earlier terms and do not complete this renewal; prepare the packet again for the current terms.";

export type ReturnedDocumentState =
  | "Not prepared"
  | "Prepared"
  | "Uploaded"
  | "Sent for signature"
  | "Partially signed"
  | "Fully executed"
  | typeof SIGNER_MAP_PENDING_LABEL;

export interface ReturnedDocumentInput {
  /** The packet manifest's stable identity for this included document (its artifact kind). */
  readonly kind: LeaseArtifactKind;
  readonly label: string;
  /** The current document version's content hash. */
  readonly contentHash: string;
  /** Filled output approved for the current snapshot. */
  readonly prepared: boolean;
  /** Current in the linked loop, by upload receipt. */
  readonly uploaded: boolean;
  /** The reviewed map's signers; null when no reviewed signer map exists. */
  readonly signers: ArtifactFieldMap["signers"] | null;
}

export interface ReturnedSignerEntry {
  readonly signerRole: SignerRole;
  readonly personId: string;
  readonly status: "signed" | "declined_voided";
  readonly observedAt: string;
  readonly evidence:
    | {
        readonly kind: "dotloop_observed";
        readonly documentName: string;
        readonly viewedAt: string;
      }
    | { readonly kind: "signed_copy"; readonly storageRef: string };
}

/** ARCH-S236-1's record shape: one document version's staff-attested returned state. */
export interface ReturnedStateRecord {
  /** The same stable document identity as the manifest's included artifact. */
  readonly kind: LeaseArtifactKind;
  readonly leaseId: string;
  readonly cycleId: string;
  readonly snapshotId: string;
  readonly documentContentHash: string;
  readonly sentForSignature: { readonly at: string; readonly how: string } | null;
  readonly signers: readonly ReturnedSignerEntry[];
  readonly recordedByUid: string;
  readonly recordedAt: string;
}

export interface StillMustSign {
  readonly name: string;
  readonly capacity: string;
  readonly nextAction: string;
}

export interface ReturnedDocumentProjection {
  readonly kind: LeaseArtifactKind;
  readonly label: string;
  readonly state: ReturnedDocumentState;
  readonly stillMustSign: readonly StillMustSign[];
  readonly notes: readonly string[];
  readonly attestation: typeof STAFF_ATTESTATION_LABEL | null;
}

const CAPACITY: Record<SignerRole, string> = {
  tenant: "tenant",
  owner: "owner",
  property_manager: "property manager for the owner",
  broker: "broker",
  guarantor: "guarantor",
};

const STATE_RANK: Record<ReturnedDocumentState, number> = {
  "Not prepared": 0,
  [SIGNER_MAP_PENDING_LABEL]: 1,
  Prepared: 2,
  Uploaded: 3,
  "Sent for signature": 4,
  "Partially signed": 5,
  "Fully executed": 6,
};

export function projectReturnedState(input: {
  readonly leaseId: string;
  readonly cycleId: string;
  readonly snapshotId: string;
  readonly documents: readonly ReturnedDocumentInput[];
  readonly people: readonly PacketPersonInput[];
  readonly records: readonly ReturnedStateRecord[];
  /** When the Working terms last changed; a signature observed before it does not count. */
  readonly termsChangedAt?: string | null;
  /**
   * False when the packet's documents carry earlier Working terms than the current ones
   * (`packetWorkingTermsFreshness`); then no signature on it counts, whenever it was observed.
   */
  readonly packetTermsCurrent?: boolean;
}): {
  readonly documents: readonly ReturnedDocumentProjection[];
  readonly overall: ReturnedDocumentState;
  /** The "Required signatures complete" activity, derived; never recordable while one is missing. */
  readonly signaturesComplete: boolean;
} {
  const termsChangedAt = input.termsChangedAt ? Date.parse(input.termsChangedAt) : null;
  const termsCurrent = input.packetTermsCurrent !== false;
  const documents = input.documents.map((document): ReturnedDocumentProjection => {
    const notes: string[] = termsCurrent ? [] : [OLDER_TERMS_NOTE];
    // A record attaches only to this lease, cycle and document identity (PR #160); it counts only
    // for the current snapshot's current version of that document.
    const sameDocument = input.records.filter(
      (record) =>
        record.leaseId === input.leaseId &&
        record.cycleId === input.cycleId &&
        record.kind === document.kind,
    );
    const versionOf = (record: ReturnedStateRecord) =>
      `${record.snapshotId}\u0000${record.documentContentHash}`;
    const currentVersion = `${input.snapshotId}\u0000${document.contentHash}`;
    const current = sameDocument.filter((record) => versionOf(record) === currentVersion);
    // Only this document's actually signed superseded version warns, and it never counts. An
    // earlier snapshot's record of the same document is a superseded version too.
    const supersededVersions = new Set(
      sameDocument.map(versionOf).filter((version) => version !== currentVersion),
    );
    if (
      [...supersededVersions].some((version) => {
        const records = sameDocument.filter((record) => versionOf(record) === version);
        return signerKeys(records).some(
          (key) => latestObservation(records, key).kind === "signed",
        );
      })
    )
      notes.push("Signed an earlier version, not current");
    if (!document.prepared)
      return { ...base(document), state: "Not prepared", notes, attestation: null };
    if (!document.signers)
      return {
        ...base(document),
        state: SIGNER_MAP_PENDING_LABEL,
        notes,
        attestation: null,
      };
    const stillMustSign: StillMustSign[] = [];
    let requiredCount = 0;
    let signedCount = 0;
    for (const requirement of document.signers.filter((signer) => signer.required)) {
      const holders = input.people
        .flatMap((person) =>
          person.roles
            .filter((role) => role.signerRole === requirement.signerRole)
            .map((role) => ({ person, order: role.order })),
        )
        .sort((left, right) => left.order - right.order);
      if (!holders.length) {
        requiredCount += 1;
        stillMustSign.push({
          name: `No ${CAPACITY[requirement.signerRole]} recorded`,
          capacity: CAPACITY[requirement.signerRole],
          nextAction: `Record the ${CAPACITY[requirement.signerRole]} for ${document.label} in the packet inputs`,
        });
        continue;
      }
      for (const { person } of holders) {
        requiredCount += 1;
        const latest = latestObservation(current, {
          personId: person.personId,
          signerRole: requirement.signerRole,
        });
        // An unreadable terms-change time fails closed: no signature counts against it.
        if (
          latest.kind === "signed" &&
          termsCurrent &&
          (termsChangedAt === null || latest.observedAt >= termsChangedAt)
        ) {
          signedCount += 1;
          continue;
        }
        if (latest.kind === "signed") notes.push("Signed before the terms changed");
        else if (latest.kind === "declined_voided")
          notes.push(`${person.fullName} declined or voided`);
        else if (latest.kind === "conflict")
          notes.push(
            `Needs verification: records for ${person.fullName} disagree at the same time`,
          );
        else if (latest.kind === "invalid")
          notes.push(
            `Needs verification: a record for ${person.fullName} has no valid date`,
          );
        stillMustSign.push({
          name: person.fullName,
          capacity: CAPACITY[requirement.signerRole],
          nextAction: termsCurrent
            ? `Ask ${person.fullName} to sign ${document.label} in Dotloop`
            : `Prepare the packet again for the current Working terms, then ask ${person.fullName} to sign ${document.label}`,
        });
      }
    }
    const sent = current.some((record) => record.sentForSignature);
    const state: ReturnedDocumentState =
      requiredCount > 0 && signedCount === requiredCount
        ? "Fully executed"
        : signedCount > 0
          ? "Partially signed"
          : sent
            ? "Sent for signature"
            : document.uploaded
              ? "Uploaded"
              : "Prepared";
    return {
      ...base(document),
      state,
      stillMustSign,
      notes: [...new Set(notes)],
      attestation: current.length ? STAFF_ATTESTATION_LABEL : null,
    };
  });
  const overall = documents.length
    ? documents.reduce<ReturnedDocumentState>(
        (lowest, document) =>
          STATE_RANK[document.state] < STATE_RANK[lowest] ? document.state : lowest,
        "Fully executed",
      )
    : "Not prepared";
  return { documents, overall, signaturesComplete: overall === "Fully executed" };
}

function base(document: ReturnedDocumentInput) {
  return { kind: document.kind, label: document.label, stillMustSign: [] };
}

interface SignerKey {
  readonly personId: string;
  readonly signerRole: SignerRole;
}

function signerKeys(records: readonly ReturnedStateRecord[]): SignerKey[] {
  const keys = new Map<string, SignerKey>();
  for (const entry of records.flatMap((record) => record.signers))
    keys.set(`${entry.personId}\u0000${entry.signerRole}`, {
      personId: entry.personId,
      signerRole: entry.signerRole,
    });
  return [...keys.values()];
}

/**
 * PR #160 review: one signer's state for one document version is their latest observation by its
 * recorded time, independent of input order. An invalid time, or different statuses at the same
 * latest time, is never a signature.
 */
function latestObservation(
  records: readonly ReturnedStateRecord[],
  key: SignerKey,
):
  | { kind: "none" | "conflict" | "invalid" }
  | { kind: ReturnedSignerEntry["status"]; observedAt: number } {
  const entries = records
    .flatMap((record) => record.signers)
    .filter(
      (entry) => entry.personId === key.personId && entry.signerRole === key.signerRole,
    );
  if (!entries.length) return { kind: "none" };
  const times = entries.map((entry) => Date.parse(entry.observedAt));
  if (times.some((time) => !Number.isFinite(time))) return { kind: "invalid" };
  const latest = Math.max(...times);
  const statuses = new Set(
    entries.filter((_, index) => times[index] === latest).map((entry) => entry.status),
  );
  if (statuses.size !== 1) return { kind: "conflict" };
  const [status] = statuses;
  return { kind: status, observedAt: latest };
}
