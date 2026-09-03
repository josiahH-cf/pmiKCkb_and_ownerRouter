// Phase-1 read pipeline orchestrator for the renewal sheet connector (read-only; design §3, §5.1).
//
// Composes the deterministic Phase-1 units into one renewal run: ingest the flattened sheet export,
// then — for each reconcilable field on each assembled record — assemble candidates across sources
// (the sheet's NormalizedValue plus the synthetic Rentvine / building-level / Google-Form reads,
// joined by the fuzzy join MATCH-ONLY, never auto-merged), reconcile, route severity, and map every
// flag-raising reconciliation onto an Approval-Queue item draft.
//
// PURE and DETERMINISTIC: no I/O, no Firestore, no live call, and NO Date.now() — every timestamp is
// an input. The IngestManifest passes through counts-only and the queue drafts stay PII-free (real
// values live only inside the in-boundary reconciliation candidates, behind deep links — design
// §6.1). This module writes nothing: `production_allowed` is a literal `false`.

import {
  mapReconciliationToQueueItem,
  type ApprovalQueueItemDraft,
  type ReconciliationQueueMapping,
} from "@/lib/lease-renewal/approval-queue-mapping";
import {
  ingestTables,
  type ExcludedTab,
  type IngestManifest,
} from "@/lib/lease-renewal/ingest";
import { deriveAddressKey, proposeJoin, type JoinKind } from "@/lib/lease-renewal/join";
import type { NormalizedConfidence } from "@/lib/lease-renewal/normalized-value";
import {
  rentsAgree,
  toRentAmount,
  type RentAgreementOptions,
} from "@/lib/lease-renewal/rent";
import {
  reconcileField,
  type FieldReconciliation,
  type ReconCandidate,
} from "@/lib/lease-renewal/reconciliation";
import type { FieldContext, Severity } from "@/lib/lease-renewal/severity";
import type { RawGrid } from "@/lib/lease-renewal/sheet-types";
import { renewalResolutionCandidateFingerprint } from "@/lib/lease-renewal/resolution-fingerprint";
import { createHash } from "node:crypto";

/** One field value carried by a non-sheet source (Rentvine / building level / Google Form). */
export interface NonSheetFieldValue {
  value: string | number | boolean | null;
  raw?: string;
  confidence?: NormalizedConfidence;
}

/**
 * A synthetic read from a non-sheet source. Joined to a sheet record by `joinValue` through the
 * fuzzy join. In Phase 1 these are supplied as plain data (fixtures); a future approved live runner
 * would populate them from a read-only Rentvine / Form read. Never the result of a write.
 */
export interface NonSheetCandidate {
  /** Precedence identifier matching the §3.4 order (e.g. "rentvine", "rentvine_building", "google_form"). */
  source: string;
  /** Human-facing source label. */
  source_system: string;
  joinKind: JoinKind;
  /** Raw join value (address or tenant/lease name) used to match a sheet record. */
  joinValue: string;
  /**
   * Optional exact join id (e.g. the RentVine lease id "lease:123"). When both a record and a
   * candidate carry the same `joinId`, that is a definitive match — it bypasses the fuzzy name/address
   * join entirely (design §1.1.4; the sheet hyperlinks each row back to its RentVine dashboard).
   */
  joinId?: string;
  /** Read timestamp captured at read time — accepted as INPUT, never Date.now(). */
  read_timestamp?: string;
  /** Deep link to the external evidence for this candidate. */
  location_ref?: string;
  /** Field values this source carries, keyed by the same field keys ingest emits. */
  fields: Record<string, NonSheetFieldValue>;
}

/** Declares one reconcilable field: which sheet records carry it and how to join non-sheet sources. */
export interface ReconcilableFieldSpec {
  fieldKey: string;
  /** Precedence id of the sheet candidate (must appear in the field's §3.4 order to be suggestible). */
  sheetSource: string;
  joinKind: JoinKind;
  /** Record field whose raw value derives the join key. */
  joinFieldKey: string;
  /** Restrict this spec to records from one logical tab (the same field key appears on many tabs). */
  tab?: string;
  /** Human-facing label; falls back to the humanized field key. */
  fieldLabel?: string;
  context?: FieldContext;
}

export interface RenewalRunInput {
  runId: string;
  /** The flattened sheet export — an ordered list of back-to-back sub-tables. */
  tables: RawGrid[];
  nonSheetCandidates: NonSheetCandidate[];
  /** Defaults to DEFAULT_FIELD_SPECS. */
  fieldSpecs?: readonly ReconcilableFieldSpec[];
  /**
   * Exact RentVine join id per sheet record, keyed by `sourceRowIndex` (from the row's hyperlink —
   * see lease-renewal/rentvine-link). When present, it matches a candidate's `joinId` definitively,
   * bypassing the fuzzy name/address join. Optional — omit to use the fuzzy join only.
   *
   * Prefer `tableJoinIds` for the live path: it travels with the row through ingest's divider-drop +
   * re-stitch (which `sourceRowIndex` does not survive cleanly). `record.joinId` (set from
   * `tableJoinIds`) takes precedence over this map when both are present.
   */
  recordJoinIds?: Record<number, string>;
  /** Per-row RentVine join id parallel to `tables`, passed straight to ingest (sets `record.joinId`). */
  tableJoinIds?: readonly (readonly (string | null)[])[];
  /** Add-on accounting for the base-rent reconciliation (defaults to the known RBP + insurance). */
  rentReconciliation?: RentAgreementOptions;
}

export interface RecordRef {
  tab: string;
  tabNumber: number | null;
  sourceRowIndex: number;
}

export interface ReconciledFieldOutcome {
  recordRef: RecordRef;
  fieldKey: string;
  fieldLabel: string;
  reconciliation: FieldReconciliation;
  /** Exact versioned source-fact digest; persisted resolutions must match it to remain current. */
  candidateFingerprint: string;
  /** Non-null exactly when the reconciliation raised a flag. */
  queueMapping: ReconciliationQueueMapping | null;
  /**
   * Canonical property key (deriveAddressKey of the record's join value) for ADDRESS-joined fields;
   * undefined for name-joined fields. In-boundary only; never projected onto the value-free
   * board/queue.
   */
  propertyKey?: string;
  /** Exact non-Sheet join ids accepted for this row after one-to-one association. */
  matchedCandidateJoinIds?: readonly string[];
}

export interface RenewalRunResult {
  runId: string;
  /** Counts-only — passed through from ingest unchanged. */
  manifest: IngestManifest;
  /** Labels + reasons only — passed through from ingest unchanged. */
  excludedTabs: ExcludedTab[];
  /** Every reconciled field, flagged or benign. */
  outcomes: ReconciledFieldOutcome[];
  /** Only the flag-raising outcomes (a subset of `outcomes`). */
  flags: ReconciledFieldOutcome[];
  /** The Approval-Queue item drafts derived from `flags`. */
  queueItems: ApprovalQueueItemDraft[];
  /** Flags bucketed by severity; every key is present (possibly empty). */
  bySeverity: Record<Severity, ReconciledFieldOutcome[]>;
  /** Governance marker: this pipeline never authorizes a production write. */
  production_allowed: false;
}

/** Display order for severity buckets (first-match-wins matches the §3.3 rule order). */
export const SEVERITY_ORDER: readonly Severity[] = ["High", "Blocked", "Medium", "Low"];

/**
 * The reconcilable fields exercised by the simulation. Illustrative for Phase-1 — the exact field
 * set, join keys, and precedence stay subject to Dan's OQ-LEX-1 / OQ-JOIN-1 / OQ-PREC-1 calibration.
 * `sheetSource` values align with the §3.4 precedence order so a winner can be suggested.
 */
export const DEFAULT_FIELD_SPECS: readonly ReconcilableFieldSpec[] = [
  {
    fieldKey: "renewal_date",
    sheetSource: "sheet_tab3",
    joinKind: "name",
    joinFieldKey: "tenant_name",
    tab: "Renewals",
    fieldLabel: "Renewal date",
  },
  {
    fieldKey: "current_rent",
    sheetSource: "sheet_tab3",
    joinKind: "name",
    joinFieldKey: "tenant_name",
    tab: "Renewals",
    fieldLabel: "Current rent",
  },
  {
    // No §3.4 precedence rule -> a conflict routes to Blocked "no precedence rule" (OQ-PREC-1).
    fieldKey: "tenant_responded",
    sheetSource: "spreadsheet",
    joinKind: "name",
    joinFieldKey: "tenant_name",
    tab: "Renewals",
    fieldLabel: "Tenant renewal response",
  },
  {
    fieldKey: "inspections_cadence",
    sheetSource: "sheet_tab17",
    joinKind: "address",
    joinFieldKey: "address",
    tab: "Inspection Tracker",
    fieldLabel: "Inspection cadence",
  },
  {
    fieldKey: "lawn_care",
    sheetSource: "spreadsheet",
    joinKind: "address",
    joinFieldKey: "property",
    tab: "Property Attributes",
    fieldLabel: "Lawn care responsibility",
  },
  {
    fieldKey: "utilities_needed",
    sheetSource: "spreadsheet",
    joinKind: "address",
    joinFieldKey: "property",
    tab: "Property Attributes",
    fieldLabel: "Utilities responsibility",
  },
];

function humanizeKey(fieldKey: string): string {
  return fieldKey.replace(/_/g, " ");
}

/** In-app evidence anchor where the field's real values are reviewed (inside the auth boundary). */
function reconciliationEvidenceLink(runId: string, fieldKey: string): string {
  return `/lease-renewal/runs/${runId}/reconciliation/${fieldKey}`;
}

/** PII-free stable token for one sheet record. Exact provider id wins; row coordinate is fallback. */
export function renewalDecisionRecordKey(
  recordId: string | undefined,
  recordRef: RecordRef,
): string {
  return createHash("sha256")
    .update(
      recordId
        ? `join:${recordId}`
        : `row:${recordRef.tabNumber ?? "x"}:${recordRef.sourceRowIndex}`,
    )
    .digest("hex")
    .slice(0, 16);
}

/**
 * Run the Phase-1 read → reconcile → flag pipeline over a flattened sheet export plus synthetic
 * non-sheet reads. Deterministic and side-effect-free.
 */
export function runRenewalPipeline(input: RenewalRunInput): RenewalRunResult {
  const { runId, tables, nonSheetCandidates } = input;
  const fieldSpecs = input.fieldSpecs ?? DEFAULT_FIELD_SPECS;
  const { records, manifest, excludedTabs } = ingestTables(tables, input.tableJoinIds);

  type IngestedRecord = (typeof records)[number];
  const recordIdFor = (record: IngestedRecord): string | undefined =>
    record.joinId ?? input.recordJoinIds?.[record.sourceRowIndex];

  type EntityJoinContract = Pick<
    ReconcilableFieldSpec,
    "tab" | "joinKind" | "joinFieldKey"
  >;
  const entityContractKey = (contract: EntityJoinContract): string =>
    JSON.stringify([contract.tab ?? null, contract.joinKind, contract.joinFieldKey]);

  // Associate entities before projecting any individual field. A same-name RentVine lease still
  // participates in ambiguity detection when that lease lacks the field currently being
  // reconciled; otherwise the one lease that happens to carry a rent/date could be accepted as
  // falsely unique. Exact ids win. Duplicate exact ids and fuzzy one-to-many/many-to-one relations
  // fail closed. Independent source systems may each contribute one unique entity.
  const buildEntityAssociations = (contract: EntityJoinContract) => {
    const recordIndexes = records.flatMap((record, index) =>
      (contract.tab === undefined || contract.tab === record.tab) &&
      record.fields[contract.joinFieldKey] !== undefined
        ? [index]
        : [],
    );
    const candidateIndexesBySource = new Map<string, number[]>();
    nonSheetCandidates.forEach((candidate, index) => {
      if (candidate.joinKind !== contract.joinKind) return;
      candidateIndexesBySource.set(candidate.source, [
        ...(candidateIndexesBySource.get(candidate.source) ?? []),
        index,
      ]);
    });
    const recordIndexesById = new Map<string, number[]>();
    for (const recordIndex of recordIndexes) {
      const id = recordIdFor(records[recordIndex]);
      if (id)
        recordIndexesById.set(id, [...(recordIndexesById.get(id) ?? []), recordIndex]);
    }

    const accepted = new Map<number, number[]>();
    for (const candidateIndexes of candidateIndexesBySource.values()) {
      const candidateIndexesById = new Map<string, number[]>();
      for (const candidateIndex of candidateIndexes) {
        const id = nonSheetCandidates[candidateIndex].joinId;
        if (id)
          candidateIndexesById.set(id, [
            ...(candidateIndexesById.get(id) ?? []),
            candidateIndex,
          ]);
      }

      const recordsWithExactEvidence = new Set<number>();
      const candidatesWithExactEvidence = new Set<number>();
      for (const [id, matchingRecords] of recordIndexesById) {
        const matchingCandidates = candidateIndexesById.get(id) ?? [];
        if (matchingCandidates.length === 0) continue;
        matchingRecords.forEach((index) => recordsWithExactEvidence.add(index));
        matchingCandidates.forEach((index) => candidatesWithExactEvidence.add(index));
        if (matchingRecords.length === 1 && matchingCandidates.length === 1) {
          accepted.set(matchingRecords[0], [
            ...(accepted.get(matchingRecords[0]) ?? []),
            matchingCandidates[0],
          ]);
        }
      }

      const fuzzyCandidatesByRecord = new Map<number, number[]>();
      const fuzzyRecordsByCandidate = new Map<number, number[]>();
      for (const recordIndex of recordIndexes) {
        if (recordsWithExactEvidence.has(recordIndex)) continue;
        const record = records[recordIndex];
        const recordId = recordIdFor(record);
        const joinRaw = record.fields[contract.joinFieldKey]?.raw ?? "";
        if (joinRaw.trim() === "") continue;
        for (const candidateIndex of candidateIndexes) {
          if (candidatesWithExactEvidence.has(candidateIndex)) continue;
          const candidate = nonSheetCandidates[candidateIndex];
          if (recordId !== undefined && candidate.joinId !== undefined) continue;
          if (
            proposeJoin(joinRaw, candidate.joinValue, contract.joinKind).status !==
            "match"
          ) {
            continue;
          }
          fuzzyCandidatesByRecord.set(recordIndex, [
            ...(fuzzyCandidatesByRecord.get(recordIndex) ?? []),
            candidateIndex,
          ]);
          fuzzyRecordsByCandidate.set(candidateIndex, [
            ...(fuzzyRecordsByCandidate.get(candidateIndex) ?? []),
            recordIndex,
          ]);
        }
      }
      for (const recordIndex of recordIndexes) {
        if (recordsWithExactEvidence.has(recordIndex)) continue;
        const candidates = fuzzyCandidatesByRecord.get(recordIndex) ?? [];
        if (
          candidates.length === 1 &&
          (fuzzyRecordsByCandidate.get(candidates[0]) ?? []).length === 1
        ) {
          accepted.set(recordIndex, [
            ...(accepted.get(recordIndex) ?? []),
            candidates[0],
          ]);
        }
      }
    }
    return accepted;
  };

  const associationsByEntityContract = new Map<
    string,
    ReturnType<typeof buildEntityAssociations>
  >();
  for (const spec of fieldSpecs) {
    const key = entityContractKey(spec);
    if (!associationsByEntityContract.has(key)) {
      associationsByEntityContract.set(key, buildEntityAssociations(spec));
    }
  }

  const outcomes: ReconciledFieldOutcome[] = [];

  for (const [recordIndex, record] of records.entries()) {
    for (const spec of fieldSpecs) {
      if (spec.tab !== undefined && spec.tab !== record.tab) continue;
      const sheetField = record.fields[spec.fieldKey];
      if (sheetField === undefined) continue;

      const fieldLabel = spec.fieldLabel ?? humanizeKey(spec.fieldKey);
      const evidenceLink = reconciliationEvidenceLink(runId, spec.fieldKey);

      const sheetCandidate: ReconCandidate = {
        source: spec.sheetSource,
        source_system: "Renewal sheet",
        value: sheetField.value,
        raw: sheetField.raw,
        confidence: sheetField.confidence,
        location_ref: `${evidenceLink}#${spec.sheetSource}`,
      };

      // Prefer the id carried on the record (from tableJoinIds, survives ingest's re-stitch); fall
      // back to the sourceRowIndex map.
      const recordId = recordIdFor(record);
      const joinRaw = record.fields[spec.joinFieldKey]?.raw ?? "";
      // Canonical property key for ADDRESS-joined fields only (name-joined lifecycle fields carry no
      // address, so no property). In-boundary only; never projected onto the value-free board/queue.
      const propertyKey =
        spec.joinKind === "address" ? deriveAddressKey(joinRaw).key : undefined;
      const matched: ReconCandidate[] = [];
      const matchedSources: NonSheetCandidate[] = [];
      const entityAssociations = associationsByEntityContract.get(
        entityContractKey(spec),
      );
      for (const candidateIndex of entityAssociations?.get(recordIndex) ?? []) {
        const candidate = nonSheetCandidates[candidateIndex];
        const candidateField = candidate.fields[spec.fieldKey];
        if (
          candidateField === undefined ||
          candidateField.value === null ||
          String(candidateField.value).trim() === ""
        ) {
          continue;
        }
        matchedSources.push(candidate);
        matched.push({
          source: candidate.source,
          source_system: candidate.source_system,
          value: candidateField.value,
          raw: candidateField.raw,
          confidence: candidateField.confidence,
          read_timestamp: candidate.read_timestamp,
          location_ref: candidate.location_ref ?? `${evidenceLink}#${candidate.source}`,
        });
      }

      let reconciliation = reconcileField(
        spec.fieldKey,
        [sheetCandidate, ...matched],
        spec.context ?? {},
      );

      // §2.1: a blank sheet cell with NO authoritative (non-sheet) match joined is just un-started
      // worklist — the tracker is a live worklog, not a defect list — so it does not raise a flag.
      if (reconciliation.agreement === "missing" && matched.length === 0) {
        reconciliation = { ...reconciliation, raise_flag: false };
      }

      // §2.3: a current_rent "conflict" is suppressed ONLY when EVERY joined authoritative amount is
      // the same base rent as the sheet once the known add-ons (RBP + insurance) are accounted for.
      // RentVine's rent is the base and the sheet may fold the add-ons IN, so suppression is
      // one-directional (sheet >= the authoritative amount); a sheet figure BELOW the base, or any
      // single joined amount whose gap is not add-on-explained, keeps the flag. Downgrade only.
      if (
        reconciliation.raise_flag &&
        reconciliation.agreement === "conflict" &&
        spec.fieldKey === "current_rent"
      ) {
        const sheetAmount = toRentAmount(sheetCandidate.value);
        const matchedAmounts = matched
          .map((candidate) => toRentAmount(candidate.value))
          .filter((amount): amount is number => amount !== null);
        if (
          sheetAmount !== null &&
          matchedAmounts.length > 0 &&
          matchedAmounts.every(
            (amount) =>
              sheetAmount >= amount &&
              rentsAgree(sheetAmount, amount, input.rentReconciliation),
          )
        ) {
          reconciliation = { ...reconciliation, raise_flag: false };
        }
      }

      const recordRef = {
        tab: record.tab,
        tabNumber: record.tabNumber,
        sourceRowIndex: record.sourceRowIndex,
      };
      const queueMapping = mapReconciliationToQueueItem(reconciliation, {
        runId,
        fieldLabel,
        recordKey: renewalDecisionRecordKey(recordId, recordRef),
      });

      outcomes.push({
        recordRef,
        fieldKey: spec.fieldKey,
        fieldLabel,
        reconciliation,
        candidateFingerprint: renewalResolutionCandidateFingerprint(
          spec.fieldKey,
          reconciliation.candidates,
          {
            recordIdentity: recordId
              ? `join:${recordId}`
              : `row:${recordRef.tabNumber ?? "x"}:${recordRef.sourceRowIndex}`,
            sourceIdentities: matchedSources.map((candidate) => ({
              source: candidate.source,
              joinKind: candidate.joinKind,
              joinId: candidate.joinId ?? null,
              joinValue: candidate.joinValue,
            })),
          },
        ),
        queueMapping,
        propertyKey,
        ...(matchedSources.some((candidate) => candidate.joinId)
          ? {
              matchedCandidateJoinIds: matchedSources.flatMap((candidate) =>
                candidate.joinId ? [candidate.joinId] : [],
              ),
            }
          : {}),
      });
    }
  }

  const flags = outcomes.filter((outcome) => outcome.reconciliation.raise_flag);
  const queueItems = flags
    .map((outcome) => outcome.queueMapping?.queueItem)
    .filter((item): item is ApprovalQueueItemDraft => item !== undefined);

  const bySeverity: Record<Severity, ReconciledFieldOutcome[]> = {
    High: [],
    Blocked: [],
    Medium: [],
    Low: [],
  };
  for (const outcome of flags) {
    bySeverity[outcome.reconciliation.severity].push(outcome);
  }

  return {
    runId,
    manifest,
    excludedTabs,
    outcomes,
    flags,
    queueItems,
    bySeverity,
    production_allowed: false,
  };
}
