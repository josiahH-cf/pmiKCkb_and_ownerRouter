// S236 ARCH-S236-2: per-document and overall business states for returned renewal documents, and
// who still must sign, joined from the reviewed map's signers, the packet's people and roles, and
// staff-attested returned-state records. Staff attestations read "Recorded by staff — not
// provider-verified". ARCH-S236-3: Dotloop loop/document readback is not an input here, so provider
// metadata can never set a signed state. Pure and deterministic; it writes nothing.

import type {
  ArtifactFieldMap,
  SignerRole,
} from "@/lib/lease-documents/artifact-intake-contract";
import type { PacketPersonInput } from "@/lib/lease-documents/packet-inputs";

export const STAFF_ATTESTATION_LABEL = "Recorded by staff — not provider-verified";
export const SIGNER_MAP_PENDING_LABEL = "Signer requirements pending the reviewed map";

export type ReturnedDocumentState =
  | "Not prepared"
  | "Prepared"
  | "Uploaded"
  | "Sent for signature"
  | "Partially signed"
  | "Fully executed"
  | typeof SIGNER_MAP_PENDING_LABEL;

export interface ReturnedDocumentInput {
  readonly documentKey: string;
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
  readonly documentKey: string;
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
}): {
  readonly documents: readonly ReturnedDocumentProjection[];
  readonly overall: ReturnedDocumentState;
  /** The "Required signatures complete" activity, derived; never recordable while one is missing. */
  readonly signaturesComplete: boolean;
} {
  const documents = input.documents.map((document): ReturnedDocumentProjection => {
    const notes: string[] = [];
    // A record attaches only to this lease, cycle and snapshot; an earlier version never counts.
    const sameCase = input.records.filter(
      (record) =>
        record.leaseId === input.leaseId &&
        record.cycleId === input.cycleId &&
        record.snapshotId === input.snapshotId,
    );
    const current = sameCase.filter(
      (record) => record.documentContentHash === document.contentHash,
    );
    if (sameCase.some((record) => record.documentContentHash !== document.contentHash))
      notes.push("Signed an earlier version — not current");
    if (!document.prepared)
      return { ...base(document), state: "Not prepared", notes, attestation: null };
    if (!document.signers)
      return {
        ...base(document),
        state: SIGNER_MAP_PENDING_LABEL,
        notes,
        attestation: null,
      };
    const entries = current.flatMap((record) => record.signers);
    const counts = (entry: ReturnedSignerEntry) =>
      entry.status === "signed" &&
      !(input.termsChangedAt && entry.observedAt < input.termsChangedAt);
    if (
      input.termsChangedAt &&
      entries.some(
        (entry) => entry.status === "signed" && entry.observedAt < input.termsChangedAt!,
      )
    )
      notes.push("Signed before the terms changed");
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
        const entry = entries.find(
          (value) =>
            value.personId === person.personId &&
            value.signerRole === requirement.signerRole,
        );
        if (entry && counts(entry)) {
          signedCount += 1;
          continue;
        }
        if (entry?.status === "declined_voided")
          notes.push(`${person.fullName} declined or voided`);
        stillMustSign.push({
          name: person.fullName,
          capacity: CAPACITY[requirement.signerRole],
          nextAction: `Ask ${person.fullName} to sign ${document.label} in Dotloop`,
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
      notes,
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
  return { documentKey: document.documentKey, label: document.label, stillMustSign: [] };
}
