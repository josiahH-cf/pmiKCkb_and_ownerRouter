"use client";

import { AnticipatoryDraftComposer } from "@/components/gmail-hub/AnticipatoryDraftComposer";
import { LiveGmailWorkspace } from "@/components/gmail-hub/LiveGmailWorkspace";
import { SimulatedEmailChain } from "@/components/gmail-hub/SimulatedEmailChain";
import { TemplateWorkspace } from "@/components/gmail-hub/TemplateWorkspace";
import { ThreadSummaryPanel } from "@/components/gmail-hub/ThreadSummaryPanel";

/** Workflow-bounded Gmail status plus an Admin-only pasted/synthetic fallback. */
export function GmailHubHome({
  authenticatedEmail = "signed-in user",
  canManageAdmin = false,
}: {
  authenticatedEmail?: string;
  canManageAdmin?: boolean;
}) {
  return (
    <section className="content ui-stack gmail-hub">
      <div>
        <h1 className="section-title">Workflow Communications</h1>
        <p className="muted">
          Review Gmail evidence in the renewal or maintenance workflow it supports. This
          is not a replacement inbox: unrelated mail, generic compose, and mailbox
          management stay in Gmail.
        </p>
      </div>

      <LiveGmailWorkspace authenticatedEmail={authenticatedEmail} />

      {canManageAdmin ? (
        <section className="ui-stack" aria-label="Admin fallback tools">
          <div>
            <h2>Admin-only pasted and synthetic fallback</h2>
            <p className="muted">
              These tools do not read the live mailbox. Pasted input must be sanitized and
              outputs remain drafts or proposals for human review.
            </p>
          </div>
          <SimulatedEmailChain />
          <AnticipatoryDraftComposer />
          <TemplateWorkspace />
          <ThreadSummaryPanel />
        </section>
      ) : null}
    </section>
  );
}
