import type { WorkTaskRecord } from "@/lib/work-accountability/types";
import { LEASE_FOLLOW_UP_LABELS } from "@/lib/work-accountability/lease-follow-up";
export function LeaseFollowUpOriginView({ task }: Readonly<{ task: WorkTaskRecord }>) {
  const origin = task.renewal_follow_up;
  if (!origin) return null;
  return (
    <div className="ui-stack compact">
      <p>
        <strong>{LEASE_FOLLOW_UP_LABELS[origin.kind]}</strong> · Lease {origin.lease_id} ·{" "}
        {origin.cycle_label}
      </p>
      {origin.notes ? <p className="preserve-whitespace">{origin.notes}</p> : null}
      {origin.distinct_reason ? (
        <p>Separate follow-up: {origin.distinct_reason}</p>
      ) : null}
      {origin.supporting_references.length ? (
        <ul>
          {origin.supporting_references.map((r, i) => {
            let safe = false;
            try {
              const u = new URL(r.url);
              safe = u.protocol === "https:" && !u.username && !u.password;
            } catch {}
            return (
              <li key={i}>
                {safe ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.label}
                  </a>
                ) : (
                  r.label
                )}{" "}
                · staff supporting reference
              </li>
            );
          })}
        </ul>
      ) : null}
      {origin.kind === "rhino" ? (
        <p>
          Policy material at creation:{" "}
          {origin.policy_context?.material_state ?? "not established"}
          {origin.policy_context?.reference
            ? ` · ${origin.policy_context.reference} · v${origin.policy_context.version}`
            : ""}
          . Applicability was unverified.{" "}
          <a href={`${task.source.link}#renewal-policy-content-rhino`}>
            Review current lease policy context
          </a>
        </p>
      ) : null}
      <p className="muted">
        Task status records staff work. Policy applicability, coverage and provider
        effects require their own evidence.
      </p>
    </div>
  );
}
