// NoticeRuleCard — renders the effective renewal-notice RULE read-only on a Space desk (S13 F2).
// Reads the seeded config record (or the built-in DEFAULT set when none is seeded), resolves the
// effective rule at the global scope, and shows each timing field with its provenance ("default" /
// "property rule" / ...) and a Needs-Verification badge for any value not yet confirmed.
//
// Async server component; read-only; no send, no write. A missing/invalid config safely falls back to
// the UNVERIFIED defaults via readNoticeRuleSet.

import { Card, StatusPill } from "@/components/ui";
import { readNoticeRuleSet } from "@/lib/firestore/lease-renewal-notice-rules";
import {
  buildNoticeRuleSummary,
  resolveNoticeRule,
} from "@/lib/lease-renewal/notice-rules";

export async function NoticeRuleCard() {
  const ruleSet = await readNoticeRuleSet();
  const summary = buildNoticeRuleSummary(resolveNoticeRule(ruleSet, {}));

  return (
    <Card title="Notice timing rules">
      <p className="muted">{summary.statusLabel}</p>
      <ul className="ui-rows">
        {summary.lines.map((line) => (
          <li className="ui-spread" key={line.label}>
            <span>
              {line.label}: <strong>{line.value}</strong>{" "}
              <span className="muted">({line.provenance})</span>
            </span>
            {line.needsVerification ? (
              <StatusPill value="Needs Verification">Needs Verification</StatusPill>
            ) : null}
          </li>
        ))}
      </ul>
      {summary.hasUnverified ? (
        <p className="muted">
          These are starting defaults. They stay Needs Verification until they are
          confirmed for the property or lease.
        </p>
      ) : null}
    </Card>
  );
}
