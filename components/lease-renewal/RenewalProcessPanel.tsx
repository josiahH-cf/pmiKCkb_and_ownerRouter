import { Card, Disclosure, StatusPill } from "@/components/ui";
import type {
  RenewalProcessProjection,
  RenewalSubstepState,
} from "@/lib/lease-renewal/renewal-process";

const STATE_LABEL: Record<RenewalSubstepState, string> = {
  not_started: "Not started",
  blocked: "Blocked",
  ready: "Ready",
  complete: "Complete",
};

const PROCESS_STATUS: Record<RenewalProcessProjection["status"], string> = {
  active: "Active",
  waiting: "Waiting for tenant response",
  counter_reopened: "Owner decision reopened",
  needs_verification: "Needs verification",
  non_renewal_handoff_required: "Non-renewal handoff required",
  non_renewal_handoff: "Non-renewal handoff recorded",
  complete: "Complete",
  migration_required: "Legacy progress needs review",
};

/** S72's dense but explicit six-step/substep projection. It renders evidence state only. */
export function RenewalProcessPanel({
  process,
}: Readonly<{ process: RenewalProcessProjection }>) {
  return (
    <Card
      actions={
        <StatusPill value={process.status}>{PROCESS_STATUS[process.status]}</StatusPill>
      }
      ariaLabel="Renewal process and evidence"
      title={`Renewal process · ${process.definitionVersion}`}
    >
      <p className="muted">
        Progress comes from exact source, receipt, policy, packet, signature, and
        compliance evidence. A note, click, draft, or provider estimate cannot complete a
        step by itself.
      </p>
      {process.migrationRequired ? (
        <p className="muted" role="status">
          {process.migrationReason}
        </p>
      ) : null}
      <ol className="ui-rows">
        {process.steps.map((step, index) => (
          <li className="ui-stack-tight" key={step.id}>
            <div className="ui-spread">
              <span>
                <strong>
                  {index + 1}. {step.title}
                </strong>
                <span className="muted"> · {step.responsibleRole}</span>
              </span>
              <StatusPill value={step.state}>{STATE_LABEL[step.state]}</StatusPill>
            </div>
            <p className="muted">{step.completionRule}</p>
            <Disclosure summary={`${step.substeps.length} operational substeps`}>
              <ul className="ui-rows">
                {step.substeps.map((substep) => (
                  <li className="ui-stack-tight" key={substep.id}>
                    <div className="ui-spread">
                      <span>
                        <strong>{substep.label}</strong>
                        <span className="muted"> · {substep.responsibleRole}</span>
                      </span>
                      <StatusPill value={substep.state}>
                        {STATE_LABEL[substep.state]}
                      </StatusPill>
                    </div>
                    {!substep.applicable ? (
                      <p className="muted">Not applicable to the current branch.</p>
                    ) : (
                      <>
                        {substep.blockers.map((blocker) => (
                          <p className="muted" key={blocker}>
                            {blocker}
                          </p>
                        ))}
                        {substep.state !== "complete" ? (
                          <p className="muted">Next: {substep.nextAction}</p>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </Disclosure>
          </li>
        ))}
      </ol>
    </Card>
  );
}
