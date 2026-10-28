"use client";

import { renewalDashboardTarget } from "@/lib/lease-renewal/dashboard-sections";
import { buildWorkspaceHref } from "@/lib/lease-renewal/desk-view-continuation";
import type { RenewalIssue } from "@/lib/lease-renewal/renewal-issues";

/**
 * S232 R-S232-5: what an issue needs, who resolves it and where. The workspace's issue list and
 * Focus render exactly this from the one issue projection: the missing input by its visible label,
 * the person the app records (otherwise the role), and a working link to the resolving control,
 * the page's own source refresh, or an explicit statement that it is resolved outside the app.
 */
export function RenewalIssueResolution({
  issue,
  leaseId,
  deskView,
}: Readonly<{ issue: RenewalIssue; leaseId: string; deskView: string | null }>) {
  const at = issue.resolveAt;
  return (
    <span className="renewal-issue-resolution" data-renewal-issue-resolve-at={at.kind}>
      <span className="muted">
        Needs: {issue.needs}. Resolved by: {issue.responsible}.
      </span>{" "}
      {at.kind === "outside_app" ? (
        <span>Outside the app: {at.statement}</span>
      ) : at.kind === "refresh" ? (
        <a
          className="text-link renewal-workspace-link"
          href={buildWorkspaceHref({ leaseId, deskView })}
          onClick={(event) => {
            // The page's own source refresh does the read; without it the link reloads the lease.
            const refresh = document.getElementById("renewal-refresh");
            if (!refresh) return;
            event.preventDefault();
            refresh.click();
          }}
        >
          {at.label}
        </a>
      ) : (
        <a
          className="text-link renewal-workspace-link"
          href={
            at.kind === "page"
              ? at.href
              : at.destination.kind === "workspace_anchor"
                ? `#${at.destination.targetId}`
                : `${buildWorkspaceHref({ leaseId, step: at.destination.stepId, deskView })}#${at.destination.controlId ?? renewalDashboardTarget(at.destination.stepId)}`
          }
        >
          {at.label}
        </a>
      )}
    </span>
  );
}
