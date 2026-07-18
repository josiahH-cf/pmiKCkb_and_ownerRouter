"use client";

import { AnticipatoryDraftComposer } from "@/components/gmail-hub/AnticipatoryDraftComposer";
import { LiveGmailWorkspace } from "@/components/gmail-hub/LiveGmailWorkspace";
import { SimulatedEmailChain } from "@/components/gmail-hub/SimulatedEmailChain";
import { TemplateWorkspace } from "@/components/gmail-hub/TemplateWorkspace";
import { ThreadSummaryPanel } from "@/components/gmail-hub/ThreadSummaryPanel";
import { TestOperationalHandoffPanel } from "@/components/operations/TestOperationalHandoffPanel";
import type { TestOperationalHandoff } from "@/lib/operations/test-handoffs";

/** Workflow-bounded Gmail status plus an Admin-only pasted/synthetic fallback. */
export function GmailHubHome({
  authenticatedEmail = "signed-in user",
  canManageAdmin = false,
  operationalHandoffs = [],
}: {
  authenticatedEmail?: string;
  canManageAdmin?: boolean;
  operationalHandoffs?: readonly TestOperationalHandoff[];
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

      <TestOperationalHandoffPanel
        handoffs={operationalHandoffs}
        title="Workflow-linked Test communication handoffs"
      />

      {canManageAdmin ? (
        <section className="ui-stack" aria-label="Admin fallback tools">
          <div>
            <h2>Admin-only governed workflow recovery tools</h2>
            <p className="muted">
              These are not generic compose or new-message send controls. They do not read
              the live mailbox; pasted input must be sanitized, and outputs remain
              workflow-bounded drafts or review proposals with no delivery.
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
