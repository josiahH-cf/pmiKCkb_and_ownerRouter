// S109 reviewed troubleshooting catalog.
//
// Every entry is a link a person at the property company reviewed on an exact date. The catalog is
// empty until the owner supplies those links, and an empty catalog disables only the resource offer:
// triage, urgency, evidence, and the handoff are unaffected.
//
// Selection is deliberately conservative. A resource is offered only for a normal-urgency report
// whose issue type matches exactly one reviewed entry, so an ambiguous match offers nothing rather
// than guessing, and an urgent or emergency report is never handed a self-help link.

import type { MaintenanceTrade } from "@/lib/maintenance/constants";
import type { MaintenanceIntakeUrgency } from "@/lib/maintenance/intake-triage";

export interface TroubleshootingResource {
  readonly id: string;
  readonly issueType: MaintenanceTrade;
  readonly title: string;
  readonly url: string;
  readonly reviewedOnIso: string;
}

/**
 * Links the owner reviewed and approved on 2026-09-04. One entry per issue type, because two
 * matching entries make the offer ambiguous and none is shown. Appliance and General have no entry
 * on purpose: no authoritative vendor-neutral source was found worth standing behind, and no offer
 * is better than an unreviewed one.
 */
export const MAINTENANCE_TROUBLESHOOTING_CATALOG: readonly TroubleshootingResource[] = [
  {
    id: "electrical-gfci-reset",
    issueType: "Electrical",
    title: "Test and reset a GFCI outlet",
    url: "https://www.cpsc.gov/safety-education/safety-guides/electronics-and-electrical-home/gfci-fact-sheet",
    reviewedOnIso: "2026-09-04T00:00:00.000Z",
  },
  {
    id: "hvac-maintenance-checklist",
    issueType: "HVAC",
    title: "Check your filter and thermostat",
    url: "https://www.energystar.gov/saveathome/heating-cooling/maintenance-checklist",
    reviewedOnIso: "2026-09-04T00:00:00.000Z",
  },
  {
    id: "plumbing-find-a-leak",
    issueType: "Plumbing",
    title: "Find a running toilet or a dripping fixture",
    url: "https://www.epa.gov/watersense/fix-leak-week",
    reviewedOnIso: "2026-09-04T00:00:00.000Z",
  },
];

function isReviewedEntry(entry: TroubleshootingResource): boolean {
  if (!entry.id.trim() || !entry.title.trim()) return false;
  if (!Number.isFinite(Date.parse(entry.reviewedOnIso))) return false;
  let url: URL;
  try {
    url = new URL(entry.url);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.username === "" && url.password === "";
}

export function selectTroubleshootingResource(
  issueType: MaintenanceTrade | null,
  urgency: MaintenanceIntakeUrgency,
  catalog: readonly TroubleshootingResource[] = MAINTENANCE_TROUBLESHOOTING_CATALOG,
): TroubleshootingResource | null {
  if (!issueType || urgency !== "normal") return null;
  const matches = catalog.filter(
    (entry) => entry.issueType === issueType && isReviewedEntry(entry),
  );
  return matches.length === 1 ? matches[0] : null;
}
