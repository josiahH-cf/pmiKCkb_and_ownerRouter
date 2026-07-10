"use client";

import { NOTIFICATION_FAMILIES, WAITING_ON_GMAIL } from "@/lib/notifications/families";

import { AnticipatoryDraftComposer } from "@/components/gmail-hub/AnticipatoryDraftComposer";
import { TemplateWorkspace } from "@/components/gmail-hub/TemplateWorkspace";
import { ThreadSummaryPanel } from "@/components/gmail-hub/ThreadSummaryPanel";

/**
 * The Gmail hub home. One workflow surface where an operator drafts replies, manages templates and
 * triage rules, and summarizes threads — all BEFORE any mailbox is connected. Every live-mailbox
 * affordance (the "read my inbox" control and the Gmail-dependent notification families) renders
 * disabled with the single gated string "Waiting on Gmail access". Nothing on this page reads or sends
 * mail; the ceiling is a review-before-send draft a human sends from Gmail.
 */
export function GmailHubHome() {
  return (
    <section className="content ui-stack">
      <div>
        <h1 className="section-title">Gmail hub</h1>
        <p className="muted">
          Draft replies, manage reply patterns and triage rules, and summarize threads — all before a
          mailbox is connected. Live-mailbox actions wait on the approved Gmail access model, and human
          send authority is preserved.
        </p>
      </div>

      <article className="panel ui-stack">
        <h2>Read my inbox</h2>
        <p className="muted">
          Reading, auto-triaging, and drafting from your live mailbox needs the client-approved Gmail
          access model and a domain-wide-delegation read grant.
        </p>
        <button className="secondary-button" disabled type="button">
          {WAITING_ON_GMAIL}
        </button>
      </article>

      <AnticipatoryDraftComposer />
      <TemplateWorkspace />
      <ThreadSummaryPanel />

      <article className="panel ui-stack">
        <h2>Notifications</h2>
        <p className="muted">
          The same in-app notification families as the Console and the bell. The Gmail-dependent
          families stay gated until inbox access is approved.
        </p>
        <ul className="compact-list">
          {NOTIFICATION_FAMILIES.map((family) => (
            <li key={family.key}>
              <strong>{family.label}</strong> — {family.description}{" "}
              {family.available ? (
                <span className="queue-pill" data-value="Available">
                  Available
                </span>
              ) : (
                <span className="queue-pill" data-value="Action Required">
                  {family.unavailableReason ?? WAITING_ON_GMAIL}
                </span>
              )}
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
