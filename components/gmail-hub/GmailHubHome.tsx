"use client";

import { useEffect, useState } from "react";

import { AnticipatoryDraftComposer } from "@/components/gmail-hub/AnticipatoryDraftComposer";
import { LiveGmailWorkspace } from "@/components/gmail-hub/LiveGmailWorkspace";
import { SimulatedEmailChain } from "@/components/gmail-hub/SimulatedEmailChain";
import { TemplateWorkspace } from "@/components/gmail-hub/TemplateWorkspace";
import { ThreadSummaryPanel } from "@/components/gmail-hub/ThreadSummaryPanel";
import { TestOperationalHandoffPanel } from "@/components/operations/TestOperationalHandoffPanel";
import type { TemplateRecord } from "@/lib/firestore/types";
import type { ReplyTemplate } from "@/lib/gmail-inbox-zero/drafts";
import { toReplyTemplate } from "@/lib/gmail-inbox-zero/reply-template-map";
import { SAMPLE_REPLY_TEMPLATES } from "@/lib/gmail-inbox-zero/sample-hub";
import type { TestOperationalHandoff } from "@/lib/operations/test-handoffs";

// F-TMPL-2: the reply patterns the Admin composers offer come from the approved store (the
// daily-inbox-triage Communications Space), not a hard-coded list. The server route
// (/api/gmail-hub/anticipatory-draft) still resolves the body + status server-side, so this fetch only
// drives the picker; an empty store or a non-OK response keeps the built-in sample patterns.
const REPLY_TEMPLATES_ENDPOINT = "/api/spaces/daily-inbox-triage/templates";

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
  const [replyTemplates, setReplyTemplates] =
    useState<readonly ReplyTemplate[]>(SAMPLE_REPLY_TEMPLATES);

  useEffect(() => {
    if (!canManageAdmin) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(REPLY_TEMPLATES_ENDPOINT);
        if (!response.ok) return;
        const payload = (await response.json()) as { templates?: TemplateRecord[] };
        const mapped = (payload.templates ?? []).map(toReplyTemplate);
        if (active && mapped.length > 0) setReplyTemplates(mapped);
      } catch {
        // Keep the sample fallback on any read/parse failure.
      }
    })();
    return () => {
      active = false;
    };
  }, [canManageAdmin]);

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
          <AnticipatoryDraftComposer templates={replyTemplates} />
          <TemplateWorkspace templates={replyTemplates} />
          <ThreadSummaryPanel />
        </section>
      ) : null}
    </section>
  );
}
