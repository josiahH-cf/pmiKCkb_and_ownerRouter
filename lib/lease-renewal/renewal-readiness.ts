// "Must never miss" renewal-readiness checklist (Phase-1, read-only; build-plan §2 exit milestone).
//
// Dan walked through the exact errors that get missed when a renewal goes to the build-out step
// (~00:58:45–01:19:53): an inherited lease needs the FULL document set (not the extension-only
// renewal template); a pre-1978 building needs the lead-based-paint addendum; Independence / Kansas
// City properties need the city addendum; the security-deposit TYPE must be explicit (never claim
// cash held when it's a replacement policy); a pet needs a pet deposit + registration; an LLC
// landlord name must carry the "LLC" suffix; a mid-month start needs prorated rent.
//
// This turns that list into deterministic checks that surface on the approval package BEFORE anything
// goes to Leia / Dotloop. CRITICAL invariant: a check whose input is unknown returns `needs_input`
// (a Blocked flag naming the missing fact) — NEVER a false all-clear. Pure and deterministic; no I/O.

import type { Severity } from "@/lib/lease-renewal/severity";

export type ReadinessStatus = "ok" | "flag" | "needs_input";

export interface ReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatus;
  severity: Severity;
  detail: string;
}

export type RenewalTemplate = "renewal_extension" | "full_set";
export type SecurityDepositType = "cash" | "replacement_policy";

export interface RenewalReadinessInput {
  /** Was the lease inherited from another management company (needs the full document set)? */
  inheritedLease?: boolean | null;
  /** Which document template was selected for the build-out. */
  templateSelected?: RenewalTemplate | null;
  /** Year the building was built (lead-based-paint addendum required if < 1978). */
  yearBuilt?: number | null;
  /** Property city (Independence / Kansas City need a city-specific addendum). */
  city?: string | null;
  hasPet?: boolean | null;
  petDepositSet?: boolean | null;
  securityDepositType?: SecurityDepositType | null;
  /** Does the form claim cash is held? (Must be false when the type is a replacement policy.) */
  claimsCashHeld?: boolean | null;
  landlordIsLlc?: boolean | null;
  landlordName?: string | null;
  /** Lease start date ISO; a non-first-of-month start needs prorated rent. */
  leaseStartIso?: string | null;
}

export interface RenewalReadinessResult {
  checks: ReadinessCheck[];
  flags: ReadinessCheck[];
  needsInput: ReadinessCheck[];
  /** True only when every check is `ok` — no flag and no missing input. */
  allClear: boolean;
  production_allowed: false;
}

const CITY_ADDENDUM_RE = /independence|kansas city/i;

function isUnknown(value: unknown): boolean {
  return value === undefined || value === null;
}

function needsInput(id: string, label: string, detail: string): ReadinessCheck {
  return { id, label, status: "needs_input", severity: "Blocked", detail };
}

function ok(id: string, label: string, detail: string): ReadinessCheck {
  return { id, label, status: "ok", severity: "Low", detail };
}

function flag(
  id: string,
  label: string,
  severity: Severity,
  detail: string,
): ReadinessCheck {
  return { id, label, status: "flag", severity, detail };
}

function checkInheritedFullSet(input: RenewalReadinessInput): ReadinessCheck {
  const id = "inherited_full_set";
  const label = "Inherited lease → full document set";
  if (isUnknown(input.inheritedLease)) {
    return needsInput(
      id,
      label,
      "Confirm whether this lease was inherited from another manager.",
    );
  }
  if (input.inheritedLease === false) {
    return ok(
      id,
      label,
      "Not inherited — the extension-only renewal template is appropriate.",
    );
  }
  if (isUnknown(input.templateSelected)) {
    return needsInput(
      id,
      label,
      "Inherited lease — confirm the full document set was selected.",
    );
  }
  if (input.templateSelected === "renewal_extension") {
    return flag(
      id,
      label,
      "High",
      "Inherited lease needs the full document set; select the full-document template for the build-out.",
    );
  }
  return ok(id, label, "Inherited lease with the full document set selected.");
}

function checkLeadPaint(input: RenewalReadinessInput): ReadinessCheck {
  const id = "lead_based_paint";
  const label = "Pre-1978 building → lead-based-paint addendum";
  if (isUnknown(input.yearBuilt)) {
    return needsInput(
      id,
      label,
      "Year built unknown — needed to decide the lead-paint addendum.",
    );
  }
  if ((input.yearBuilt as number) < 1978) {
    return flag(
      id,
      label,
      "High",
      "Built before 1978 — lead-based-paint disclosure addendum required.",
    );
  }
  return ok(id, label, "Built 1978 or later — no lead-paint addendum required.");
}

function checkCityAddendum(input: RenewalReadinessInput): ReadinessCheck {
  const id = "city_addendum";
  const label = "City-specific addendum";
  if (isUnknown(input.city) || String(input.city).trim() === "") {
    return needsInput(
      id,
      label,
      "Property city unknown — needed to decide the city addendum.",
    );
  }
  if (CITY_ADDENDUM_RE.test(String(input.city))) {
    return flag(
      id,
      label,
      "High",
      `Ensure the ${input.city} city-specific addendum is included.`,
    );
  }
  return ok(id, label, "No city-specific addendum required for this city.");
}

function checkSecurityDeposit(input: RenewalReadinessInput): ReadinessCheck {
  const id = "security_deposit_type";
  const label = "Security-deposit type explicit";
  if (isUnknown(input.securityDepositType)) {
    return needsInput(
      id,
      label,
      "Security-deposit type unknown — cash held vs. replacement policy.",
    );
  }
  if (input.securityDepositType === "replacement_policy") {
    // The whole point of this check is to never claim cash held under a replacement policy. If we
    // don't yet know whether the form claims cash held, that is a missing fact — never a false ok.
    if (isUnknown(input.claimsCashHeld)) {
      return needsInput(
        id,
        label,
        "Replacement policy — confirm the form does NOT state we hold cash.",
      );
    }
    if (input.claimsCashHeld === true) {
      return flag(
        id,
        label,
        "High",
        "A replacement/insurance policy is in place — do NOT state we hold cash.",
      );
    }
    return ok(
      id,
      label,
      "Replacement policy recorded; the form does not claim cash held.",
    );
  }
  return ok(id, label, `Security-deposit type recorded (${input.securityDepositType}).`);
}

function checkPetDeposit(input: RenewalReadinessInput): ReadinessCheck {
  const id = "pet_deposit";
  const label = "Pet deposit + registration";
  if (isUnknown(input.hasPet)) {
    return needsInput(
      id,
      label,
      "Pet status unknown — needed to decide the pet deposit / registration.",
    );
  }
  if (input.hasPet === false) return ok(id, label, "No pet — no pet deposit required.");
  if (input.petDepositSet !== true) {
    return flag(
      id,
      label,
      "High",
      "Pet present — pet deposit + pet-registration addendum required.",
    );
  }
  return ok(id, label, "Pet present and pet deposit recorded.");
}

function checkLlcSuffix(input: RenewalReadinessInput): ReadinessCheck {
  const id = "llc_suffix";
  const label = "LLC landlord name suffix";
  if (isUnknown(input.landlordIsLlc)) {
    return needsInput(id, label, "Confirm whether the landlord is an LLC.");
  }
  if (input.landlordIsLlc === false) return ok(id, label, "Landlord is not an LLC.");
  if (isUnknown(input.landlordName) || String(input.landlordName).trim() === "") {
    return needsInput(
      id,
      label,
      "Landlord is an LLC — landlord name is needed to verify the suffix.",
    );
  }
  if (!/\bllc\b/i.test(String(input.landlordName))) {
    return flag(
      id,
      label,
      "High",
      "Landlord is an LLC — the name must carry the 'LLC' suffix.",
    );
  }
  return ok(id, label, "LLC landlord name carries the suffix.");
}

function checkProratedRent(input: RenewalReadinessInput): ReadinessCheck {
  const id = "prorated_rent";
  const label = "Prorated rent on mid-month start";
  if (isUnknown(input.leaseStartIso) || String(input.leaseStartIso).trim() === "") {
    return needsInput(
      id,
      label,
      "Lease start date unknown — needed to decide proration.",
    );
  }
  const match = String(input.leaseStartIso).match(/^\d{4}-\d{2}-(\d{2})$/);
  if (!match) {
    return needsInput(
      id,
      label,
      "Lease start date unparseable — needed to decide proration.",
    );
  }
  if (Number(match[1]) !== 1) {
    return flag(id, label, "High", "Mid-month start — prorated rent must be computed.");
  }
  return ok(id, label, "First-of-month start — no proration needed.");
}

/**
 * Evaluate the renewal package against the must-never-miss rules. Unknown inputs become `needs_input`
 * (a Blocked flag naming the missing fact), never a false all-clear. Pure and deterministic.
 */
export function evaluateRenewalReadiness(
  input: RenewalReadinessInput,
): RenewalReadinessResult {
  const checks: ReadinessCheck[] = [
    checkInheritedFullSet(input),
    checkLeadPaint(input),
    checkCityAddendum(input),
    checkSecurityDeposit(input),
    checkPetDeposit(input),
    checkLlcSuffix(input),
    checkProratedRent(input),
  ];

  const flags = checks.filter((c) => c.status === "flag");
  const needsInputList = checks.filter((c) => c.status === "needs_input");

  return {
    checks,
    flags,
    needsInput: needsInputList,
    allClear: flags.length === 0 && needsInputList.length === 0,
    production_allowed: false,
  };
}
