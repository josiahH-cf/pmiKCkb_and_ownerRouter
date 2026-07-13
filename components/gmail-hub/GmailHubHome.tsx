"use client";

import { NOTIFICATION_FAMILIES, WAITING_ON_GMAIL } from "@/lib/notifications/families";

import { AnticipatoryDraftComposer } from "@/components/gmail-hub/AnticipatoryDraftComposer";
import { LiveGmailWorkspace } from "@/components/gmail-hub/LiveGmailWorkspace";
import { SimulatedEmailChain } from "@/components/gmail-hub/SimulatedEmailChain";
import { TemplateWorkspace } from "@/components/gmail-hub/TemplateWorkspace";
import { ThreadSummaryPanel } from "@/components/gmail-hub/ThreadSummaryPanel";

/** Gmail live workspace plus a clearly separated browser-only/pasted-text fallback. */
export function GmailHubHome({
  authenticatedEmail = "signed-in user",
  canCompose = false,
  canSend = false,
}: {
  authenticatedEmail?: string;
  canCompose?: boolean;
  canSend?: boolean;
}) {
  return (
    <section className="content ui-stack gmail-hub">
      <div>
        <h1 className="section-title">Gmail hub</h1>
        <p className="muted">
          Work in your own live mailbox after its approved connection succeeds. Every send
          shows the exact message and requires your one-time confirmation. Pasted-text and
          browser-only tools remain available as a separate fallback.
        </p>
      </div>

      <LiveGmailWorkspace
        authenticatedEmail={authenticatedEmail}
        canCompose={canCompose}
        canSend={canSend}
      />

      <h2>Offline and demo fallback</h2>
      <SimulatedEmailChain />
      <AnticipatoryDraftComposer />
      <TemplateWorkspace />
      <ThreadSummaryPanel />

      <article className="panel ui-stack">
        <h2>Notifications</h2>
        <p className="muted">
          The same in-app notification families as the Console and the bell. The
          Gmail-dependent families stay gated until inbox access is approved.
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
