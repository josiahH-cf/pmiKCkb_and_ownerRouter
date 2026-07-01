// Read-only app-state provider for the Console (S10). Surfaces the app's OWN operational state —
// the operator's approvals, connector setup gaps, and Space process/connection coverage — as a
// compact, deep-linked, ADVISORY result. It reports state + the next place to act; it NEVER executes
// approvals, sends, or writes (those stay in their own gated surfaces). Every resolver is non-fatal:
// a Firestore hiccup yields an empty result, never a thrown error.

import { canViewApprovalQueueItem } from "@/lib/approval/queue";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { buildConnectionView } from "@/lib/connections/connection-status";
import { readConnectorPresence } from "@/lib/connections/connector-presence";
import { listApprovalQueue } from "@/lib/firestore/approval-queue";
import { listProcessDefinitions } from "@/lib/firestore/workflows";
import { computeSpaceCardState } from "@/lib/space-card-state";
import { launchSpaces, spaceHref } from "@/lib/spaces";

export const APP_STATE_QUERIES = ["approvals", "connections", "coverage"] as const;
export type AppStateQuery = (typeof APP_STATE_QUERIES)[number];

export interface AppStateItem {
  label: string;
  detail?: string;
  href: string;
}

export interface AppStateResult {
  query: AppStateQuery;
  title: string;
  summary: string;
  items: AppStateItem[];
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "What are my approvals?" — queue items ready for approval that this user may see. */
export async function resolveApprovalsState(
  user: AuthenticatedUser,
): Promise<AppStateResult> {
  let items: AppStateItem[] = [];
  try {
    const queue = await listApprovalQueue(user, {
      filters: { status: "Ready for Approval" },
    });
    items = queue
      .filter((item) => canViewApprovalQueueItem(user, item))
      .map((item) => ({
        label: item.action_needed,
        detail: `Risk: ${item.risk}`,
        href: item.direct_link || "/approval-queue",
      }));
  } catch {
    items = [];
  }

  return {
    query: "approvals",
    title: "Your approvals",
    summary:
      items.length === 0
        ? "Nothing is waiting for your approval right now."
        : `${plural(items.length, "item")} ready for your approval.`,
    items,
  };
}

/** "What connections still need setup?" — connectors that are unconfigured or only partially
 *  configured. A fully-configured connector ("Ready to connect", awaiting a live verification PMI
 *  runs) is NOT an operator setup gap, so it is excluded to keep the list actionable. */
export function resolveConnectionsState(
  env: Record<string, string | undefined> = process.env,
): AppStateResult {
  const view = buildConnectionView(readConnectorPresence(env));
  const gaps = view.items.filter(
    (item) =>
      item.status.state === "none" ||
      item.status.configuredCount < item.status.requiredCount,
  );

  return {
    query: "connections",
    title: "Connections to set up",
    summary:
      gaps.length === 0
        ? "Every connector is configured."
        : `${plural(gaps.length, "connector")} still ${gaps.length === 1 ? "needs" : "need"} setup.`,
    items: gaps.map((item) => ({
      label: item.def.name,
      detail: item.status.detail,
      href: "/connections",
    })),
  };
}

/** "Which Spaces don't have a process (or connections) yet?" — reuses the S6 card-state logic. */
export async function resolveCoverageState(
  user: AuthenticatedUser,
): Promise<AppStateResult> {
  let definitionIds = new Set<string>();
  try {
    const definitions = await listProcessDefinitions(user);
    definitionIds = new Set(definitions.map((definition) => definition.id));
  } catch {
    definitionIds = new Set();
  }
  const presence = readConnectorPresence();

  const gaps = launchSpaces
    .filter((space) => !space.readOnly)
    .map((space) => ({
      space,
      state: computeSpaceCardState(space, definitionIds, presence),
    }))
    .filter(
      (entry) =>
        entry.state === "needs-a-process" || entry.state === "connections-needed",
    );

  return {
    query: "coverage",
    title: "Spaces that need setup",
    summary:
      gaps.length === 0
        ? "Every Space has its process and connections."
        : `${plural(gaps.length, "Space")} still ${gaps.length === 1 ? "needs" : "need"} a process or connections.`,
    items: gaps.map((entry) => ({
      label: entry.space.name,
      detail:
        entry.state === "connections-needed" ? "Connections needed" : "Needs a process",
      href: spaceHref(entry.space),
    })),
  };
}

export async function resolveAppState(
  user: AuthenticatedUser,
  query: AppStateQuery,
): Promise<AppStateResult> {
  switch (query) {
    case "approvals":
      return resolveApprovalsState(user);
    case "connections":
      return resolveConnectionsState();
    case "coverage":
      return resolveCoverageState(user);
  }
}
