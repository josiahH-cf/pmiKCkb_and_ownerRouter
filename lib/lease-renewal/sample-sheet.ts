// Governance-clean SYNTHETIC sample for the lease-renewal simulation run (design §6.3).
//
// This is shipped demo data — NOT real client data. Every name, address, amount, date, and
// credential placeholder is invented; the credential-tab values are deliberately digit-free and
// carry the literal token "PLACEHOLDER" so they can never be mistaken for a real secret (and so the
// falsification secret-scan stays clean). The header strings are reproduced from the sanitized
// semantic map (generic question strings, not client data) so the fixtures fingerprint to the known
// renewal tabs. The unit-test corpus in tests/fixtures/lease-renewal/ is separate; this file lets
// `lib/` ship its own demo sample without importing test code into the app bundle.

import type { NonSheetCandidate } from "@/lib/lease-renewal/pipeline";
import type { RawGrid } from "@/lib/lease-renewal/sheet-types";

// Tab 3 — Renewals (primary). Three synthetic tenants exercise an agreeing record, a conflicting
// record, and a single-source (no Rentvine match) record.
const SAMPLE_RENEWALS: RawGrid = [
  [
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
  ],
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
];

// Tab 17 — Inspection Tracker. The cadence field conflicts with the Rentvine building-level read.
const SAMPLE_INSPECTION_TRACKER: RawGrid = [
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
];

// Tab 18 — Property Attributes. Lawn-care responsibility conflicts with the building-level read.
const SAMPLE_PROPERTY_ATTRIBUTES: RawGrid = [
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
];

// Tab 4 — PadSplit WiFi (CREDENTIAL-BEARING). Must be hard-excluded; digit-free PLACEHOLDER values.
const SAMPLE_CREDENTIAL_WIFI: RawGrid = [
  ["House", "WiFi Name", "WiFi Password", "Garage Spot", "OG Member?"],
  [
    "Birchwood House",
    "BIRCHWOOD-GUEST-NET",
    "WIFI-PASS-PLACEHOLDER-ALPHA",
    "G-one",
    "yes",
  ],
  ["Elmgrove House", "ELMGROVE-GUEST-NET", "WIFI-PASS-PLACEHOLDER-BETA", "G-two", "no"],
];

// Tab 7 — Platform Logins (CREDENTIAL-BEARING). Must be hard-excluded; digit-free PLACEHOLDER values.
const SAMPLE_CREDENTIAL_LOGINS: RawGrid = [
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
];

/** The flattened sample export. Credential tabs are present so the connector exercises exclusion. */
export const SAMPLE_RENEWAL_TABLES: RawGrid[] = [
  SAMPLE_RENEWALS,
  SAMPLE_INSPECTION_TRACKER,
  SAMPLE_PROPERTY_ATTRIBUTES,
  SAMPLE_CREDENTIAL_WIFI,
  SAMPLE_CREDENTIAL_LOGINS,
];

const READ_TIMESTAMP = "2026-06-20T00:00:00.000Z";

/**
 * Synthetic non-sheet reads (Rentvine read-authoritative + building level + Google Form). Crafted to
 * produce a representative mix: agreeing fields (no flag), High conflicts, a Medium cadence conflict,
 * and a Blocked "no precedence rule" case. Values are synthetic; timestamps are fixed for stability.
 */
export const SAMPLE_NON_SHEET_CANDIDATES: NonSheetCandidate[] = [
  {
    source: "rentvine",
    source_system: "Rentvine (read-authoritative)",
    joinKind: "name",
    joinValue: "Jordan Maple",
    read_timestamp: READ_TIMESTAMP,
    fields: {
      // Agrees with the sheet — demonstrates a benign, no-flag reconciliation.
      renewal_date: { value: "2026-08-31", confidence: "Verified" },
      current_rent: { value: 1250, confidence: "Verified" },
    },
  },
  {
    source: "rentvine",
    source_system: "Rentvine (read-authoritative)",
    joinKind: "name",
    joinValue: "Casey Rivers",
    read_timestamp: READ_TIMESTAMP,
    fields: {
      // Conflicts with the sheet on two High-severity (timing + financial) fields.
      renewal_date: { value: "2026-09-01", confidence: "Verified" },
      current_rent: { value: 1400, confidence: "Verified" },
    },
  },
  {
    source: "google_form",
    source_system: "Google Form intake",
    joinKind: "name",
    joinValue: "Jordan Maple",
    read_timestamp: READ_TIMESTAMP,
    fields: {
      // No §3.4 precedence rule for this field -> Blocked "no precedence rule" (OQ-PREC-1).
      tenant_responded: { value: false, confidence: "Likely" },
    },
  },
  {
    source: "rentvine_building",
    source_system: "Rentvine building level",
    joinKind: "address",
    joinValue: "100 Birchwood Lane",
    read_timestamp: READ_TIMESTAMP,
    fields: {
      // High (legal) conflict: the sheet says HOA, the building record says Tenant.
      lawn_care: { value: "Tenant", confidence: "Verified" },
      // Medium (operational) conflict on inspection cadence.
      inspections_cadence: { value: "1 per year", confidence: "Verified" },
      // Agrees with the sheet — no flag.
      utilities_needed: { value: "Spire/Evergy by tenant", confidence: "Verified" },
    },
  },
];
