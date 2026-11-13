// S280 R-S280-2: the server read behind the team line on the Dashboard and in My Work's empty state.
//
// Reuse the desk's working-batch projection through its read-only counts mode.

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
  const { loadRenewalAssistantSource } =
    await import("@/lib/lease-renewal/assistant-source");
  const { outcome } = await loadRenewalAssistantSource(user, now, null, {
    countsOnly: true,
  });
  return outcome.status === "ok" &&
    outcome.view.readComplete &&
    outcome.view.dataCurrency.state === "fresh"
    ? outcome.view.items
    : null;
}

/**
 * R-S280-2: the team line for this user, or null when the user has no Renewals Space.
 * A failed or stale source read gives the link without a count.
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
      30_000,
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
