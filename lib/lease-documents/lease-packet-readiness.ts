// S235 ARCH-S235-1 / R-S235-1 / R-S235-2: the read-only per-family readiness for one lease. It
// composes the existing family readiness, the recorded family use and where it came from, the
// approved original and its reviewed map. Viewing writes nothing; "Evaluate packet" stays the
// explicit snapshot step, and an engineering default is never presented as client policy.
//
// S268 (R-S268-1, R-S268-3): each family also says why it applies, does not apply or is undecided,
// and is bound to its exact approved original and map. A map reviewed for a different original, an
// original whose file changed after review, a map that changed after review or a packet catalog that
// names another version holds that family alone; every other family keeps its readiness and the
// manual handoff. Each missing item is structured by kind, evidence and responsible role, so
// Documents and signatures can lead with the first packet input or the exact Source pending
// handoff, or with the actual signing wait. A shared-charge comparison (supplied by the offer's
// charge review) that reports a discrepancy holds only the affected family, with the exact
// difference.

import { ARTIFACT_INTAKE_STATE_LABELS } from "@/lib/lease-documents/artifact-intake-contract";
import type {
  ArtifactIntakeEntry,
  ArtifactIntakeManifest,
} from "@/lib/lease-documents/artifact-intake-contract";
import {
  mapHashOf,
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
import { PACKET_FACT_DEFINITIONS } from "@/lib/lease-documents/packet-inputs";
import { formatCentralTime } from "@/lib/lease-documents/returned-state-view";
import type {
  FormFamilyUse,
  LeaseArtifactKind,
  PacketBlocker,
  PacketEvaluation,
  RenewalPacketSnapshot,
} from "@/lib/lease-documents/packet-types";

/**
 * S283 R-S283-7: a form family or rule still on its default reads Needs Verification. A default
 * still is not policy and holds nothing by itself; the Admin form-family field keeps its own hint.
 */
export const FORM_USE_NEEDS_VERIFICATION_LABEL =
  "Needs Verification: PMI KC has not confirmed this form use.";

/**
 * S283 R-S283-3: a packet fact key's staff label, the one Packet inputs shows; readable words from
 * the key's last part when Packet inputs has none. The key itself stays in Verification.
 */
export function packetFactStaffLabel(fieldKey: string): string {
  const defined = PACKET_FACT_DEFINITIONS[fieldKey]?.label;
  if (defined) return defined;
  const last = fieldKey.split(".").at(-1) ?? fieldKey;
  const words = last
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : fieldKey;
}

/** Every known packet fact key, longest first, so a longer key is replaced before its prefix. */
const KNOWN_FACT_KEYS = Object.keys(PACKET_FACT_DEFINITIONS).sort(
  (left, right) => right.length - left.length,
);

/**
 * S283 R-S283-3: staff wording for a line that names packet fact keys. Each known key, and each
 * extra key given, is replaced by its staff label. Pure.
 */
export function withStaffFactLabels(
  text: string,
  extraKeys: readonly (string | undefined)[] = [],
): string {
  const keys = [
    ...new Set([
      ...extraKeys.filter((key): key is string => Boolean(key)),
      ...KNOWN_FACT_KEYS,
    ]),
  ].sort((left, right) => right.length - left.length);
  let result = text;
  for (const key of keys)
    if (result.includes(key)) result = result.split(key).join(packetFactStaffLabel(key));
  return result;
}

/** The Verification line for one fact key: its staff label and the key itself. */
function verificationLine(fieldKey: string): string {
  return `${packetFactStaffLabel(fieldKey)}: ${fieldKey}`;
}

/**
 * S268: what one missing item is. A packet input is a fact staff enter in Packet inputs; a source
 * item waits on an approved original, map, version or answer from someone else; a hold is a form
 * that waits on a named difference, such as a shared charge the accepted offer and the packet
 * disagree on.
 */
export type PacketPendingKind = "packet_input" | "source" | "hold";

export interface PacketPendingItem {
  readonly kind: PacketPendingKind;
  /** What is missing, in the words the lease shows. */
  readonly evidence: string;
  /** Who supplies it. */
  readonly role: string;
  /** The exact missing line, as Documents' readiness evaluates it. */
  readonly text: string;
  /**
   * S283 R-S283-3: the same line in staff words, with each fact key replaced by its staff label;
   * the key is listed in Verification. Absent when the line names no key.
   */
  readonly staffText?: string;
  /** The packet fact staff enter for it, when it is a packet input with one. */
  readonly fieldKey?: string;
}

export interface LeasePacketFamilyRow {
  readonly kind: string;
  readonly label: string;
  readonly use: string;
  readonly useSource: string;
  readonly applicability: string;
  /** S268: why this family applies, does not apply or is undecided for this lease. */
  readonly applicabilityReason?: string | null;
  readonly original: string;
  readonly map: string;
  /** Each missing input with who supplies it; empty when nothing is missing for this family. */
  readonly missing: readonly string[];
  /**
   * S283 R-S283-3: the same missing lines in staff words, which the Missing column shows; each
   * raw fact key is in `verification`.
   */
  readonly staffMissing?: readonly string[];
  /** S283 R-S283-3: the fact keys behind this family's lines, each with its staff label. */
  readonly verification?: readonly string[];
  /** S268: the same missing items, each with its kind, evidence and responsible role. */
  readonly pending?: readonly PacketPendingItem[];
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
  /** S268: the same missing context facts, structured as packet inputs. */
  readonly pending?: readonly PacketPendingItem[];
  readonly saved: string;
  /** S283 R-S283-3: the basis lines in staff words (staff label, value and when it was read). */
  readonly staffBasis?: readonly string[];
  /** S283 R-S283-3: the missing lines in staff words. */
  readonly staffMissing?: readonly string[];
  /** S283 R-S283-3: the raw basis lines and fact keys, shown only in Verification. */
  readonly verification?: readonly string[];
}

/**
 * S268 / S264 seam: one shared charge of the offer the tenant accepted, compared with the economics
 * of one packet family that carries the same charge. The offer's charge review supplies it; a
 * discrepancy holds only that family, with the exact difference, and a match holds nothing.
 */
export interface OfferPacketChargeComparison {
  readonly family: LeaseArtifactKind;
  readonly state: "match" | "discrepancy";
  /** The shared charge, in staff words. */
  readonly charge: string;
  /** The covered offer row's amount and cadence, as shown. */
  readonly offer: string;
  /** The packet economics' amount and cadence for the same charge, as shown. */
  readonly packet: string;
}

const OFFER_DISCREPANCY_ROLE = "renewal staff, in Review offer charges";

/** The exact difference a discrepancy names, in staff words. */
export function offerPacketDiscrepancy(comparison: OfferPacketChargeComparison): string {
  return `${comparison.charge}: the accepted offer has ${comparison.offer} and this form's packet has ${comparison.packet}`;
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

/**
 * A packet-input item for one evaluation blocker, with its exact Missing line. S283 R-S283-3: its
 * staff line names the fact by its staff label, and the key goes to Verification.
 */
function inputItem(blocker: PacketBlocker, text: string): PacketPendingItem {
  return {
    kind: "packet_input",
    evidence: blocker.label,
    role: "staff",
    text,
    ...(blocker.fieldKey
      ? {
          fieldKey: blocker.fieldKey,
          staffText: `${withStaffFactLabels(blocker.label, [blocker.fieldKey])} (staff)`,
        }
      : {}),
  };
}

/** S283 R-S283-3: the staff lines and the Verification lines of a list of missing items. */
function staffProjection(pending: readonly PacketPendingItem[]): {
  staffMissing: string[];
  verification: string[];
} {
  return {
    staffMissing: pending.map((item) => item.staffText ?? withStaffFactLabels(item.text)),
    verification: [
      ...new Set(
        pending.flatMap((item) =>
          item.fieldKey ? [verificationLine(item.fieldKey)] : [],
        ),
      ),
    ],
  };
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
  // S283 R-S283-3: the page shows each basis fact by its staff label; the raw line, with its key
  // and source reference, is kept for Verification.
  const staffBasis: string[] = [];
  for (const fact of [
    evidence?.transactionType,
    evidence?.managementOrigin,
    evidence?.activeLeaseExecuted,
    evidence?.formFamily,
  ]) {
    if (fact) {
      const readAt =
        formatCentralTime(fact.source.retrievedAt) ?? "unreadable source time";
      basis.push(
        `${fact.fieldKey}: ${String(fact.normalizedValue)} · ${fact.source.system}:${fact.source.reference}${fact.source.version ? ` · ${fact.source.version}` : ""} · ${readAt}`,
      );
      staffBasis.push(
        `${packetFactStaffLabel(fact.fieldKey)}: ${packetFactValueLabel(fact.fieldKey, fact.normalizedValue)} · read ${readAt}`,
      );
    }
  }
  if (evidence?.formFamilyPolicy) {
    const policy = evidence.formFamilyPolicy;
    const line = `Form-family compatibility: ${policy.formFamily} · ${policy.extensionCompatible ? "extension compatible" : "full lease required"}`;
    basis.push(
      `${line} · ${policy.source.system}:${policy.source.reference}${policy.source.version ? ` · ${policy.source.version}` : ""}`,
    );
    staffBasis.push(line);
  }
  const pending = evaluation.packetContext
    ? []
    : evaluation.blockers.map((blocker) =>
        inputItem(
          blocker,
          `${blocker.label} (${blocker.fieldKey ?? blocker.scope}; staff)`,
        ),
      );
  const staff = staffProjection(pending);
  return {
    state: "current",
    label: evaluation.packetContext
      ? CONTEXT_LABELS[evaluation.packetContext]
      : "Packet context needs input",
    observedAt: input.observedAt,
    basis,
    missing: pending.map((item) => item.text),
    pending,
    saved,
    staffBasis,
    staffMissing: staff.staffMissing,
    verification: [...basis, ...staff.verification],
  };
}

/** S283 R-S283-3: a choice value by the label Packet inputs shows; other values as they are. */
function packetFactValueLabel(fieldKey: string, value: unknown): string {
  const choice = PACKET_FACT_DEFINITIONS[fieldKey]?.choices?.find(
    (entry) => entry.value === value,
  );
  if (choice) return choice.label;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
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

const MAP_ROLE = "engineering prepares; document approver reviews meaning";

type BindingIssue =
  | "changed_original"
  | "stale_map"
  | "map_changed"
  | "competing_version";

/**
 * S268 R-S268-1: whether the family's approved original and map are still the exact ones reviewed.
 * The map names the publication it was reviewed against; the classification keeps the hash of the
 * file that was reviewed; the stored map hash binds the reviewed map; and the evaluated catalog
 * names the version a packet would use. Any difference holds this family alone.
 */
function bindingIssues(
  entry: ArtifactIntakeEntry | null,
  evaluation: PacketEvaluation | null,
  kind: string,
): BindingIssue[] {
  if (!entry) return [];
  const issues: BindingIssue[] = [];
  const publication = entry.publication;
  if (
    publication &&
    entry.classification &&
    entry.classification.contentHash !== publication.contentHash
  )
    issues.push("changed_original");
  if (entry.fieldMap && entry.fieldMap.templateVersion !== publication?.reference)
    issues.push("stale_map");
  if (entry.fieldMap && entry.mapHash && mapHashOf(entry.fieldMap) !== entry.mapHash)
    issues.push("map_changed");
  if (entry.state === "approved" && publication) {
    const publicationId = publication.reference.slice("publication:".length);
    const catalogued = [
      ...(evaluation?.manifest?.includedArtifacts ?? []),
      ...(evaluation?.manifest?.excludedArtifacts ?? []),
    ].filter((artifact) => artifact.kind === kind);
    if (
      catalogued.some(
        (artifact) =>
          (artifact.contentHash !== undefined &&
            artifact.contentHash !== publication.contentHash) ||
          (artifact.version !== undefined && artifact.version !== publicationId),
      )
    )
      issues.push("competing_version");
  }
  return issues;
}

export function projectLeasePacketReadiness(input: {
  readonly manifest: ArtifactIntakeManifest;
  readonly evaluation: PacketEvaluation | null;
  readonly familyUse: {
    readonly readable: boolean;
    readonly families: readonly FormFamilyUse[];
  };
  /**
   * S268 / S264 seam: the accepted offer's shared charges compared with each family's packet
   * economics. A discrepancy holds only that family; absent, nothing is compared here.
   */
  readonly offerComparisons?: readonly OfferPacketChargeComparison[] | null;
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
    const includedFamily = evaluation?.manifest?.includedArtifacts.find(
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
    // S268 R-S268-1: why, in the evaluation's own words where it has them.
    const applicabilityReason = notUsed
      ? FAMILY_NOT_USED_REASON
      : otherContext && evaluation?.packetContext
        ? `This form is not part of a ${CONTEXT_LABELS[evaluation.packetContext].toLowerCase()} packet.`
        : outsidePolicy
          ? "The current packet policy does not list this form."
          : (includedFamily?.reason ??
            evaluatedFamily?.reason ??
            (applicability === "required"
              ? "The current packet policy requires this form."
              : applicability === "unknown"
                ? "The facts that decide whether this form applies are not recorded yet."
                : null));
    const issues = bindingIssues(entry, evaluation, family.kind);
    const approvedOriginal = entry?.state === "approved" && entry.publication;
    const original =
      approvedOriginal && issues.includes("changed_original")
        ? `Original ${entry.publication!.reference} changed after it was reviewed; it is not approved as it is now`
        : approvedOriginal
          ? `Approved original ${entry.publication!.reference} · ${shortHash(entry.publication!.contentHash)}`
          : input.manifest.state === "unreadable"
            ? "The approved original intake could not be read"
            : entry
              ? `${ARTIFACT_INTAKE_STATE_LABELS[entry.state]}; no approved original yet`
              : "No approved original received";
    const map = !entry?.fieldMap
      ? "No reviewed field and signer map"
      : issues.includes("stale_map")
        ? `Map ${entry.fieldMap.mapVersion} was reviewed for ${entry.fieldMap.templateVersion}, not this original`
        : issues.includes("map_changed")
          ? `Map ${entry.fieldMap.mapVersion} changed after it was reviewed`
          : `Reviewed map ${entry.fieldMap.mapVersion}${entry.mapHash ? ` · ${shortHash(entry.mapHash)}` : ""}`;
    const pending: PacketPendingItem[] = [];
    const need = (
      kind: PacketPendingKind,
      evidence: string,
      role: string,
      text = `${evidence} (${role})`,
      fieldKey?: string,
    ) => pending.push({ kind, evidence, role, text, ...(fieldKey ? { fieldKey } : {}) });
    const catalogSetup: string[] = [];
    if (!input.familyUse.readable)
      need("source", "Family use could not be read", "Admin");
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
        need("source", "The approved form intake could not be read", "team");
      if (
        applicability === "required" &&
        input.manifest.state !== "unreadable" &&
        !(entry?.state === "approved" && entry.publication)
      )
        need("source", "The approved original", "client document approver");
      if (
        applicability === "required" &&
        input.manifest.state !== "unreadable" &&
        !entry?.fieldMap
      )
        need("source", "A field and signer map", MAP_ROLE);
      // S268 R-S268-1: a changed original, a stale or changed map, or a competing version holds
      // this family alone until it is reviewed again.
      if (applicability === "required") {
        if (issues.includes("changed_original"))
          need(
            "source",
            "The approved original, reviewed again for its current file",
            "client document approver",
          );
        if (issues.includes("stale_map"))
          need(
            "source",
            "A field and signer map reviewed for the current original",
            MAP_ROLE,
          );
        if (issues.includes("map_changed"))
          need(
            "source",
            "The field and signer map, reviewed again after it changed",
            MAP_ROLE,
          );
        if (issues.includes("competing_version"))
          need(
            "source",
            "One approved version of this form: the packet catalog and the approved original name different versions",
            "Admin",
          );
      }
      if (applicability === "required" && entry?.state === "approved")
        for (const blocker of evaluation?.blockers.filter(
          (value) => value.scope === family.kind && value.code === "artifact_unavailable",
        ) ?? [])
          need(
            "source",
            blocker.label,
            "team verifies the current approved publication/version",
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
          for (const blocker of facts)
            pending.push(
              inputItem(blocker, `${blocker.label} (${blocker.fieldKey}; staff)`),
            );
        else if (evaluatedFamily?.reason === HELD_ANIMAL_REASON)
          // S253 (R-S253-6): the rule is the client's answer to give; the lease's other forms go on.
          need("source", HELD_ANIMAL_REASON, "client; an open question");
        else
          need(
            "packet_input",
            evaluatedFamily?.reason ??
              "The current packet facts that decide whether this family applies are unavailable",
            "staff",
          );
      }
      if (applicability === "not_evaluated")
        need(
          "source",
          "Current packet context could not be read",
          "team",
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
          need(
            "source",
            `${issue} An approved form or attachment with room for everyone`,
            "client document approver",
          );
      // S253 (R-S253-11): what this one form waits for. The lease's other forms go on.
      if (applicability === "required")
        for (const label of formHoldLabels(manifest?.formHolds, family.kind))
          need("packet_input", label, "staff", label);
      // S268 / S264: a shared charge the accepted offer and this form's packet disagree on holds
      // this form alone, with the exact difference.
      if (applicability === "required")
        for (const comparison of input.offerComparisons ?? [])
          if (comparison.family === family.kind && comparison.state === "discrepancy") {
            const evidence = offerPacketDiscrepancy(comparison);
            need(
              "hold",
              evidence,
              OFFER_DISCREPANCY_ROLE,
              `${evidence}. This form waits until they match (${OFFER_DISCREPANCY_ROLE})`,
            );
          }
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
      for (const issue of formNotes.mapIssues) need("source", issue, "Admin");
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
          ? FORM_USE_NEEDS_VERIFICATION_LABEL
          : "Recorded client decision",
      applicability: notUsed
        ? "Not used"
        : separate
          ? OWNER_ACKNOWLEDGMENT_SEPARATE_LABEL
          : APPLICABILITY_LABELS[applicability],
      // S283 R-S283-3: why the form applies, with each fact named by its staff label.
      applicabilityReason:
        applicabilityReason === null
          ? null
          : withStaffFactLabels(
              applicabilityReason,
              (evaluation?.blockers ?? []).map((blocker) => blocker.fieldKey),
            ),
      original,
      map,
      missing: pending.map((item) => item.text),
      ...staffProjection(pending),
      pending,
      catalogSetup,
    };
  });
}

// ---- S268: what Documents and signatures leads with ---------------------------------------------

/** The packet input's label as Packet inputs shows it; the field key when it has none. */
function packetInputLabel(item: PacketPendingItem): string {
  return (
    (item.fieldKey ? PACKET_FACT_DEFINITIONS[item.fieldKey]?.label : undefined) ??
    item.evidence
  );
}

/** The returned-document state the lead reads: the overall state and who still must sign. */
export interface PacketLeadReturnedState {
  readonly overall: string;
  readonly documents: readonly {
    readonly title: string;
    readonly stillMustSign: readonly {
      readonly name: string;
      readonly capacity: string;
    }[];
  }[];
}

export type PacketLead =
  /** Staff recorded the packet as sent: the lead is the actual wait and who still must sign. */
  | { readonly kind: "signing_wait"; readonly awaiting: readonly string[] }
  /** The current packet facts could not be read, so nothing below is current. */
  | { readonly kind: "unavailable"; readonly reason: string }
  /** The first fact staff enter in Packet inputs, and the form (or the packet) it is for. */
  | {
      readonly kind: "packet_input";
      readonly form: string;
      readonly need: string;
      readonly fieldKey: string | null;
    }
  /** A form that waits on a named difference, such as a shared charge. */
  | { readonly kind: "hold"; readonly form: string; readonly reason: string }
  /** The exact Source pending handoff: the form, the missing evidence and who supplies it. */
  | {
      readonly kind: "source_pending";
      readonly form: string;
      readonly evidence: string;
      readonly role: string;
      /** How many other forms also wait on a source. */
      readonly others: number;
    }
  /** Every applicable form has its approved original, map and inputs. */
  | { readonly kind: "ready" }
  /** No form applies to this lease yet. */
  | { readonly kind: "none" };

const SIGNING_STATES = new Set(["Sent for signature", "Partially signed"]);

/**
 * S268: the one thing Documents and signatures leads with. A packet staff recorded as sent leads
 * with the actual signing wait (a prepared or uploaded file never does). Otherwise: an unreadable
 * packet context, then the first packet context fact, then the first packet input of any form,
 * then a form held on a named difference, then the first exact Source pending handoff. Read only:
 * nothing is evaluated, prepared or saved here.
 */
export function projectPacketLead(input: {
  readonly rows: readonly LeasePacketFamilyRow[];
  readonly context: PacketContextReadiness | null;
  readonly returned?: PacketLeadReturnedState | null;
}): PacketLead {
  const returned = input.returned;
  if (returned && SIGNING_STATES.has(returned.overall)) {
    const awaiting = [
      ...new Set(
        returned.documents.flatMap((document) =>
          document.stillMustSign.map((entry) => `${entry.name}, ${entry.capacity}`),
        ),
      ),
    ];
    return {
      kind: "signing_wait",
      awaiting: awaiting.length
        ? awaiting
        : returned.documents.map((document) => `Signatures on ${document.title}`),
    };
  }
  if (input.context?.state === "unavailable")
    return {
      kind: "unavailable",
      reason: input.context.missing[0] ?? input.context.label,
    };
  const contextInput = input.context?.pending?.find(
    (item) => item.kind === "packet_input",
  );
  if (contextInput)
    return {
      kind: "packet_input",
      form: "This packet",
      need: packetInputLabel(contextInput),
      fieldKey: contextInput.fieldKey ?? null,
    };
  const pendingRows = input.rows.filter((row) => row.pending?.length);
  for (const row of pendingRows) {
    const item = row.pending!.find((entry) => entry.kind === "packet_input");
    if (item)
      return {
        kind: "packet_input",
        form: row.label,
        need: packetInputLabel(item),
        fieldKey: item.fieldKey ?? null,
      };
  }
  for (const row of pendingRows) {
    const item = row.pending!.find((entry) => entry.kind === "hold");
    if (item)
      return {
        kind: "hold",
        form: row.label,
        reason: `${item.evidence}. This form waits until they match.`,
      };
  }
  const sourceRows = pendingRows.filter((row) =>
    row.pending!.some((entry) => entry.kind === "source"),
  );
  if (sourceRows.length) {
    const item = sourceRows[0].pending!.find((entry) => entry.kind === "source")!;
    return {
      kind: "source_pending",
      form: sourceRows[0].label,
      evidence: item.evidence,
      role: item.role,
      others: sourceRows.length - 1,
    };
  }
  return input.rows.some((row) => row.applicability === APPLICABILITY_LABELS.required)
    ? { kind: "ready" }
    : { kind: "none" };
}
