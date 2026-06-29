// Maintenance work-order intake — the pure domain core (S4). Turns a field capture (reporter, unit,
// typed note and/or voice transcript, photos, priority) into a structured, source-backed work-order
// DRAFT for human review. NO external write: the RentVine work-order create stays gated
// (production_allowed:false). No I/O — speech-to-text, photo storage (Drive), and location→unit matching
// are resolved by the surrounding seams and passed IN; this module assembles + validates the draft and
// flags the gaps a human must close first. Deterministic: takes capturedAt as input, never Date.now().

import {
  MAINTENANCE_EMERGENCY_KEYWORDS,
  type MAINTENANCE_PRIORITIES,
} from "@/lib/maintenance/constants";

export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];
export type UnitMatchConfidence = "Verified" | "Likely" | "Needs Review";

export interface MaintenanceUnitMatch {
  unitId: string;
  label: string;
  confidence: UnitMatchConfidence;
}

export interface MaintenanceCapture {
  reporterUid: string;
  reporterName?: string;
  /** Typed issue description and/or a voice transcript already produced by the STT seam. */
  typedNote?: string;
  voiceTranscript?: string;
  /** Resolved unit match from the location→unit matcher, or null when unmatched. */
  unit?: MaintenanceUnitMatch | null;
  /** In-boundary references to stored photos (Drive file ids/links) — never the binaries. */
  photoRefs?: string[];
  /** Explicit priority; when omitted, inferred from the description (emergency keywords). */
  priority?: MaintenancePriority;
  /** ISO timestamp captured at read time (injected; never Date.now()). */
  capturedAt: string;
}

export interface WorkOrderDraft {
  summary: string;
  description: string;
  priority: MaintenancePriority;
  unit: { unitId: string; label: string } | null;
  photoRefs: string[];
  reporter: { uid: string; name?: string };
  capturedAt: string;
  /** Gaps a human must resolve before the (gated) RentVine work-order create. */
  blockers: string[];
  /** Always false — the RentVine work-order create is gated (production_allowed:false). */
  readyForExecution: false;
}

function combineDescription(capture: MaintenanceCapture): string {
  return [capture.typedNote, capture.voiceTranscript]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}

/** Emergency when the text hits a health/safety/damage keyword, else Normal. Pure + case-insensitive. */
export function inferPriority(description: string): MaintenancePriority {
  const text = description.toLowerCase();
  return MAINTENANCE_EMERGENCY_KEYWORDS.some((keyword) => text.includes(keyword))
    ? "Emergency"
    : "Normal";
}

function summarize(description: string): string {
  const firstLine = description.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  if (!firstLine) {
    return "Maintenance request";
  }
  return firstLine.length <= 80 ? firstLine : `${firstLine.slice(0, 77).trimEnd()}…`;
}

/**
 * Assemble a work-order draft from a capture. Never executes a write; `readyForExecution` is always
 * false and `blockers` lists what a human must resolve (missing description, unmatched/low-confidence
 * unit) before the gated RentVine create.
 */
export function buildWorkOrderDraft(capture: MaintenanceCapture): WorkOrderDraft {
  const description = combineDescription(capture);
  const priority = capture.priority ?? (description ? inferPriority(description) : "Normal");
  const photoRefs = capture.photoRefs ?? [];

  const blockers: string[] = [];
  if (!description) {
    blockers.push("Add an issue description or voice note.");
  }
  if (!capture.unit) {
    blockers.push("Match the location to a unit.");
  } else if (capture.unit.confidence === "Needs Review") {
    blockers.push("Confirm the matched unit (low-confidence match).");
  }

  return {
    summary: summarize(description),
    description,
    priority,
    unit: capture.unit ? { unitId: capture.unit.unitId, label: capture.unit.label } : null,
    photoRefs,
    reporter: {
      uid: capture.reporterUid,
      ...(capture.reporterName ? { name: capture.reporterName } : {}),
    },
    capturedAt: capture.capturedAt,
    blockers,
    readyForExecution: false,
  };
}
