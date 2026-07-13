import { gatherNeedsDecisionInbox } from "@/lib/approval/needs-decision-gather";
import type { NeedsDecisionInbox } from "@/lib/approval/needs-decision-inbox";
import {
  attentionSeverityFromRenewal,
  toAttentionSignal,
  type AttentionSignal,
} from "@/lib/attention/lanes";
import type { AuthenticatedUser } from "@/lib/auth/session";

export interface DecisionAttentionBacklog {
  count: number;
  signals: AttentionSignal[];
}

export interface GatheredDecisionAttention {
  /** Retained for the Console's already-authorized app-plane inline queue action. */
  inbox: NeedsDecisionInbox;
  /** Strict six-key projection shared with the read-only Notifications hub. */
  attention: DecisionAttentionBacklog;
}

export const EMPTY_DECISION_ATTENTION: DecisionAttentionBacklog = {
  count: 0,
  signals: [],
};

export function buildDecisionAttentionBacklog(
  inbox: NeedsDecisionInbox,
): DecisionAttentionBacklog {
  return {
    count: inbox.counts.total,
    signals: inbox.rows.map((row) =>
      toAttentionSignal({
        lane: "decision",
        severity: attentionSeverityFromRenewal(row.severity),
        label: row.label,
        detail: row.detail,
        href: row.href,
        signalKey: `decision:${row.key}`,
      }),
    ),
  };
}

/** The one canonical decision gather/projection used by Console and full Notifications requests. */
export async function gatherDecisionAttention(
  user: AuthenticatedUser,
): Promise<GatheredDecisionAttention> {
  const inbox = await gatherNeedsDecisionInbox(user);
  return { inbox, attention: buildDecisionAttentionBacklog(inbox) };
}
