"use client";
import { WorkflowCommunicationsHub } from "@/components/gmail-hub/WorkflowCommunicationsHub";
/** S186/S193: one workflow work surface. Pasted/synthetic triage tools are retired from this route. */
export function GmailHubHome({
  authenticatedEmail = "signed-in user",
}: {
  authenticatedEmail?: string;
  canManageAdmin?: boolean;
}) {
  return (
    <section className="content content--workspace ui-stack gmail-hub">
      <div>
        <h1 className="section-title">Workflow Communications</h1>
        <p className="muted">Linked workflows · mailbox management stays in Gmail.</p>
      </div>
      <WorkflowCommunicationsHub authenticatedEmail={authenticatedEmail} />
    </section>
  );
}
