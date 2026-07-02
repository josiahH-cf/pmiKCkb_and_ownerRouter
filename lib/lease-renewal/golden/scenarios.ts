// Synthetic golden scenarios (R2). Ground-truth-labeled inputs for the reconciliation pipeline,
// built on the shipped synthetic sample (lib/lease-renewal/sample-sheet.ts) — NO real client data, so
// these are committable and CI-safe. Live-captured golden sets (gitignored, in-boundary) layer on the
// same GoldenScenario shape later. Labels are derived from the reconciliation RULES (what SHOULD fire),
// not from current pipeline output, so a regression that adds noise or drops a real flag fails the gate.

import {
  SAMPLE_NON_SHEET_CANDIDATES,
  SAMPLE_RENEWAL_TABLES,
} from "@/lib/lease-renewal/sample-sheet";
import type { GoldenScenario } from "@/lib/lease-renewal/golden/harness";

// The Renewals header row (column order documented in lib/lease-renewal/sample-sheet.ts).
const RENEWALS_HEADER = SAMPLE_RENEWAL_TABLES[0][0];
const COL_NAME = 2; // "What is the Lease/Tenant name?"
const COL_RENEWAL_DATE = 3; // "Renewal Date"

/** A Renewals row that is blank except for the tenant name and any explicit column overrides. */
function renewalsRow(name: string, overrides: Record<number, string> = {}): string[] {
  const row = RENEWALS_HEADER.map(() => "");
  row[COL_NAME] = name;
  for (const [index, value] of Object.entries(overrides)) {
    row[Number(index)] = value;
  }
  return row;
}

const READ_TS = "2026-06-20T00:00:00.000Z";

export const GOLDEN_SCENARIOS: readonly GoldenScenario[] = [
  {
    name: "comprehensive-sample",
    category: "wrong",
    description:
      "Full synthetic sample: agreeing fields raise nothing; two High conflicts (Casey timing + rent); a Medium cadence conflict; a Blocked no-precedence-rule case; and a not-renewing/unmatched row that must stay silent.",
    input: {
      runId: "golden-comprehensive",
      tables: SAMPLE_RENEWAL_TABLES,
      nonSheetCandidates: SAMPLE_NON_SHEET_CANDIDATES,
    },
    expectedFlags: [
      { tab: "Renewals", sourceRowIndex: 2, fieldKey: "renewal_date", severity: "High" },
      { tab: "Renewals", sourceRowIndex: 2, fieldKey: "current_rent", severity: "High" },
      {
        tab: "Renewals",
        sourceRowIndex: 1,
        fieldKey: "tenant_responded",
        severity: "Blocked",
      },
      {
        tab: "Inspection Tracker",
        sourceRowIndex: 1,
        fieldKey: "inspections_cadence",
        severity: "Medium",
      },
      {
        tab: "Property Attributes",
        sourceRowIndex: 1,
        fieldKey: "lawn_care",
        severity: "High",
      },
    ],
  },
  {
    name: "not-renewing-blank-high-fields-stay-silent",
    category: "edge",
    description:
      "The 397-noise guard: a row with blank High-severity fields and NO authoritative source must NOT raise a flag (missing + no match is suppressed).",
    input: {
      runId: "golden-suppressed",
      tables: [[RENEWALS_HEADER, renewalsRow("Taylor Birch")]],
      nonSheetCandidates: [],
    },
    expectedFlags: [],
  },
  {
    name: "blank-sheet-field-with-authoritative-value-is-single-source",
    category: "edge",
    description:
      "Noise-reduction guard: a blank sheet field that an authoritative source carries is single-source — the authoritative value stands, so it raises NO flag. Flagging every blank cell RentVine can fill would recreate the 397-noise.",
    input: {
      runId: "golden-blank-with-source",
      tables: [[RENEWALS_HEADER, renewalsRow("Taylor Birch")]],
      nonSheetCandidates: [
        {
          source: "rentvine",
          source_system: "Rentvine (read-authoritative)",
          joinKind: "name",
          joinValue: "Taylor Birch",
          read_timestamp: READ_TS,
          fields: { renewal_date: { value: "2026-10-31", confidence: "Verified" } },
        },
      ],
    },
    expectedFlags: [],
  },
  {
    name: "agreement-raises-nothing",
    category: "correct",
    description: "A sheet value the authoritative source agrees with must raise no flag.",
    input: {
      runId: "golden-agree",
      tables: [
        [
          RENEWALS_HEADER,
          renewalsRow("Taylor Birch", { [COL_RENEWAL_DATE]: "10/31/2026" }),
        ],
      ],
      nonSheetCandidates: [
        {
          source: "rentvine",
          source_system: "Rentvine (read-authoritative)",
          joinKind: "name",
          joinValue: "Taylor Birch",
          read_timestamp: READ_TS,
          fields: { renewal_date: { value: "2026-10-31", confidence: "Verified" } },
        },
      ],
    },
    expectedFlags: [],
  },
];
