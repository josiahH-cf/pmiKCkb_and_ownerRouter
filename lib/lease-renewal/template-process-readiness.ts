import { LEASE_ARTIFACT_FAMILIES } from "@/lib/lease-documents/artifact-catalog";
import { FAMILY_USE_LABELS } from "@/lib/lease-documents/family-use";
import type { FormFamilyUse } from "@/lib/lease-documents/packet-types";
import type { ArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import {
  usableRenewalResourceUrl,
  type RenewalResourceSettings,
} from "./resource-locations";

const PROCESS_LABEL = {
  renewal_extension: "Lease renewal extension",
  full_lease_packet: "Full lease packet",
  owner_acknowledgment: "Owner acknowledgment",
} as const;
/** Existing reviewed catalog contracts determine process membership; filenames never approve applicability. */
export function projectTemplateProcessReadiness(input: {
  resources: RenewalResourceSettings | null;
  manifest: ArtifactIntakeManifest;
  familyUse: { readable: boolean; families: readonly FormFamilyUse[] };
}) {
  return LEASE_ARTIFACT_FAMILIES.map((family) => {
    const entry = input.manifest.entries[family.kind];
    const use = input.familyUse.families.find((value) => value.kind === family.kind);
    const approved =
      input.manifest.state === "readable" &&
      entry?.state === "approved" &&
      !!entry.publication &&
      !!entry.fieldMap &&
      !!entry.mapHash;
    const source = input.resources?.entries[family.kind];
    return {
      kind: family.kind,
      label: family.label,
      processes: family.packetContexts.map((context) => PROCESS_LABEL[context]),
      applicability:
        input.familyUse.readable && use
          ? FAMILY_USE_LABELS[use.use]
          : "Unknown; configuration could not be read",
      applicabilitySource: !input.familyUse.readable
        ? "Unknown"
        : use?.source.system === "engineering_default"
          ? "Engineering default; Admin review is separate"
          : "Recorded configuration",
      sourceUrl: usableRenewalResourceUrl(source),
      sourceState:
        input.resources === null
          ? "Unknown; source links could not be read"
          : !source?.url
            ? "Source link not recorded"
            : source.verified
              ? "Staff-verified source link"
              : "Source link awaits verification",
      preparation:
        input.manifest.state !== "readable"
          ? "Unknown; form inventory could not be read"
          : approved
            ? "Approved original and mapping; review each lease's filled output"
            : entry
              ? "Original received; mapping or approval still required"
              : "Original and reviewed field/signer map not received",
      approved,
    };
  });
}
