import { Card, StatusPill } from "@/components/ui";
import type { Role } from "@/lib/auth/roles";
import {
  evaluateRenewalAuthority,
  type RenewalAuthorityDecision,
} from "@/lib/lease-renewal/role-action-governance";

const BASE_CONTEXT = {
  managedIdentity: true,
  hasRenewalsSpace: true,
} as const;

/**
 * The operator-facing projection of S80. It states role eligibility separately from exact external
 * readiness so no copy suggests that an Admin role can open an action key or send from the app.
 */
export function RenewalAuthorityPanel({ role }: Readonly<{ role: Role }>) {
  const routine = evaluateRenewalAuthority("save_renewal_progress", {
    ...BASE_CONTEXT,
    role,
  });
  const reconciliation = evaluateRenewalAuthority("resolve_reconciliation", {
    ...BASE_CONTEXT,
    role,
  });
  const pricing = evaluateRenewalAuthority("approve_pricing_suggestion", {
    ...BASE_CONTEXT,
    role,
  });
  const comps = evaluateRenewalAuthority("request_reference_comps", {
    ...BASE_CONTEXT,
    role,
  });
  // Present production truth: both renewal source-write keys are closed. Evaluate that state as an
  // Admin to make the explanation role-neutral: even the strongest role cannot override closure.
  const sourceWrite = evaluateRenewalAuthority("execute_source_write", {
    ...BASE_CONTEXT,
    role: "Admin",
    externalState: "closed",
    exactConfirmation: true,
  });
  const send = evaluateRenewalAuthority("send_renewal_message", {
    ...BASE_CONTEXT,
    role,
    externalState: "ready",
    exactConfirmation: true,
  });

  return (
    <Card title="Renewal authority">
      <p className="muted">
        Your role and Renewals Space access govern app work. Exact action keys, runtime
        suspensions, provider readiness, quota, and confirmation are separate checks.
      </p>
      <ul className="ui-rows">
        <AuthorityRow
          decision={routine}
          detail="Search, filter, and record app-owned progress or owner direction. These saves never write RentVine or the operating Sheet."
          label="Routine renewal work"
        />
        <AuthorityRow
          decision={comps}
          detail="Your role may request reference comps; the exact RentCast key, runtime state, connection, and allowance are checked at request time."
          label="Reference comps"
        />
        <AuthorityRow
          decision={reconciliation}
          detail={
            reconciliation.code === "allowed"
              ? "You may record an audited reconciliation decision. A source write remains separate."
              : `${reconciliation.reason} ${reconciliation.safeNextAction}`
          }
          label="Source reconciliation"
        />
        <AuthorityRow
          decision={pricing}
          detail={
            pricing.code === "allowed"
              ? "You may approve the app-only suggestion; approval does not write a source or send a message."
              : `${pricing.reason} ${pricing.safeNextAction}`
          }
          label="Pricing suggestion approval"
        />
        <AuthorityRow
          decision={sourceWrite}
          detail={`${sourceWrite.reason} ${sourceWrite.safeNextAction}`}
          label="RentVine and operating-Sheet writes"
        />
        <AuthorityRow
          decision={send}
          detail={`${send.reason} ${send.safeNextAction}`}
          label="Send from the app"
        />
      </ul>
      <p className="muted">
        Editors and up may begin drafting. The exact draft key and runtime checks still
        gate preview and creation; exact-confirm one unsent Gmail draft, then review and
        send from Gmail. The app never sends it.
      </p>
    </Card>
  );
}

function AuthorityRow({
  decision,
  detail,
  label,
}: Readonly<{
  decision: RenewalAuthorityDecision;
  detail: string;
  label: string;
}>) {
  const roleAvailable =
    decision.code === "allowed" || decision.code === "external_check_required";
  return (
    <li className="ui-stack-tight">
      <div className="ui-spread">
        <strong>{label}</strong>
        <StatusPill value={roleAvailable ? "Low" : "Needs Verification"}>
          {roleAvailable ? "Role available" : "Unavailable"}
        </StatusPill>
      </div>
      <span className="muted">{detail}</span>
    </li>
  );
}
