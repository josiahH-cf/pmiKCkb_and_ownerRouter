// S235 ARCH-S235-1 / R-S235-1 / R-S235-2: the read-only per-family readiness for one lease. It
// composes the existing family readiness, the recorded family use and where it came from, the
// approved original and its reviewed map. Viewing writes nothing; "Evaluate packet" stays the
// explicit snapshot step, and an engineering default is never presented as client policy.

import { ARTIFACT_INTAKE_STATE_LABELS } from "@/lib/lease-documents/artifact-intake-contract";
import type { ArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import { projectFamilyReadiness } from "@/lib/lease-documents/artifact-intake";
import { FAMILY_USE_LABELS } from "@/lib/lease-documents/family-use";
import type { FormFamilyUse, PacketEvaluation } from "@/lib/lease-documents/packet-types";

export const ENGINEERING_DEFAULT_LABEL =
  "Engineering default, not yet approved by the client";

export interface LeasePacketFamilyRow {
  readonly kind: string;
  readonly label: string;
  readonly use: string;
  readonly useSource: string;
  readonly applicability: string;
  readonly original: string;
  readonly map: string;
  /** Each missing input with who supplies it; empty when nothing is missing for this family. */
  readonly missing: readonly string[];
}

const APPLICABILITY_LABELS = {
  required: "Applies to this lease",
  not_applicable: "Does not apply to this lease",
  unknown: "Unknown until the packet facts are recorded",
  not_evaluated: "Not evaluated yet; Evaluate packet records it",
} as const;

const shortHash = (hash: string) => hash.slice(0, 12);

export function projectLeasePacketReadiness(input: {
  readonly manifest: ArtifactIntakeManifest;
  readonly evaluation: PacketEvaluation | null;
  readonly familyUse: {
    readonly readable: boolean;
    readonly families: readonly FormFamilyUse[];
  };
}): LeasePacketFamilyRow[] {
  const { families } = projectFamilyReadiness({
    manifest: input.manifest,
    evaluation: input.evaluation,
    connection: "not_read",
    actionExecutable: null,
  });
  return families.map((family): LeasePacketFamilyRow => {
    const entry = input.manifest.entries[family.kind];
    const recordedUse = input.familyUse.families.find((use) => use.kind === family.kind);
    const notUsed = recordedUse?.use === "not_used";
    const original =
      entry?.state === "approved" && entry.publication
        ? `Approved original ${entry.publication.reference} · ${shortHash(entry.publication.contentHash)}`
        : entry
          ? `${ARTIFACT_INTAKE_STATE_LABELS[entry.state]}; no approved original yet`
          : "No approved original received";
    const map = entry?.fieldMap
      ? `Reviewed map ${entry.fieldMap.mapVersion}${entry.mapHash ? ` · ${shortHash(entry.mapHash)}` : ""}`
      : "No reviewed field and signer map";
    const missing: string[] = [];
    if (!input.familyUse.readable) missing.push("Family use could not be read (Admin)");
    else if (recordedUse?.source.system === "engineering_default")
      missing.push("The client's use decision, recorded by an Admin");
    if (!notUsed) {
      if (!(entry?.state === "approved" && entry.publication))
        missing.push("The approved original (client document approver)");
      if (!entry?.fieldMap)
        missing.push("A reviewed field and signer map (client document approver)");
      if (family.applicability === "unknown")
        missing.push("The packet facts that decide whether it applies (staff)");
    }
    return {
      kind: family.kind,
      label: family.label,
      use: !input.familyUse.readable
        ? "Unknown"
        : recordedUse
          ? FAMILY_USE_LABELS[recordedUse.use]
          : "Unknown",
      useSource: !input.familyUse.readable
        ? "Configuration could not be read"
        : recordedUse?.source.system === "engineering_default"
          ? ENGINEERING_DEFAULT_LABEL
          : "Recorded client decision",
      applicability: notUsed ? "Not used" : APPLICABILITY_LABELS[family.applicability],
      original,
      map,
      missing,
    };
  });
}
