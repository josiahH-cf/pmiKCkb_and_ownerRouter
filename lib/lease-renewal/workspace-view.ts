// S247 R-S247-7 / R-S247-9 (D-OP-6): the lease page's three views and the address key a view chosen
// by hand is kept in for that visit. Presentation state only: reading or writing it saves nothing.
// Server-safe, so the page and the workspace read the key the same way the browser writes it.

export const RENEWAL_WORKSPACE_VIEWS = ["guided", "focus", "full"] as const;
export type RenewalWorkspaceView = (typeof RENEWAL_WORKSPACE_VIEWS)[number];

export const LIVE_RENEWAL_WORKSPACE_VIEWS = ["guided", "full"] as const;

export const RENEWAL_VIEW_PARAM = "view";

export const RENEWAL_VIEW_LABELS: Record<RenewalWorkspaceView, string> = {
  guided: "Guided view",
  focus: "Focus view",
  full: "Full view",
};

export function isRenewalWorkspaceView(value: unknown): value is RenewalWorkspaceView {
  return value === "guided" || value === "focus" || value === "full";
}

/** The view the page opens in: the one the address names, otherwise Guided view. */
export function initialRenewalWorkspaceView(
  raw: string | undefined,
  available: boolean,
  allowLegacyFocus = true,
): { readonly view: RenewalWorkspaceView; readonly explicit: boolean } {
  if (!available) return { view: "full", explicit: false };
  if (raw === "focus" && !allowLegacyFocus) return { view: "guided", explicit: false };
  return isRenewalWorkspaceView(raw)
    ? { view: raw, explicit: true }
    : { view: "guided", explicit: false };
}

/** Resolve only internal workspace anchors, including the retired Focus heading. */
export function renewalWorkspaceHashTarget(hash: string): string | null {
  try {
    const id = decodeURIComponent(hash.slice(1));
    if (id === "renewal-focus-task-heading") return "renewal-current-stage";
    return /^renewal-[A-Za-z0-9_-]{1,118}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
