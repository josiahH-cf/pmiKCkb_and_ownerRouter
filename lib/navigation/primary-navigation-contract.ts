export type PrimaryNavigationGroupId = "my-work" | "operations" | "admin";
export type PrimaryNavigationTone = "work" | "operations" | "admin";
export type PrimaryNavigationIconKey =
  | "clipboard-checklist"
  | "assistant-spark"
  | "approval-tray"
  | "calendar-renew"
  | "wrench"
  | "workflow-nodes"
  | "shield-user"
  | "plug-connected"
  | "message-envelope";

export interface PrimaryNavigationBadge {
  readonly value: number;
  readonly label: string;
}

export interface ResolvedPrimaryNavigationItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly href: string;
  /** Exact route roots that mark this destination current; queries and hashes never participate. */
  readonly activePaths: readonly string[];
  readonly icon: PrimaryNavigationIconKey;
  readonly badge?: PrimaryNavigationBadge;
}

export interface ResolvedPrimaryNavigationGroup {
  readonly id: PrimaryNavigationGroupId;
  readonly label: string;
  readonly tone: PrimaryNavigationTone;
  readonly items: readonly ResolvedPrimaryNavigationItem[];
}

export function isPrimaryNavigationItemActive(
  pathname: string | null,
  item: Readonly<Pick<ResolvedPrimaryNavigationItem, "activePaths">>,
): boolean {
  if (!pathname) return false;
  const pathOnly = pathname.split(/[?#]/, 1)[0] || "/";
  return item.activePaths.some(
    (activePath) =>
      pathOnly === activePath ||
      (activePath !== "/" && pathOnly.startsWith(`${activePath}/`)),
  );
}
