"use client";

import { useRenewalManualWorkspace } from "@/components/lease-renewal/RenewalManualWorkspace";
import { useRenewalPolicy } from "@/components/lease-renewal/RenewalPolicyContext";
import { formatBusinessTimestamp } from "@/lib/date-display";
import {
  POLICY_OUTPUT_CHANNEL_LABELS,
  POLICY_OUTPUT_CHANNELS,
  POLICY_PRODUCT_ACTIVITY,
  preparePolicyOutput,
  projectPolicyApplicability,
  type PolicyMissingItem,
  type PolicyOutput,
} from "@/lib/lease-renewal/policy-content";

const PRODUCT = "rhino" as const;
export const POLICY_CONTENT_CONTROL_ID = `renewal-policy-content-${PRODUCT}`;
export const POLICY_MATERIAL_ADMIN_HREF = "/admin#admin-policy-material";

const FOLLOW_UP_TEXT: Record<string, string> = {
  not_recorded: "Not recorded",
  not_started: "Not started",
  waiting: "Waiting",
  done: "Done (recorded task, not coverage)",
  not_applicable: "Not applicable (staff review)",
};

function missingItemView(item: PolicyMissingItem) {
  if (item.destination === "admin_intake")
    return (
      <li key={item.id} data-renewal-policy-missing={item.destination}>
        {item.label}.{" "}
        <a className="text-link renewal-workspace-link" href={POLICY_MATERIAL_ADMIN_HREF}>
          Submit or approve material (Admin)
        </a>
      </li>
    );
  if (item.destination === "follow_up")
    return (
      <li key={item.id} data-renewal-policy-missing={item.destination}>
        {item.label}.{" "}
        <a
          className="text-link renewal-workspace-link"
          href={`#renewal-manual-${POLICY_PRODUCT_ACTIVITY[PRODUCT]}`}
        >
          Open the follow-up record
        </a>
      </li>
    );
  return (
    <li key={item.id} data-renewal-policy-missing={item.destination}>
      {item.label}. No verified source for this fact is read yet.
    </li>
  );
}

function outputText(output: PolicyOutput) {
  if (output.state === "ready")
    return `ready from version ${output.evidence.version} (slot ${output.slotId})`;
  if (output.state === "omitted")
    return output.reason === "not_applicable"
      ? "omitted: not applicable, nothing is inserted"
      : "omitted: the approved version has no slot for this output";
  return `blocked: ${output.explanation}`;
}

/**
 * S131 (F11): the one place a staff member sees whether the Rhino policy applies to this lease,
 * on what basis, exactly which approved materials or verified facts are still needed, and what
 * each dependent output would do. It reads the same projection the message readiness uses. It
 * never displays coverage as verified: the follow-up is a recorded task, the Sheet column is
 * evidence, and only an approved version with verified facts produces any wording.
 */
export function RenewalPolicyContentPanel() {
  const policy = useRenewalPolicy();
  const manual = useRenewalManualWorkspace();
  if (!policy) return null;
  const applicability = projectPolicyApplicability({
    productKey: PRODUCT,
    leaseId: manual?.leaseId ?? policy.leaseId,
    manualState: manual?.state,
    material: policy.material,
    facts: policy.facts,
    sheetLegacyValue: policy.sheetLegacyValue,
    todayIso: policy.todayIso,
  });
  const active = policy.material.state === "approved" ? policy.material.active : null;
  const outputs = POLICY_OUTPUT_CHANNELS.map(
    (channel) =>
      [
        channel,
        preparePolicyOutput({
          material: active,
          applicability,
          facts: policy.facts,
          channel,
        }),
      ] as const,
  );
  const attention =
    applicability.state === "needs_review" ||
    (applicability.state === "unknown" && applicability.identified) ||
    (applicability.state === "applicable" && applicability.missingItems.length > 0);
  return (
    <section
      aria-label={`${applicability.productLabel} content`}
      className="renewal-policy-content"
      data-renewal-policy-applicability={applicability.state}
      data-renewal-policy-reason={applicability.reason}
      data-renewal-policy-identified={applicability.identified ? "true" : "false"}
      id={POLICY_CONTENT_CONTROL_ID}
      tabIndex={-1}
    >
      <h4 className="section-subtitle">{applicability.productLabel} content</h4>
      <p className={attention ? "renewal-notice" : "muted"} role="status">
        <strong>{applicability.label}.</strong> {applicability.explanation}
      </p>
      <dl className="renewal-policy-content-facts">
        <div>
          <dt>Applicability</dt>
          <dd>{applicability.stateLabel}</dd>
        </div>
        <div>
          <dt>Basis</dt>
          <dd>
            {applicability.source.origin === "approved_rule"
              ? `Approved material ${applicability.materialVersion} (${applicability.source.reference}), rule ${applicability.ruleVersion}`
              : applicability.source.origin === "staff_review"
                ? `Staff review: ${applicability.source.reference}`
                : "No approved material or staff review"}
          </dd>
        </div>
        <div>
          <dt>Follow-up recorded by staff</dt>
          <dd>
            {FOLLOW_UP_TEXT[applicability.followUp.outcome] ??
              applicability.followUp.outcome}
            {applicability.followUp.recordedAt
              ? ` on ${formatBusinessTimestamp(applicability.followUp.recordedAt)}`
              : ""}
          </dd>
        </div>
        <div>
          <dt>Reviewer</dt>
          <dd>{applicability.reviewer ?? "None recorded"}</dd>
        </div>
      </dl>
      {applicability.missingItems.length > 0 ? (
        <>
          <p>Needed before any {applicability.productLabel} wording can be used:</p>
          <ul data-renewal-policy-missing-list>
            {applicability.missingItems.map(missingItemView)}
          </ul>
        </>
      ) : null}
      {applicability.evidenceNotes.length > 0 ? (
        <ul className="muted" data-renewal-policy-evidence>
          {applicability.evidenceNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <ul data-renewal-policy-outputs>
        {outputs.map(([channel, output]) => (
          <li key={channel} data-renewal-policy-output={output.state}>
            {POLICY_OUTPUT_CHANNEL_LABELS[channel]}: {outputText(output)}
          </li>
        ))}
      </ul>
      <p>
        <a
          className="text-link renewal-workspace-link"
          href={`#renewal-manual-${POLICY_PRODUCT_ACTIVITY[PRODUCT]}`}
        >
          Record the {applicability.productLabel} follow-up
        </a>{" "}
        (a task recorded by staff; it never verifies coverage or a renewed policy).
      </p>
    </section>
  );
}
