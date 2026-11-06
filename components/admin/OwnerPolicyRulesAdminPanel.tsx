"use client";
import { RenewalPricingPolicyAdmin } from "./RenewalPricingPolicyAdmin";
import type { OwnerPolicyRule } from "@/lib/firestore/owner-policy-rules";
/**
 * Current reusable management plus unchanged read-only legacy rules; no historical approval is
 * migrated. S250 R-S250-9: the legacy rules are listed beside the standing agreements.
 */
export function OwnerPolicyRulesAdminPanel({
  initialRules,
}: Readonly<{ initialRules: OwnerPolicyRule[] }>) {
  return (
    <div className="ui-stack">
      <RenewalPricingPolicyAdmin olderRules={initialRules} />
    </div>
  );
}
