import Link from "next/link";
import type { ProcessDefinitionRecord } from "@/lib/firestore/types";
import {
  GUIDANCE_HEADING,
  GUIDANCE_WITHOUT_PUBLISHED_PROCESS,
  RENEWAL_DESK_LINK_LABEL,
  guidanceSourceHref,
  hasPublishedVersion,
} from "@/lib/processes/guidance-only";

/**
 * S286 R-S286-1: a renewal Space shows its published process read only, as how the work is done,
 * with one primary link to the Renewal Desk. It has no run, start or checklist control. Without a
 * published version it says renewals are worked on the desk, with the same link. A secondary text
 * link keeps the way to the process definition, where reviewers keep editing and publishing it
 * (R-S286-5). Pure render: the page reads the definition and passes the desk link (with a
 * still-authorized lease context).
 */
export function RenewalProcessGuidance({
  definition,
  definitionId,
  deskHref,
}: Readonly<{
  definition: Pick<
    ProcessDefinitionRecord,
    "status" | "active_version_id" | "short_outcome" | "steps" | "source_links"
  > | null;
  definitionId: string;
  deskHref: string;
}>) {
  const published = definition && hasPublishedVersion(definition) ? definition : null;

  return (
    <section aria-labelledby="renewal-guidance-heading" className="panel ui-stack">
      <h2 id="renewal-guidance-heading">{GUIDANCE_HEADING}</h2>
      {published ? (
        <>
          {published.short_outcome ? (
            <p className="muted">{published.short_outcome}</p>
          ) : null}
          <ol className="compact-list">
            {published.steps.map((step) => (
              <li key={step.id}>
                <strong>{step.title}</strong>
                {step.description ? <p className="muted">{step.description}</p> : null}
              </li>
            ))}
          </ol>
          {published.source_links.length > 0 ? (
            <>
              <h3>Sources</h3>
              <ul className="compact-list">
                {published.source_links.map((source, index) => {
                  const href = guidanceSourceHref(source.url);
                  return (
                    <li key={`${index}:${source.url}`}>
                      {href ? (
                        <a href={href} rel="noopener noreferrer" target="_blank">
                          {source.label}
                        </a>
                      ) : (
                        source.label
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </>
      ) : (
        <p>{GUIDANCE_WITHOUT_PUBLISHED_PROCESS}</p>
      )}
      <p>
        <Link className="primary-button" href={deskHref}>
          {RENEWAL_DESK_LINK_LABEL}
        </Link>
      </p>
      <Link className="text-link" href={`/processes/${encodeURIComponent(definitionId)}`}>
        View full process →
      </Link>
    </section>
  );
}
