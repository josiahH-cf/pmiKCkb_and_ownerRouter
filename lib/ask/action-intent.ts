// S33 Ask -> live-action intent resolver. PURE and deterministic: no wall-clock, no I/O, no network. It
// maps a detected process plus an authoritatively resolved target to a VALUE-FREE route into the desk's
// ALREADY-GATED action surface, or null. It never defines an executor and never opens a gate: it returns a
// route ONLY when the mapped Action-Registry key is already executable (`isExecutable(key) === true`), so a
// closed key (e.g. gmail.renewal_notice.send) never surfaces a live affordance. Ask becomes a faster front
// door into the existing preview/confirm/receipt gate, never a way around it.

export const RENEWAL_DRAFT_ACTION_KEY = "gmail.renewal_notice.draft_create";
export const MAINTENANCE_OWNER_DRAFT_ACTION_KEY =
  "gmail.maintenance_owner_notice.draft_create";

export type AskActionSurface =
  | "renewal-notice-draft"
  | "maintenance-owner-notice"
  | "process-test-run";

/** A value-free route into an already-gated desk surface. Carries no recipient, rent, or tenant name. */
export interface AskActionRoute {
  actionKey: string;
  surface: AskActionSurface;
  /** Deep link to the full gated surface (the desk lease workspace / maintenance queue). */
  href: string;
  label: string;
}

interface ProcessActionMapping {
  key: string;
  surface: Exclude<AskActionSurface, "process-test-run">;
  label: string;
}

const PROCESS_ACTION_MAP: Record<string, ProcessActionMapping> = {
  "lease-renewal": {
    key: RENEWAL_DRAFT_ACTION_KEY,
    surface: "renewal-notice-draft",
    label: "Start the renewal on the live desk",
  },
  "maintenance-work-order-intake": {
    key: MAINTENANCE_OWNER_DRAFT_ACTION_KEY,
    surface: "maintenance-owner-notice",
    label: "Start the maintenance owner notice",
  },
};

export interface ResolveAskActionInput {
  /** The detected process (from `detectProcess` or the model fallback), or null. */
  detected: { processId: string } | null;
  /** The authoritatively resolved renewal target lease, or null (no live route without one). */
  target: { leaseId: string; addressLabel: string } | null;
  /** Reads the committed seed gate; a closed key must yield no live route. */
  isExecutable: (key: string) => boolean;
  /**
   * Whether S38a's maintenance owner-notice draft surface (route + button) is reachable. Default false:
   * until S38a lands, a maintenance intent falls back to the existing process Test run, never a hollow
   * affordance. When S38a is present the caller passes true and the maintenance draft route lights up.
   */
  maintenanceDraftAvailable?: boolean;
}

/**
 * Resolve the single live-action route Ask may offer, or null. Renewal needs an authoritative target lease
 * AND an open draft gate; maintenance needs an open draft gate AND its S38a surface present. Any closed key,
 * absent target, or unmapped process yields null so Ask surfaces no live affordance.
 */
export function resolveAskAction(input: ResolveAskActionInput): AskActionRoute | null {
  const { detected, target, isExecutable } = input;
  if (!detected) return null;
  const mapping = PROCESS_ACTION_MAP[detected.processId];
  if (!mapping) return null;
  // Only ever route to an already-open gate.
  if (!isExecutable(mapping.key)) return null;

  if (mapping.surface === "renewal-notice-draft") {
    // A live renewal route requires an authoritative single-lease target (never a best-guess lease).
    if (!target) return null;
    return {
      actionKey: mapping.key,
      surface: mapping.surface,
      href: `/lease-renewal/live/desk/lease/${encodeURIComponent(target.leaseId)}`,
      label: mapping.label,
    };
  }

  // Maintenance: only when S38a's draft surface is actually reachable; otherwise Ask falls back to the
  // existing Test run (this returns null and the caller keeps its Test-run affordance).
  if (mapping.surface === "maintenance-owner-notice") {
    if (!input.maintenanceDraftAvailable) return null;
    return {
      actionKey: mapping.key,
      surface: mapping.surface,
      href: "/maintenance",
      label: mapping.label,
    };
  }

  return null;
}
