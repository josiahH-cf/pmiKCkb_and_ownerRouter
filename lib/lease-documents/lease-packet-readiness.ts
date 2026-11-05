// S235 ARCH-S235-1 / R-S235-1 / R-S235-2: the read-only per-family readiness for one lease. It
// composes the existing family readiness, the recorded family use and where it came from, the
// approved original and its reviewed map. Viewing writes nothing; "Evaluate packet" stays the
// explicit snapshot step, and an engineering default is never presented as client policy.

import { ARTIFACT_INTAKE_STATE_LABELS } from "@/lib/lease-documents/artifact-intake-contract";
import type { ArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import {
  projectFamilyReadiness,
  slotCapacityIssues,
} from "@/lib/lease-documents/artifact-intake";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import {
  FAMILY_NOT_USED_REASON,
  HELD_ANIMAL_REASON,
} from "@/lib/lease-documents/evaluate-packet";
import { FAMILY_USE_LABELS } from "@/lib/lease-documents/family-use";
import { formHoldLabels } from "@/lib/lease-documents/form-holds";
import { formNotesOf } from "@/lib/lease-documents/form-notes";
import { LEASE_ARTIFACT_FAMILIES } from "@/lib/lease-documents/artifact-catalog";
import { formatCentralTime } from "@/lib/lease-documents/returned-state-view";
import type {
  FormFamilyUse,
  PacketEvaluation,
  RenewalPacketSnapshot,
} from "@/lib/lease-documents/packet-types";

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
  /** Shared catalog preparation, kept separate from this output's blockers. */
  readonly catalogSetup: readonly string[];
  /**
   * S253 (R-S253-8, R-S253-9): what the reviewed form leaves blank or keeps for a signer. Absent
   * when the form has nothing to say or does not apply to this lease.
   */
  readonly notes?: readonly string[];
  /** S253: a question this lease raises that the business has yet to answer. */
  readonly questions?: readonly string[];
  /** S253 (R-S253-10): organization, representative and signer text this form prints. */
  readonly printed?: readonly string[];
  /** The organization text alone, exactly as printed, to say whether two forms differ. */
  readonly organizations?: readonly string[];
}

export interface PacketContextReadiness {
  readonly state: "current" | "unavailable";
  readonly label: string;
  readonly observedAt: string | null;
  readonly basis: readonly string[];
  readonly missing: readonly string[];
  readonly saved: string;
}

const CONTEXT_LABELS = {
  renewal_extension: "Renewal extension",
  full_lease_packet: "Full lease packet",
  owner_acknowledgment: "Owner acknowledgment",
} as const;

/**
 * R-S235-8: which current read failed, in the app's own words. Only an app-authored refusal is
 * carried to the page; any other error reads generically so no store or provider detail leaks.
 */
export function safePacketReadFailure(error: unknown): string | null {
  return error instanceof EditableLayerError ? error.message : null;
}

/** Current display evidence never updates or substitutes for the saved execution snapshot. */
export function projectPacketContextReadiness(input: {
  readonly evaluation: PacketEvaluation | null;
  readonly observedAt: string | null;
  readonly savedSnapshot: RenewalPacketSnapshot | null;
  /** The safe reason the current read failed, when it did; otherwise the generic line is shown. */
  readonly readFailure?: string | null;
}): PacketContextReadiness {
  const { evaluation, savedSnapshot } = input;
  const saved = savedSnapshot
    ? `Saved packet snapshot ${savedSnapshot.snapshotId}, recorded ${formatCentralTime(savedSnapshot.createdAt) ?? "at an unreadable time"}, is retained separately; this view does not update it.${!evaluation && savedSnapshot.packetContext ? ` Its saved context is ${CONTEXT_LABELS[savedSnapshot.packetContext]} and has not been reverified.` : ""}`
    : "No saved packet snapshot; this current view writes nothing.";
  if (!evaluation)
    return {
      state: "unavailable",
      label: "Current packet context could not be read",
      observedAt: null,
      basis: [],
      missing: [
        input.readFailure
          ? `${input.readFailure.replace(/\.$/, "")} (team); reload to try again.`
          : "The current source or packet-input read did not complete (team); reload to try again.",
      ],
      saved,
    };
  const evidence = evaluation.classificationEvidence;
  const basis: string[] = [];
  for (const fact of [
    evidence?.transactionType,
    evidence?.managementOrigin,
    evidence?.activeLeaseExecuted,
    evidence?.formFamily,
  ]) {
    if (fact)
      basis.push(
        `${fact.fieldKey}: ${String(fact.normalizedValue)} · ${fact.source.system}:${fact.source.reference}${fact.source.version ? ` · ${fact.source.version}` : ""} · ${formatCentralTime(fact.source.retrievedAt) ?? "unreadable source time"}`,
      );
  }
  if (evidence?.formFamilyPolicy) {
    const policy = evidence.formFamilyPolicy;
    basis.push(
      `Form-family compatibility: ${policy.formFamily} · ${policy.extensionCompatible ? "extension compatible" : "full lease required"} · ${policy.source.system}:${policy.source.reference}${policy.source.version ? ` · ${policy.source.version}` : ""}`,
    );
  }
  return {
    state: "current",
    label: evaluation.packetContext
      ? CONTEXT_LABELS[evaluation.packetContext]
      : "Packet context needs input",
    observedAt: input.observedAt,
    basis,
    missing: evaluation.packetContext
      ? []
      : evaluation.blockers.map(
          (blocker) => `${blocker.label} (${blocker.fieldKey ?? blocker.scope}; staff)`,
        ),
    saved,
  };
}

const APPLICABILITY_LABELS = {
  required: "Applies to this lease",
  not_applicable: "Does not apply to this lease",
  not_in_policy: "Not part of the current packet policy",
  unknown: "Unknown until the packet facts are recorded",
  not_evaluated: "Current applicability unavailable",
} as const;
/** S253: the owner acknowledgment is its own packet beside the tenant packet. */
export const OWNER_ACKNOWLEDGMENT_SEPARATE_LABEL = "Prepared separately for the owner";

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
  // Applicability follows the execution evaluation of the resolved input: the families it
  // evaluated, the ones it excluded as not used, and the ones outside the approved catalog's
  // current policy. The separately recorded family use labels the Use column only.
  const manifest = input.evaluation?.manifest ?? null;
  const evaluatedKinds = manifest
    ? new Set<string>([
        ...manifest.includedArtifacts.map((artifact) => artifact.kind),
        ...manifest.excludedArtifacts.map((artifact) => artifact.kind),
        ...(input.evaluation?.blockers ?? []).map((blocker) => blocker.scope),
      ])
    : null;
  return families.map((family): LeasePacketFamilyRow => {
    const entry = input.manifest.entries[family.kind];
    const recordedUse = input.familyUse.families.find((use) => use.kind === family.kind);
    const notUsedByEvaluation = manifest
      ? manifest.excludedArtifacts.some(
          (artifact) =>
            artifact.kind === family.kind &&
            artifact.ruleResult === "Not applicable" &&
            artifact.reason === FAMILY_NOT_USED_REASON,
        )
      : null;
    const notUsed =
      notUsedByEvaluation ??
      (input.familyUse.readable && recordedUse?.use === "not_used");
    const evaluation = input.evaluation;
    const evaluatedFamily = evaluation?.manifest?.excludedArtifacts.find(
      (entry) => entry.kind === family.kind,
    );
    const otherContext =
      evaluation?.packetContext &&
      !LEASE_ARTIFACT_FAMILIES.find(
        (entry) => entry.kind === family.kind,
      )?.packetContexts.includes(evaluation.packetContext);
    const outsidePolicy =
      evaluatedKinds !== null && !otherContext && !evaluatedKinds.has(family.kind);
    const applicability = otherContext
      ? "not_applicable"
      : outsidePolicy
        ? "not_in_policy"
        : family.applicability === "unknown" &&
            evaluation?.blockers.some(
              (blocker) =>
                blocker.scope === family.kind && blocker.code === "artifact_unavailable",
            )
          ? "required"
          : family.applicability;
    const excluded =
      notUsed || applicability === "not_applicable" || applicability === "not_in_policy";
    const original =
      entry?.state === "approved" && entry.publication
        ? `Approved original ${entry.publication.reference} · ${shortHash(entry.publication.contentHash)}`
        : input.manifest.state === "unreadable"
          ? "The approved original intake could not be read"
          : entry
            ? `${ARTIFACT_INTAKE_STATE_LABELS[entry.state]}; no approved original yet`
            : "No approved original received";
    const map = entry?.fieldMap
      ? `Reviewed map ${entry.fieldMap.mapVersion}${entry.mapHash ? ` · ${shortHash(entry.mapHash)}` : ""}`
      : "No reviewed field and signer map";
    const missing: string[] = [];
    const catalogSetup: string[] = [];
    if (!input.familyUse.readable) missing.push("Family use could not be read (Admin)");
    else if (recordedUse?.source.system === "engineering_default")
      catalogSetup.push("The client's use decision, recorded by an Admin");
    if (
      notUsedByEvaluation === false &&
      input.familyUse.readable &&
      recordedUse?.use === "not_used" &&
      evaluatedKinds?.has(family.kind)
    )
      catalogSetup.push(
        "The approved catalog does not yet apply the recorded use; the current packet policy still evaluates this family (Admin)",
      );
    if (!excluded && input.familyUse.readable) {
      if (input.manifest.state === "unreadable")
        missing.push("The approved form intake could not be read (team)");
      if (
        applicability === "required" &&
        input.manifest.state !== "unreadable" &&
        !(entry?.state === "approved" && entry.publication)
      )
        missing.push("The approved original (client document approver)");
      if (
        applicability === "required" &&
        input.manifest.state !== "unreadable" &&
        !entry?.fieldMap
      )
        missing.push(
          "A field and signer map (engineering prepares; document approver reviews meaning)",
        );
      if (applicability === "required" && entry?.state === "approved")
        for (const blocker of evaluation?.blockers.filter(
          (value) => value.scope === family.kind && value.code === "artifact_unavailable",
        ) ?? [])
          missing.push(
            `${blocker.label} (team verifies the current approved publication/version)`,
          );
      if (applicability === "unknown") {
        const facts = evaluation?.blockers.filter(
          (blocker) =>
            blocker.fieldKey &&
            (blocker.scope === family.kind ||
              evaluatedFamily?.reason.includes(blocker.fieldKey) ||
              !evaluation.packetContext),
        );
        if (facts?.length)
          missing.push(
            ...facts.map((blocker) => `${blocker.label} (${blocker.fieldKey}; staff)`),
          );
        else if (evaluatedFamily?.reason === HELD_ANIMAL_REASON)
          // S253 (R-S253-6): the rule is the client's answer to give; the lease's other forms go on.
          missing.push(`${HELD_ANIMAL_REASON} (client; an open question)`);
        else
          missing.push(
            `${evaluatedFamily?.reason ?? "The current packet facts that decide whether this family applies are unavailable"} (staff)`,
          );
      }
      if (applicability === "not_evaluated")
        missing.push(
          "Current packet context could not be read (team); reload to try again.",
        );
      // R-S235-3: more recorded parties or animals than the reviewed map has places for.
      const manifest = input.evaluation?.manifest;
      if (applicability === "required" && entry?.fieldMap && manifest)
        for (const issue of slotCapacityIssues(entry.fieldMap, {
          parties: manifest.participants.filter(
            (participant) => participant.kind === entry.fieldMap!.audience,
          ).length,
          // S253: an assistance animal waiting on the approved rule is not placed on a form.
          animals: manifest.animals.filter((animal) => !animal.heldBy).length,
        }))
          missing.push(
            `${issue} An approved form or attachment with room for everyone (client document approver)`,
          );
      // S253 (R-S253-11): what this one form waits for. The lease's other forms go on.
      if (applicability === "required")
        missing.push(...formHoldLabels(manifest?.formHolds, family.kind));
    }
    // S253: the owner acknowledgment is prepared as its own packet, so in a tenant packet's view
    // it reads as prepared separately and still shows what its reviewed form leaves blank.
    const separate =
      Boolean(otherContext) &&
      family.kind === "owner_acknowledgment" &&
      !notUsed &&
      input.familyUse.readable;
    const formNotes =
      entry?.fieldMap && !notUsed && (applicability === "required" || separate)
        ? formNotesOf(
            entry.fieldMap,
            entry.fieldMap.audience === "tenant" && evaluation?.manifest
              ? evaluation.manifest.participants.filter(
                  (participant) => participant.kind === "tenant",
                ).length
              : null,
          )
        : null;
    if (formNotes?.mapIssues.length)
      missing.push(...formNotes.mapIssues.map((issue) => `${issue} (Admin)`));
    const organizations = formNotes
      ? (entry?.fieldMap?.printedParties ?? [])
          .filter((printed) => printed.kind === "organization")
          .map((printed) => printed.text)
      : [];
    return {
      ...(formNotes?.notes.length ? { notes: formNotes.notes } : {}),
      ...(formNotes?.questions.length ? { questions: formNotes.questions } : {}),
      ...(formNotes?.printed.length ? { printed: formNotes.printed } : {}),
      ...(organizations.length ? { organizations } : {}),
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
      applicability: notUsed
        ? "Not used"
        : separate
          ? OWNER_ACKNOWLEDGMENT_SEPARATE_LABEL
          : APPLICABILITY_LABELS[applicability],
      original,
      map,
      missing,
      catalogSetup,
    };
  });
}
