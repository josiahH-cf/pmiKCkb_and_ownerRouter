// S109 maintenance intake triage: the deterministic rules that own urgency, required evidence,
// expectation copy, and whether intake is complete.
//
// Pure. No model, no provider, no I/O. A model may suggest an issue type for free text elsewhere; it
// can never reach this module, downgrade a fire report, or mark intake complete. Nothing here
// promises a completion time, dispatches a vendor, or approves a cost.

import {
  MAINTENANCE_TRADE_KEYWORDS,
  type MaintenanceTrade,
} from "@/lib/maintenance/constants";

export const MAINTENANCE_INTAKE_URGENCIES = [
  "emergency_fire",
  "urgent_flooding",
  "normal",
] as const;

export type MaintenanceIntakeUrgency = (typeof MAINTENANCE_INTAKE_URGENCIES)[number];

export type MaintenanceIntakeEvidence = "photos";

/** Life-safety terms. Any hit routes the reporter to emergency services before anything else. */
const FIRE_TERMS = [
  "fire",
  "smoke",
  "smoking",
  "gas leak",
  "smell gas",
  "smells like gas",
  "gas",
  "carbon monoxide",
] as const;

/** Water that is moving now. A term hit alone is enough; a plain leak needs `happeningNow`. */
const ACTIVE_WATER_TERMS = [
  "flood",
  "flooding",
  "flooded",
  "burst",
  "overflow",
  "overflowing",
  "sewage",
  "water everywhere",
  "pouring water",
  "gushing",
] as const;

const LEAK_TERMS = ["leak", "leaking", "dripping", "running water"] as const;

const DAMAGE_TERMS = [
  "damage",
  "damaged",
  "stain",
  "stained",
  "sagging",
  "ceiling",
  "mold",
  "broken",
  "collapsed",
] as const;

/**
 * The owner-reviewed required-evidence table. Photos are the only evidence this app can ask a
 * reporter for, because S47 forbids a public upload: the request is explicit and the staff photo
 * action or the property team's own channel carries the file. Types not listed here need none until
 * the owner extends this table.
 */
export const MAINTENANCE_REQUIRED_EVIDENCE: Record<
  MaintenanceTrade,
  readonly MaintenanceIntakeEvidence[]
> = {
  Plumbing: ["photos"],
  Appliance: ["photos"],
  Electrical: [],
  HVAC: [],
  General: [],
};

const COPY: Record<MaintenanceIntakeUrgency, string> = {
  emergency_fire: "Call 911 now if anyone is in danger. We have recorded your report.",
  urgent_flooding:
    "We have your report and we are treating it as urgent. If you can do it safely, shut off the water at the fixture or at the main shutoff, and move what you can away from the water.",
  normal:
    "Thank you. We have your report and a member of the team will review it and follow up with you.",
};

/** The approved acknowledgement for one urgency. No template promises a completion time. */
export function intakeTriageCopy(urgency: MaintenanceIntakeUrgency): string {
  return COPY[urgency];
}

export interface IntakeTriageInput {
  readonly summary: string;
  readonly description?: string;
  /** A reporter-selected or model-suggested trade. Rules never depend on it for urgency. */
  readonly issueType?: MaintenanceTrade | null;
  readonly location?: string;
  readonly happeningNow?: boolean | null;
  readonly startedAt?: string;
  readonly damageOrAccess?: string;
  readonly attemptedSteps?: string;
  /** Whether the staff photo action already holds photos for this report. */
  readonly hasPhotos?: boolean;
}

export interface IntakeTriageProjection {
  readonly urgency: MaintenanceIntakeUrgency;
  readonly issueType: MaintenanceTrade | null;
  readonly requiredEvidence: readonly MaintenanceIntakeEvidence[];
  readonly photosNeeded: boolean;
  /** False while required evidence is missing. No path may report complete intake without it. */
  readonly intakeComplete: boolean;
  readonly evidenceRequest: string | null;
  readonly acknowledgement: string;
  /** The report is stored either way; an emergency is recorded and escalated, never dropped. */
  readonly recorded: true;
}

function haystack(input: IntakeTriageInput): string {
  return [input.summary, input.description, input.location, input.damageOrAccess]
    .filter((value): value is string => typeof value === "string" && value !== "")
    .join(" ")
    .toLowerCase();
}

function hits(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

/** Deterministic trade inference from the report text, reusing the committed keyword taxonomy. */
export function inferIntakeIssueType(text: string): MaintenanceTrade {
  const lowered = text.toLowerCase();
  let best: MaintenanceTrade = "General";
  let bestScore = 0;
  for (const [trade, keywords] of Object.entries(MAINTENANCE_TRADE_KEYWORDS)) {
    const score = keywords.filter((keyword) => lowered.includes(keyword)).length;
    if (score > bestScore) {
      bestScore = score;
      best = trade as MaintenanceTrade;
    }
  }
  return best;
}

export function projectIntakeTriage(input: IntakeTriageInput): IntakeTriageProjection {
  const text = haystack(input);
  const urgency: MaintenanceIntakeUrgency = hits(text, FIRE_TERMS)
    ? "emergency_fire"
    : hits(text, ACTIVE_WATER_TERMS) ||
        (input.happeningNow === true && hits(text, LEAK_TERMS))
      ? "urgent_flooding"
      : "normal";

  const issueType = input.issueType ?? null;
  const byType = issueType ? MAINTENANCE_REQUIRED_EVIDENCE[issueType] : [];
  const damageReported = hits(text, DAMAGE_TERMS);
  const requiredEvidence: readonly MaintenanceIntakeEvidence[] =
    byType.length > 0 || damageReported ? ["photos"] : [];
  const photosNeeded = requiredEvidence.includes("photos") && input.hasPhotos !== true;

  return {
    urgency,
    issueType,
    requiredEvidence,
    photosNeeded,
    intakeComplete: !photosNeeded,
    evidenceRequest: photosNeeded
      ? "Please send a photo of the problem and one of the area around it, so the team can size the work before anyone visits."
      : null,
    acknowledgement: intakeTriageCopy(urgency),
    recorded: true,
  };
}
