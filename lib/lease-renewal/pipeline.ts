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
import { proposeJoin, type JoinKind } from "@/lib/lease-renewal/join";
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
  /** Non-null exactly when the reconciliation raised a flag. */
  queueMapping: ReconciliationQueueMapping | null;
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

/**
 * Run the Phase-1 read → reconcile → flag pipeline over a flattened sheet export plus synthetic
 * non-sheet reads. Deterministic and side-effect-free.
 */
export function runRenewalPipeline(input: RenewalRunInput): RenewalRunResult {
  const { runId, tables, nonSheetCandidates } = input;
  const fieldSpecs = input.fieldSpecs ?? DEFAULT_FIELD_SPECS;
  const { records, manifest, excludedTabs } = ingestTables(tables, input.tableJoinIds);

  const outcomes: ReconciledFieldOutcome[] = [];

  for (const record of records) {
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
      const recordId = record.joinId ?? input.recordJoinIds?.[record.sourceRowIndex];
      const joinRaw = record.fields[spec.joinFieldKey]?.raw ?? "";
      const matched: ReconCandidate[] = [];
      for (const candidate of nonSheetCandidates) {
        const candidateField = candidate.fields[spec.fieldKey];
        if (candidateField === undefined) continue;
        // A joined source that carries no value for this field contributes nothing — don't count it
        // as a match, so the §2.1 worklist suppression and §2.3 downgrade key on values actually
        // contributed (reconcileField drops empty candidates anyway). Mirrors reconciliation's hasValue.
        if (candidateField.value === null || String(candidateField.value).trim() === "") {
          continue;
        }
        // An exact RentVine-id match is definitive (bypasses the fuzzy join). Otherwise fall back to
        // the fuzzy name/address join, which never auto-merges: only an above-threshold "match"
        // becomes a candidate; "ambiguous"/"no_match" leave the record single-source / unmerged.
        const idMatch =
          recordId !== undefined &&
          candidate.joinId !== undefined &&
          candidate.joinId === recordId;
        const fuzzyMatch =
          !idMatch &&
          candidate.joinKind === spec.joinKind &&
          joinRaw.trim() !== "" &&
          proposeJoin(joinRaw, candidate.joinValue, spec.joinKind).status === "match";
        if (!idMatch && !fuzzyMatch) continue;
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

      const queueMapping = mapReconciliationToQueueItem(reconciliation, {
        runId,
        fieldLabel,
      });

      outcomes.push({
        recordRef: {
          tab: record.tab,
          tabNumber: record.tabNumber,
          sourceRowIndex: record.sourceRowIndex,
        },
        fieldKey: spec.fieldKey,
        fieldLabel,
        reconciliation,
        queueMapping,
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
