// S66 (BEH-S66-1): what the Packet inputs editor shows for one lease. Server-side and read-only:
// the saved inputs, the current RentVine values offered for adoption, the calculated charges, the
// owner-approval state and the exact questions the current packet evaluation is still asking.
// Nothing here writes, and a value is never adopted on the person's behalf.

import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import type {
  AnimalChargeResult,
  CalculatedCharges,
  ChargeCadence,
  ChargePolicyRecord,
} from "@/lib/lease-documents/charge-policy";
import {
  OWNER_APPROVAL_NOTICES,
  type OwnerApprovalState,
} from "@/lib/lease-documents/owner-approval-binding";
import type { SourceParty } from "@/lib/lease-documents/packet-assembly";
import {
  PACKET_FACT_DEFINITIONS,
  type PacketFactValue,
  type PacketInputsRecord,
} from "@/lib/lease-documents/packet-inputs";
import type {
  PacketEvaluationInput,
  PacketFact,
} from "@/lib/lease-documents/packet-types";

export interface PacketQuestion {
  fieldKey: string;
  label: string;
  type: "text" | "number" | "boolean" | "date" | "money" | "choice";
  choices?: ReadonlyArray<{ value: string; label: string }>;
  /** Why it is listed: always offered, or named by the current evaluation. */
  reason: "standard" | "missing" | "invalid" | "conflict";
}

export interface PacketInputsView {
  record: PacketInputsRecord | null;
  chargePolicy: {
    readable: boolean;
    version: number | null;
    effectiveFrom: string | null;
  };
  charges: {
    animals: AnimalChargeResult[];
    totals: Record<ChargeCadence, number | null>;
    issues: string[];
    packageMonthlyCents: number | null;
    insuranceMonthlyCents: number | null;
  } | null;
  source: {
    available: boolean;
    facts: Array<{ fieldKey: string; value: PacketFactValue; reference: string }>;
    parties: SourceParty[];
    /** Source values a staff entry deliberately replaced. */
    replaced: Array<{ fieldKey: string; value: PacketFactValue }>;
  };
  ownerApproval: { state: OwnerApprovalState | "unavailable"; notice: string | null };
  questions: PacketQuestion[];
  formFamilies: string[];
  notices: string[];
}

export interface ResolvedPacketForView {
  input: PacketEvaluationInput;
  calculated: CalculatedCharges | null;
  sourceFacts: PacketFact[];
  sourceParties: SourceParty[];
  replacedSourceFacts: PacketFact[];
  ownerApproval: OwnerApprovalState;
  notices: string[];
}

function mapMeanings(input: PacketEvaluationInput): Map<string, string> {
  const meanings = new Map<string, string>();
  for (const artifact of input.catalog.artifacts)
    for (const field of artifact.fillMapping?.map.fields ?? [])
      if (!meanings.has(field.factKey)) meanings.set(field.factKey, field.meaning);
  return meanings;
}

export function buildPacketInputsView(input: {
  record: PacketInputsRecord | null;
  policy: { readable: boolean; record: ChargePolicyRecord | null };
  resolved: ResolvedPacketForView | null;
  unavailableReason?: string;
}): PacketInputsView {
  const { resolved } = input;
  const questions = new Map<string, PacketQuestion>();
  for (const [fieldKey, definition] of Object.entries(PACKET_FACT_DEFINITIONS))
    questions.set(fieldKey, { fieldKey, ...definition, reason: "standard" });
  if (resolved) {
    const meanings = mapMeanings(resolved.input);
    const evaluation = evaluateRenewalPacket(resolved.input);
    for (const blocker of evaluation.blockers) {
      const fieldKey = blocker.fieldKey;
      // People and animals have their own sections; only lease facts are asked here.
      if (!fieldKey || fieldKey.startsWith("party.") || fieldKey.startsWith("animals."))
        continue;
      const reason =
        blocker.code === "conflicting_fact"
          ? "conflict"
          : blocker.code === "invalid_fact"
            ? "invalid"
            : "missing";
      const known = questions.get(fieldKey);
      questions.set(fieldKey, {
        fieldKey,
        label:
          known?.label ??
          meanings.get(fieldKey) ??
          (fieldKey.startsWith("family.")
            ? `${fieldKey.split(".")[1].replaceAll("_", " ")} applies to this lease`
            : fieldKey),
        type: known?.type ?? (fieldKey.startsWith("family.") ? "boolean" : "text"),
        ...(known?.choices ? { choices: known.choices } : {}),
        reason,
      });
    }
  }
  for (const fieldKey of Object.keys(input.record?.facts ?? {}))
    if (!questions.has(fieldKey))
      questions.set(fieldKey, {
        fieldKey,
        label: fieldKey,
        type: "text",
        reason: "standard",
      });
  const calculated = resolved?.calculated ?? null;
  const amount = (kind: string) =>
    calculated?.charges.find((charge) => charge.kind === kind && charge.applicable)
      ?.amountCents ?? null;
  return {
    record: input.record,
    chargePolicy: {
      readable: input.policy.readable,
      version: input.policy.record?.version ?? null,
      effectiveFrom: input.policy.record?.effectiveFrom ?? null,
    },
    charges: calculated
      ? {
          animals: calculated.animals,
          totals: calculated.totals,
          issues: calculated.issues.map((issue) => issue.label),
          packageMonthlyCents: amount("resident_benefit_package"),
          insuranceMonthlyCents: amount("insurance"),
        }
      : null,
    source: {
      available: resolved !== null,
      facts: (resolved?.sourceFacts ?? []).map((fact) => ({
        fieldKey: fact.fieldKey,
        value: fact.normalizedValue,
        reference: fact.source.reference,
      })),
      parties: resolved?.sourceParties ?? [],
      replaced: (resolved?.replacedSourceFacts ?? []).map((fact) => ({
        fieldKey: fact.fieldKey,
        value: fact.normalizedValue,
      })),
    },
    ownerApproval: resolved
      ? {
          state: resolved.ownerApproval,
          notice:
            resolved.ownerApproval === "current"
              ? null
              : OWNER_APPROVAL_NOTICES[resolved.ownerApproval],
        }
      : { state: "unavailable", notice: input.unavailableReason ?? null },
    questions: [...questions.values()],
    formFamilies:
      resolved?.input.catalog.formFamilies.map((family) => family.formFamily) ?? [],
    notices:
      resolved?.notices ?? (input.unavailableReason ? [input.unavailableReason] : []),
  };
}
