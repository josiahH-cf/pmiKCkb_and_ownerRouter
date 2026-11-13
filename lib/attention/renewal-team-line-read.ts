// S280 R-S280-2: the server read behind the team line on the Dashboard and in My Work's empty state.
//
// The count is the Renewals desk's own working-batch membership (S246 R-S246-10), from the one desk
// orchestration the desk page and the assistant already call. It is a read: it sends, saves and
// looks up nothing, and it is bounded. The Dashboard starts it beside the attention gather and
// streams it into its own line, so the question box and the rest of "Waiting on you" never wait for
// it; a failed or late read shows the line without a count.

import {
  RENEWAL_TEAM_LINE_HREF,
  renewalTeamNextActionCount,
  type RenewalTeamLine,
} from "@/lib/attention/renewal-team-line";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import {
  defaultRenewalBatchMonth,
  type RenewalBatchSourceRow,
} from "@/lib/lease-renewal/renewal-batch";
import { withReadDeadline } from "@/lib/observability/read-lifetime";

/** The team line's bound; past it the line shows without a count. */
export const RENEWAL_TEAM_LINE_WAIT_MS = 30_000;

export interface RenewalTeamLineDependencies {
  /** The desk's rows for this user, or null when the desk could not be read. */
  readonly loadDeskRows?: (
    user: AuthenticatedUser,
    now: Date,
  ) => Promise<readonly RenewalBatchSourceRow[] | null>;
}

async function defaultLoadDeskRows(
  user: AuthenticatedUser,
  now: Date,
): Promise<readonly RenewalBatchSourceRow[] | null> {
  // Loaded on use, so a page that never shows the line never loads the desk orchestration.
  const { loadRenewalAssistantSource } =
    await import("@/lib/lease-renewal/assistant-source");
  const source = await loadRenewalAssistantSource(user, now);
  return source.outcome.status === "ok" ? source.outcome.view.items : null;
}

/**
 * R-S280-2: the team line for this user, or null when the user has no Renewals Space. Never
 * throws: an unreadable desk gives the line without a count.
 */
export async function loadRenewalTeamLine(
  user: AuthenticatedUser,
  now: Date = new Date(),
  dependencies: RenewalTeamLineDependencies = {},
): Promise<RenewalTeamLine | null> {
  if (!hasSpaceAccess(user, "renewals")) return null;
  const month = defaultRenewalBatchMonth(businessDateIso(now));
  try {
    const rows = await withReadDeadline(
      () => (dependencies.loadDeskRows ?? defaultLoadDeskRows)(user, now),
      RENEWAL_TEAM_LINE_WAIT_MS,
    );
    return {
      count: rows ? renewalTeamNextActionCount(rows, month) : null,
      month,
      href: RENEWAL_TEAM_LINE_HREF,
    };
  } catch {
    return { count: null, month, href: RENEWAL_TEAM_LINE_HREF };
  }
}
