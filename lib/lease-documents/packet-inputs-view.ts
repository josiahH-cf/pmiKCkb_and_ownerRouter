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
  PetAgreementAmounts,
} from "@/lib/lease-documents/charge-policy";
import { formNotesOf } from "@/lib/lease-documents/form-notes";
import { ownerAcknowledgmentTransactionId } from "@/lib/lease-documents/owner-acknowledgment";
import {
  OWNER_EXPLANATION_FACT,
  ownerExplanationState,
  type OwnerExplanationState,
} from "@/lib/lease-documents/owner-explanation";
import {
  layoutStaticParagraphs,
  paragraphLayoutIssue,
  staticRegionBox,
} from "@/lib/lease-documents/static-pdf";
import {
  workingEntry,
  type RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";
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
  /**
   * S253 (R-S253-4): the pet agreement's fee, deposit and total with what is still needed, as the
   * calculator made them. Null when the current sources are unavailable.
   */
  petAgreement?: PetAgreementAmounts | null;
  /**
   * S253 (R-S253-3): where a pet's deposit comes from under the published policy: recorded by
   * staff on the lease, or supplied by the policy's published tiers.
   */
  depositEntry?: "staff_record" | "published_tiers";
  /** S253 (R-S253-7): the owner acknowledgment's explanation for this lease and cycle. */
  ownerExplanation?: OwnerExplanationView | null;
}

/** The box a saved explanation prints in, laid out exactly as the filler sets it. */
export interface OwnerExplanationPreview {
  /** The lines as they print; an empty line separates two paragraphs. */
  lines: string[];
  /** How many lines the reviewed box holds at its reviewed text size. */
  capacity: number;
  /** Why the text cannot be set in the box, in the filler's own words; null when it fits. */
  issue: string | null;
}

export interface OwnerExplanationView extends OwnerExplanationState {
  /** The identity the owner acknowledgment of this lease is evaluated and saved under. */
  transactionId: string;
  /** The team's starting text an Admin saved; empty when none is saved. */
  startingText: string;
  /** Null until an approved owner acknowledgment places the explanation in a reviewed box. */
  preview: OwnerExplanationPreview | null;
  /** What the approved owner acknowledgment leaves blank and what it prints, as information. */
  formNotes: string[];
  printed: string[];
}

export interface ResolvedPacketForView {
  input: PacketEvaluationInput;
  calculated: CalculatedCharges | null;
  sourceFacts: PacketFact[];
  sourceParties: SourceParty[];
  replacedSourceFacts: PacketFact[];
  ownerApproval: OwnerApprovalState;
  /** S234 R-S234-3: the approval notice naming exactly what changed, when not current. */
  ownerApprovalNotice?: string | null;
  notices: string[];
  /** S253: the lease's renewal cycle and Working terms, for the owner explanation's state. */
  workspace?: { cycleId: string } | null;
  working?: RenewalWorkingRecord | null;
  policy?: ChargePolicyRecord | null;
}

const WORKING_TERM_FIELDS = ["terms_rent", "terms_effective_date", "terms_end_date"];

/** When a renewal term of this lease was last recorded; null when none is, or a time is unreadable. */
function termsChangedAt(working: RenewalWorkingRecord | null | undefined): string | null {
  const times = WORKING_TERM_FIELDS.flatMap((field) => {
    const entry = workingEntry(working, field);
    return entry ? [entry.recordedAt] : [];
  }).filter((time) => Number.isFinite(Date.parse(time)));
  return times.length
    ? times.reduce((latest, time) =>
        Date.parse(time) > Date.parse(latest) ? time : latest,
      )
    : null;
}

function ownerExplanationView(
  record: PacketInputsRecord | null,
  resolved: ResolvedPacketForView,
  startingText: string,
): OwnerExplanationView {
  const state = ownerExplanationState({
    stored: record?.ownerExplanation,
    cycleId: resolved.workspace?.cycleId ?? null,
    termsChangedAt: termsChangedAt(resolved.working),
  });
  // The approved owner acknowledgment's own reviewed map decides the box and the form's notes.
  const map =
    resolved.input.catalog.artifacts.find(
      (artifact) =>
        artifact.kind === "owner_acknowledgment" &&
        artifact.status === "active" &&
        artifact.fillMapping,
    )?.fillMapping?.map ?? null;
  const field = map?.fields.find((entry) => entry.factKey === OWNER_EXPLANATION_FACT);
  const region = map?.static?.regions.find(
    (entry) =>
      entry.fieldId === field?.fieldId && entry.slot === 0 && entry.format === "paragraphs",
  );
  let preview: OwnerExplanationPreview | null = null;
  if (map?.static && region) {
    const layout = layoutStaticParagraphs(
      state.text ?? "",
      staticRegionBox(map.static, region),
    );
    const issue = paragraphLayoutIssue(layout);
    preview = {
      lines: layout.lines.map((line) => line.text.trimEnd()),
      capacity: layout.capacity,
      issue: issue ? `${issue.charAt(0).toUpperCase()}${issue.slice(1)}` : null,
    };
  }
  const notes = formNotesOf(map);
  return {
    ...state,
    transactionId: ownerAcknowledgmentTransactionId(resolved.input.leaseId),
    startingText,
    preview,
    formNotes: notes.notes,
    printed: notes.printed,
  };
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
  /** S253: the team's starting text for the owner explanation; empty when none is saved. */
  startingText?: string;
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
              : (resolved.ownerApprovalNotice ??
                OWNER_APPROVAL_NOTICES[resolved.ownerApproval]),
        }
      : { state: "unavailable", notice: input.unavailableReason ?? null },
    questions: [...questions.values()],
    formFamilies:
      resolved?.input.catalog.formFamilies.map((family) => family.formFamily) ?? [],
    notices:
      resolved?.notices ?? (input.unavailableReason ? [input.unavailableReason] : []),
    petAgreement: calculated?.petAgreement ?? null,
    depositEntry: input.policy.record?.content.animals
      ? "published_tiers"
      : "staff_record",
    ownerExplanation: resolved
      ? ownerExplanationView(input.record, resolved, input.startingText ?? "")
      : null,
  };
}
