// S264 R-S264-6 with S268: packet parity for the offer the tenant accepted. A form whose reviewed
// field map reads a shared charge (the Resident Benefits Package or insurance program amount, or
// an animal's monthly charge) is compared with the accepted offer's rows for that charge. Equal
// amounts are a match; any difference, or a charge only one side carries, is a discrepancy that
// holds that form alone, with the exact difference. A charge the packet cannot price yet is not
// compared here (the packet already waits for it). Pure: it reads, saves and decides nothing else.

import type { ArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import type { CalculatedCharges } from "@/lib/lease-documents/charge-policy";
import type { OfferPacketChargeComparison } from "@/lib/lease-documents/lease-packet-readiness";
import {
  LEASE_ARTIFACT_KINDS,
  type PacketCharge,
} from "@/lib/lease-documents/packet-types";
import { formatCents } from "./offer-charges";
import type { OfferSnapshot } from "./offer-snapshot";

interface SharedCharge {
  readonly charge: string;
  /** The offer family whose monthly rows carry this charge. */
  readonly offerFamily: string;
  /** The packet facts a form's field map reads for this charge. */
  readonly factKeys: readonly string[];
  readonly packetKind: PacketCharge["kind"];
}

const SHARED_CHARGES: readonly SharedCharge[] = [
  {
    charge: "Resident Benefits Package",
    offerFamily: "rbp",
    factKeys: ["charges.resident_benefit_package.monthly"],
    packetKind: "resident_benefit_package",
  },
  {
    charge: "Insurance",
    offerFamily: "insurance",
    factKeys: ["charges.insurance.monthly"],
    packetKind: "insurance",
  },
  {
    charge: "Pet rent",
    offerFamily: "pet",
    factKeys: ["animal.monthly_charge"],
    packetKind: "animal",
  },
];

function describe(amounts: readonly number[]): string {
  return amounts.length
    ? amounts.map((cents) => `${formatCents(cents)} per month`).join(" and ")
    : "no such charge";
}

/** The accepted offer's covered rows compared with each form's packet economics. */
export function offerPacketComparisons(input: {
  readonly manifest: ArtifactIntakeManifest | null;
  readonly economics: CalculatedCharges | null;
  /** The exact offer the tenant's recorded acceptance answers; null compares nothing. */
  readonly accepted: OfferSnapshot | null;
}): OfferPacketChargeComparison[] {
  const { manifest, economics, accepted } = input;
  if (!manifest || manifest.state !== "readable" || !economics || !accepted) return [];
  const comparisons: OfferPacketChargeComparison[] = [];
  for (const kind of LEASE_ARTIFACT_KINDS) {
    const fields = manifest.entries[kind]?.fieldMap?.fields ?? [];
    for (const shared of SHARED_CHARGES) {
      if (!fields.some((field) => shared.factKeys.includes(field.factKey))) continue;
      const packetLines = economics.charges.filter(
        (charge) =>
          charge.kind === shared.packetKind &&
          (charge.cadence ?? "monthly") === "monthly",
      );
      // Not priced yet: the packet holds for that fact on its own.
      if (
        packetLines.some(
          (charge) =>
            charge.applicable === null ||
            (charge.applicable && charge.amountCents === undefined),
        )
      )
        continue;
      const offerRows = accepted.rows.filter(
        (row) =>
          row.family === shared.offerFamily &&
          row.cadence?.kind === "monthly" &&
          row.amountCents !== null,
      );
      const offer = offerRows.map((row) => row.amountCents!).sort((a, b) => a - b);
      const packet = packetLines
        .filter((charge) => charge.applicable && (charge.amountCents ?? 0) > 0)
        .map((charge) => charge.amountCents!)
        .sort((a, b) => a - b);
      const same =
        offer.length === packet.length &&
        offer.every((cents, index) => cents === packet[index]);
      comparisons.push({
        family: kind,
        state: same ? "match" : "discrepancy",
        charge: shared.charge,
        offer: describe(offer),
        packet: describe(packet),
      });
    }
  }
  return comparisons;
}
