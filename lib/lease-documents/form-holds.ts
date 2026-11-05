// S253 (R-S253-4, R-S253-7, R-S253-11): the forms that wait on one named input.
//
// A pet agreement whose reviewed map places the processing fee, the deposit or the total waits
// while the calculator cannot give that amount, and says why in the calculator's own words. An
// owner acknowledgment whose map places the explanation waits while staff have written none for
// this lease. Each hold names one form and one mapped value; every other form of the packet goes
// on. Nothing here supplies a value: an amount or a text that is missing stays missing. Pure.

import type { CalculatedCharges } from "@/lib/lease-documents/charge-policy";
import {
  PET_AGREEMENT_DEPOSIT_FACT,
  PET_AGREEMENT_TOTAL_FACT,
  PET_PROCESSING_FEE_FACT,
} from "@/lib/lease-documents/pet-agreement-facts";
import {
  OWNER_EXPLANATION_FACT,
  OWNER_EXPLANATION_NEED,
} from "@/lib/lease-documents/owner-explanation";
import type {
  LeaseArtifactCatalog,
  PacketFact,
  PacketFormHold,
} from "@/lib/lease-documents/packet-types";

const PET_AMOUNT_FACTS: readonly string[] = [
  PET_PROCESSING_FEE_FACT,
  PET_AGREEMENT_DEPOSIT_FACT,
  PET_AGREEMENT_TOTAL_FACT,
];

export function packetFormHolds(input: {
  catalog: LeaseArtifactCatalog;
  facts: readonly PacketFact[];
  /** The charges calculated for this lease, when the packet uses the published policy. */
  calculated: Pick<CalculatedCharges, "petAgreement"> | null;
}): PacketFormHold[] {
  const present = new Set(
    input.facts
      .filter((fact) => fact.confidence === "Verified")
      .map((fact) => fact.fieldKey),
  );
  const petNeed = input.calculated?.petAgreement.needs.join(" ") ?? "";
  const holds = new Map<string, PacketFormHold>();
  for (const artifact of input.catalog.artifacts) {
    for (const field of artifact.fillMapping?.map.fields ?? []) {
      if (present.has(field.factKey)) continue;
      const label =
        artifact.kind === "animal_agreement" && PET_AMOUNT_FACTS.includes(field.factKey)
          ? petNeed
          : artifact.kind === "owner_acknowledgment" &&
              field.factKey === OWNER_EXPLANATION_FACT
            ? OWNER_EXPLANATION_NEED
            : "";
      if (label === "") continue;
      holds.set(`${artifact.kind}\u0000${field.factKey}`, {
        artifactKind: artifact.kind,
        factKey: field.factKey,
        label,
      });
    }
  }
  return [...holds.values()].sort(
    (left, right) =>
      left.artifactKind.localeCompare(right.artifactKind) ||
      left.factKey.localeCompare(right.factKey),
  );
}

/** The distinct needs a form's holds name, in the order the lease shows them. */
export function formHoldLabels(
  holds: readonly PacketFormHold[] | undefined,
  artifactKind: string,
): string[] {
  return [
    ...new Set(
      (holds ?? [])
        .filter((hold) => hold.artifactKind === artifactKind)
        .map((hold) => hold.label),
    ),
  ];
}
