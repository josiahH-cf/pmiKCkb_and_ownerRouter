"use client";
import { RenewalPricingPolicyAdmin } from "./RenewalPricingPolicyAdmin";
import type { OwnerPolicyRule } from "@/lib/firestore/owner-policy-rules";
import { formatCalendarDate } from "@/lib/date-display";
/** Current reusable management plus unchanged read-only legacy rules; no historical approval is migrated. */
export function OwnerPolicyRulesAdminPanel({
  initialRules,
}: Readonly<{ initialRules: OwnerPolicyRule[] }>) {
  return (
    <div className="ui-stack">
      <RenewalPricingPolicyAdmin />
      {initialRules.length ? (
        <details>
          <summary>Legacy portfolio pricing rules</summary>
          <ul>
            {initialRules.map((rule) => (
              <li key={rule.portfolioId}>
                Portfolio {rule.portfolioId}: +{rule.percent}%, effective{" "}
                {formatCalendarDate(rule.effectiveFrom)}. {rule.note}
              </li>
            ))}
          </ul>
          <p>
            Legacy rules retain their original values and history. A reusable assignment
            replaces their future proposal basis; it does not rewrite an old approval.
          </p>
        </details>
      ) : null}
    </div>
  );
}
