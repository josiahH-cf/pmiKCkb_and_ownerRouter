// S110 `runAssistantQuery`: the one boundary between a typed question and a bounded read.
//
// The caller supplies only the question text. The actor, their role, their Space access, the intent,
// and every filter are derived here, so no client can widen the query. The boundary reads through
// injected loaders that call the owning services, so this module itself performs no I/O, no write,
// no run start, no draft, and no provider call.

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { AssistantEnvelope, AssistantItem } from "@/lib/assistant/envelope";
import {
  ASSISTANT_QUERY_VERSION,
  matchAssistantIntent,
  unsupportedAssistantResponse,
  type AssistantIntentFilters,
} from "@/lib/assistant/intent-registry";
import {
  projectRenewalItems,
  selectBlockedRenewalRows,
  selectRenewalRowsInMonth,
} from "@/lib/assistant/renewal-adapter";
import { projectWorkItems, selectAssignedTodayTasks } from "@/lib/assistant/work-adapter";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import type { WorkTaskRecord } from "@/lib/work-accountability/types";

export interface AssistantQueryRequest {
  readonly question: string;
}

export interface AssistantRenewalRead {
  readonly status: "ok" | "read_error" | "not_configured" | "account_mismatch";
  readonly rows: readonly DeskLeaseRow[];
  /** Supporting reads that did not answer. Present rows are still exact; the answer is partial. */
  readonly degraded?: readonly string[];
  /** Inclusive bounds of the owning loader, not bounds inferred from returned rows. */
  readonly coverage?: { readonly startIso: string; readonly endIso: string };
}

export interface AssistantQueryDependencies {
  readonly nowIso: string;
  readonly hasRenewalsAccess: boolean;
  readonly loadWorkSnapshot: (
    actor: AuthenticatedUser,
  ) => Promise<{ tasks: readonly WorkTaskRecord[]; server_now: string }>;
  readonly loadRenewalRows: (actor: AuthenticatedUser) => Promise<AssistantRenewalRead>;
}

const WORK_LINK = { label: "Open My Work", href: "/work" } as const;
const DESK_LINK = {
  label: "Open the Renewals desk",
  href: "/lease-renewal/live/desk?v=2",
} as const;

function envelope(
  overrides: Partial<AssistantEnvelope> & Pick<AssistantEnvelope, "sourceState">,
): AssistantEnvelope {
  return {
    version: ASSISTANT_QUERY_VERSION,
    intent: null,
    items: [],
    appliedFilters: {},
    completeness: "unavailable",
    links: [],
    ...overrides,
  };
}

export async function runAssistantQuery(
  request: AssistantQueryRequest,
  actor: AuthenticatedUser,
  dependencies: AssistantQueryDependencies,
): Promise<AssistantEnvelope> {
  const match = matchAssistantIntent(request.question, dependencies.nowIso);

  if (match.kind === "clarify") {
    return envelope({
      completeness: "complete",
      sourceState: "One detail is missing before this can be answered.",
      clarification: match.question,
    });
  }
  if (match.kind === "unsupported") {
    return envelope({
      completeness: "complete",
      sourceState: "This question is outside what the assistant answers today.",
      unsupported: unsupportedAssistantResponse(),
    });
  }

  if (match.intent === "work.assigned_today") {
    let snapshot: Awaited<ReturnType<typeof dependencies.loadWorkSnapshot>>;
    try {
      snapshot = await dependencies.loadWorkSnapshot(actor);
    } catch (error) {
      // A source that throws is reported as unavailable, never as an empty list and never as a
      // failed request the form would silently fall through. Only the error class is logged.
      console.error(
        `Assistant work snapshot read failed (${error instanceof Error ? error.name : "unknown"}).`,
      );
      return envelope({
        intent: match.intent,
        completeness: "unavailable",
        sourceState:
          "Your work list could not be read just now, so this answer is incomplete. Open My Work to see the current state.",
        links: [WORK_LINK],
      });
    }
    const items = projectWorkItems(
      selectAssignedTodayTasks(snapshot.tasks, actor.uid, dependencies.nowIso),
    );
    return envelope({
      intent: match.intent,
      items,
      completeness: "complete",
      sourceState: describeCount(items, "task assigned to you", "tasks assigned to you"),
      links: [WORK_LINK],
    });
  }

  // Renewals intents require Renewals Space access. Without it the answer names the access it needs
  // and carries no lease id, address, count, or label, so it cannot enumerate what it refuses.
  if (!dependencies.hasRenewalsAccess) {
    return envelope({
      intent: match.intent,
      appliedFilters: match.filters,
      completeness: "unavailable",
      sourceState:
        "Answering renewal questions needs access to the Renewals Space. Ask an Admin to review your access.",
      links: [],
    });
  }

  let read: Awaited<ReturnType<typeof dependencies.loadRenewalRows>>;
  try {
    read = await dependencies.loadRenewalRows(actor);
  } catch (error) {
    console.error(
      `Assistant renewal read failed (${error instanceof Error ? error.name : "unknown"}).`,
    );
    read = { status: "read_error", rows: [] };
  }
  if (read.status !== "ok") {
    return envelope({
      intent: match.intent,
      appliedFilters: match.filters,
      completeness: "unavailable",
      sourceState:
        "The renewal source could not be read just now, so this answer is incomplete. Open the Renewals desk to see the current state.",
      links: [DESK_LINK],
    });
  }

  if (match.intent === "renewal.window") {
    const month = match.filters.month ?? "";
    const monthStart = `${month}-01`;
    const [year, monthNumber] = month.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    if (
      !read.coverage ||
      read.coverage.startIso > monthStart ||
      read.coverage.endIso < monthEnd
    ) {
      return envelope({
        intent: match.intent,
        appliedFilters: match.filters,
        completeness: "partial",
        sourceState: read.coverage
          ? `This read covers ${read.coverage.startIso} through ${read.coverage.endIso}, so it cannot answer the whole requested month.`
          : "The renewal read did not report its coverage bounds, so it cannot answer a whole month.",
        clarification: "Which fully covered month would you like to review?",
        links: [DESK_LINK],
      });
    }
  }

  const rows =
    match.intent === "renewal.blocked"
      ? selectBlockedRenewalRows(read.rows)
      : selectRenewalRowsInMonth(read.rows, match.filters.month ?? "");
  const items = projectRenewalItems(rows);
  const degraded = read.degraded ?? [];
  return envelope({
    intent: match.intent,
    items,
    appliedFilters: match.filters as AssistantIntentFilters,
    completeness: degraded.length > 0 ? "partial" : "complete",
    sourceState:
      degraded.length > 0
        ? `${describeCount(items, "lease", "leases")} Some supporting records did not answer, so treat this as incomplete.`
        : describeCount(items, "lease", "leases"),
    links: [DESK_LINK],
  });
}

function describeCount(
  items: readonly AssistantItem[],
  singular: string,
  plural: string,
): string {
  if (items.length === 0) return `No ${plural} match this question right now.`;
  return items.length === 1 ? `1 ${singular}.` : `${items.length} ${plural}.`;
}
