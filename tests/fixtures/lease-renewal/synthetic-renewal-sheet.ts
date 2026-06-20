// Synthetic, sanitized fixtures modeling the renewal sheet structure documented in
// docs/products/lease-renewal-spreadsheet-map.md. These feed every deterministic Phase-1 unit
// (fingerprint, headers, normalized-value, ingest).
//
// GOVERNANCE (AGENTS.md §5): ZERO real client data. Every tenant name, address, amount, date, and
// credential placeholder below is invented. Headers are reproduced verbatim from the *sanitized*
// semantic map (they are generic question strings, not client data). Credential-tab placeholders
// are deliberately digit-free and carry the literal token "PLACEHOLDER" so they can never be
// mistaken for — or accidentally replaced by — a real secret. See lease-renewal-fixtures.test.ts
// for the governance assertions that enforce this.

import type { RawGrid } from "@/lib/lease-renewal/sheet-types";

export interface SyntheticTabFixture {
  /** Inferred logical tab number from the semantic map §1. */
  tabNumber: number;
  /** Human label for the logical tab. */
  label: string;
  /** Credential-bearing tabs (4 & 7) the connector must hard-exclude and never echo. */
  credentialBearing: boolean;
  /** Row index that holds the resolvable header signature, or null when there is no header row. */
  headerRow: number | null;
  grid: RawGrid;
}

// Tab 3 — Renewals (primary), full 19-column header per the map §2. Three synthetic rows exercise
// name-format variance, date-format variance, currency, yes/n-a variants, and state-in-free-text.
export const RENEWALS_HEADER: readonly string[] = [
  "Have we confirmed pricing with the owner?",
  "Have we sent the renewal letter?",
  "What is the Lease/Tenant name?",
  "Renewal Date",
  "Current Rent",
  "Market Value",
  "Is this renewal completed?",
  "Have they responded if they are renewing or not?",
  "Have we sent the google form to gather info?",
  "Have they filled out the form?",
  "Have the lease docs been sent out",
  "If they have a rhino policy is it renewed?",
  "Have they registered their pet if needed?",
  "Have all documents been signed electronically?",
  "Have we verified that we are added as additional insured?",
  "Have we added the $11.95 charge to their ledger starting on the renewal date?",
  "Have we added them to the inspection sheet if needed?",
  "Did we set up their Air filter delivery",
  "did we get proof that utilities are set up if need be?",
];

export const SYNTHETIC_RENEWALS_TAB: SyntheticTabFixture = {
  tabNumber: 3,
  label: "Renewals",
  credentialBearing: false,
  headerRow: 0,
  grid: [
    RENEWALS_HEADER,
    [
      "yes",
      "yes 8/1/2026",
      "Jordan Maple",
      "8/31/2026",
      "$1,250",
      "$1,400",
      "yes",
      "yes",
      "yes",
      "yes",
      "yes",
      "no policy",
      "no pet",
      "yes",
      "yes",
      "yes",
      "yes",
      "already set up",
      "yes",
    ],
    [
      "yes",
      "yes 8/3/26",
      "RIVERS, CASEY",
      "8/31/26",
      "$1,300",
      "$1,350",
      "Needs Renewed",
      "ESTELLE WORKING ON",
      "yes",
      "no",
      "sent to Leah",
      "yes",
      "n/a",
      "",
      "not added",
      "n/a",
      "yes",
      "n/a",
      "",
    ],
    [
      "",
      "Dont renew",
      "pat solstice",
      "09-30-2026",
      "$1,500",
      "$1,500",
      "not renewing",
      "Dont renew",
      "",
      "",
      "",
      "no policy",
      "no pet",
      "",
      "",
      "",
      "",
      "",
      "",
    ],
  ],
};

// The condensed 6-col Renewals working fragment (map §2 note): no header row, month-end groups
// separated by `-----` divider rows and a `.` artifact row.
export const SYNTHETIC_RENEWALS_6COL_FRAGMENT: SyntheticTabFixture = {
  tabNumber: 3,
  label: "Renewals (6-col fragment)",
  credentialBearing: false,
  headerRow: null,
  grid: [
    ["-----", "-----", "-----", "-----", "-----", "-----"],
    ["Jordan Maple", "8/31/2026", "$1,250", "$1,400", "yes", "renewing"],
    [
      "Casey Rivers",
      "8/31/26",
      "$1,300",
      "$1,350",
      "Needs Renewed",
      "ESTELLE WORKING ON",
    ],
    [".", ".", ".", ".", ".", "."],
    ["-----", "-----", "-----", "-----", "-----", "-----"],
    ["Pat Solstice", "09-30-2026", "$1,500", "$1,500", "not renewing", "Dont renew"],
  ],
};

// Tab 1 — Move-In Checklist subset. Highlights the header/data mismatch: the `f` column holds
// timestamps and `Move in date` holds tenant emails (map §2, §7).
export const SYNTHETIC_MOVE_IN_TAB: SyntheticTabFixture = {
  tabNumber: 1,
  label: "Move-In Checklist",
  credentialBearing: false,
  headerRow: 0,
  grid: [
    [
      "f",
      "Move in date",
      "What is the Lease/Tenant name?",
      "Have we collected the processing fee?",
      "Have all documents been signed electronically?",
      "Have we received certified funds?",
    ],
    [
      "2026-07-15 09:30:00",
      "jordan.maple@example.com",
      "Jordan Maple",
      "yes",
      "yes",
      "yes",
    ],
    ["2026-07-20 14:00:00", "casey.rivers@example.com", "Casey Rivers", "yes", "no", ""],
  ],
};

// Tab 2 — Move-Out Checklist subset.
export const SYNTHETIC_MOVE_OUT_TAB: SyntheticTabFixture = {
  tabNumber: 2,
  label: "Move-Out Checklist",
  credentialBearing: false,
  headerRow: 0,
  grid: [
    [
      "Name",
      "Scheduled Move out date",
      "Have they put in their notice?",
      "Deposit disposition sent?",
      "everything finalized?",
    ],
    ["Dana Frost", "8/15/2026", "yes 7/1/2026", "", "no"],
    ["Lee Brooks", "9/1/2026", "eviction", "", "no"],
  ],
};

// Tab 17 — Inspection Tracker subset. Highlights the literal `FALSE` header (leaked checkbox
// default), mixed date formats, and the $130 owner-charge gate (map §2, §7).
export const SYNTHETIC_INSPECTION_TRACKER_TAB: SyntheticTabFixture = {
  tabNumber: 17,
  label: "Inspection Tracker",
  credentialBearing: false,
  headerRow: 0,
  grid: [
    [
      "Address",
      "Lease Start",
      "Inspections",
      "2024 Inspections",
      "FALSE",
      "Last inspection?",
      "Next inspection",
      "$130 charge to owner for missed inspection added to the invoice sheet?",
    ],
    [
      "100 Birchwood Ln",
      "3/1/2024",
      "1/2 per year",
      "TRUE",
      "FALSE",
      "01/2025",
      "07/2025",
      "yes",
    ],
    [
      "2200 Elmgrove Apt 4",
      "September 15, 2023",
      "1 per year",
      "FALSE",
      "FALSE",
      "",
      "01/2026",
      "",
    ],
  ],
};

// Tab 18 — Property Attributes subset. Highlights the blank-header column, `Lawn Care`
// (Owner/Tenant/Provided by HOA — the HOA-vs-tenant conflict field), and the `Inspections`
// cadence that duplicates Tab 17 (conflict risk; map §5, §7).
export const SYNTHETIC_PROPERTY_ATTRIBUTES_TAB: SyntheticTabFixture = {
  tabNumber: 18,
  label: "Property Attributes",
  credentialBearing: false,
  headerRow: 0,
  grid: [
    [
      "Property",
      "Unit",
      "Updated to Kwickset Smart Locks",
      "Utilities Needed",
      "Lawn Care",
      "Inspections",
      "Appliances provided",
      "",
      "Notes",
    ],
    [
      "100 Birchwood Ln",
      "1",
      "yes",
      "Spire/Evergy by tenant",
      "Provided by HOA",
      "1 per year",
      "Fridge, Range",
      "TRUE",
      "quiet unit",
    ],
    [
      "2200 Elmgrove",
      "4",
      "no",
      "KC Water by owner",
      "Tenant",
      "2 per year",
      "Fridge",
      "FALSE",
      "",
    ],
  ],
};

// Tab 4 — PadSplit WiFi (CREDENTIAL-BEARING). Synthetic, digit-free PLACEHOLDER values only; the
// connector must hard-exclude this tab and the emit scrubber must never echo it.
export const SYNTHETIC_CREDENTIAL_TAB_4: SyntheticTabFixture = {
  tabNumber: 4,
  label: "PadSplit WiFi / Garage / OG members",
  credentialBearing: true,
  headerRow: 0,
  grid: [
    ["House", "WiFi Name", "WiFi Password", "Garage Spot", "OG Member?"],
    [
      "Birchwood House",
      "BIRCHWOOD-GUEST-NET",
      "WIFI-PASS-PLACEHOLDER-ALPHA",
      "G-one",
      "yes",
    ],
    ["Elmgrove House", "ELMGROVE-GUEST-NET", "WIFI-PASS-PLACEHOLDER-BETA", "G-two", "no"],
  ],
};

// Tab 7 — Platform Logins (CREDENTIAL-BEARING). Synthetic, digit-free PLACEHOLDER values only.
export const SYNTHETIC_CREDENTIAL_TAB_7: SyntheticTabFixture = {
  tabNumber: 7,
  label: "Platform Logins",
  credentialBearing: true,
  headerRow: 0,
  grid: [
    ["Platform", "Username", "Password", "PIN"],
    [
      "TTLock",
      "synthetic-user-alpha",
      "PLATFORM-PW-PLACEHOLDER-ALPHA",
      "PLATFORM-PIN-PLACEHOLDER-ALPHA",
    ],
    [
      "Thermostat Portal",
      "synthetic-user-beta",
      "PLATFORM-PW-PLACEHOLDER-BETA",
      "PLATFORM-PIN-PLACEHOLDER-BETA",
    ],
  ],
};

// Tab 11 — Owner Onboarding subset with the off-by-one artifact (map §7): row 0 is a stray data
// row, the real header is on row 1. Header resolution must detect the header row, not assume row 0.
export const SYNTHETIC_OWNER_ONBOARDING_OFFBYONE_TAB: SyntheticTabFixture = {
  tabNumber: 11,
  label: "Owner Onboarding (off-by-one header)",
  credentialBearing: false,
  headerRow: 1,
  grid: [
    ["100 Birchwood Ln", "Maple Holdings LLC", "yes", "yes"],
    ["Property", "Owner", "PMA sent?", "PMA signed?"],
    ["2200 Elmgrove", "Elmgrove Trust", "yes", "no"],
  ],
};

// A grid whose header signature matches no known renewal tab — fingerprinting must return
// UNRECOGNIZED rather than guessing.
export const SYNTHETIC_UNRECOGNIZED_TAB: SyntheticTabFixture = {
  tabNumber: 15,
  label: "a/z sort helper (MURKY)",
  credentialBearing: false,
  headerRow: 0,
  grid: [
    ["a/z", "zzz", "scratch"],
    ["x", "", ""],
    ["y", "", ""],
  ],
};

// Every fixture, for iteration in fingerprint/ingest tests and the governance sweep.
export const SYNTHETIC_TAB_FIXTURES: readonly SyntheticTabFixture[] = [
  SYNTHETIC_RENEWALS_TAB,
  SYNTHETIC_RENEWALS_6COL_FRAGMENT,
  SYNTHETIC_MOVE_IN_TAB,
  SYNTHETIC_MOVE_OUT_TAB,
  SYNTHETIC_INSPECTION_TRACKER_TAB,
  SYNTHETIC_PROPERTY_ATTRIBUTES_TAB,
  SYNTHETIC_CREDENTIAL_TAB_4,
  SYNTHETIC_CREDENTIAL_TAB_7,
  SYNTHETIC_OWNER_ONBOARDING_OFFBYONE_TAB,
  SYNTHETIC_UNRECOGNIZED_TAB,
];

/** Flatten every fixture to a single list of raw cell strings (for governance scanning). */
export function allSyntheticCells(): string[] {
  return SYNTHETIC_TAB_FIXTURES.flatMap((fixture) =>
    fixture.grid.flatMap((row) => [...row]),
  );
}
