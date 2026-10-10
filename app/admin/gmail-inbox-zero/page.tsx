import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { WORKFLOW_COMMUNICATIONS_NAME } from "@/lib/constants";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { readServerConfig } from "@/lib/config/server";
import {
  GOVERNED_ARTIFACT_REGISTRY,
  WORKFLOW_REPLY_POLICY_REF,
} from "@/lib/gmail-hub/governed-artifacts";

/**
 * Compatibility route for Admin workflow-communication governance. The immutable v1.0 artifact
 * registry is production policy; the separate evaluator remains synthetic and cannot authorize send.
 */
export default async function GmailInboxZeroAdminPage() {
  const user = await requirePageCapability("manageAdmin");
  const config = readServerConfig();

  return (
    <AppShell user={user}>
      <section className="content ui-stack">
        <div>
          <h1 className="section-title">{`${WORKFLOW_COMMUNICATIONS_NAME} Governance`}</h1>
          <p className="muted">
            Workflow-linked Gmail only. A staff member reviews the exact message and
            chooses Send or Schedule in Communications. Old drafts retain their original
            state. <Link href="/gmail-hub">Open Workflow Communications</Link> ·{" "}
            <Link href="/admin">Back to Admin</Link>
          </p>
        </div>

        <article className="panel ui-stack">
          <h2>Approved v1.0 communication artifacts</h2>
          <p className="muted">
            Immutable base copy only. Every instance still blocks on authoritative
            recipient, mailbox, values, source context, and exact human confirmation. AI
            policy: <code>{WORKFLOW_REPLY_POLICY_REF}</code>.
          </p>
          <div className="workflow-record-list">
            {GOVERNED_ARTIFACT_REGISTRY.map((artifact) => (
              <div className="compact-record" key={artifact.ref}>
                <strong>{artifact.ref}</strong>
                <p className="muted">
                  {artifact.purpose.replaceAll("_", " ")} · hash{" "}
                  {artifact.contentHash.slice(0, 12)}… · approved {artifact.approvedAt}
                </p>
              </div>
            ))}
          </div>
        </article>

        <div className="grid two">
          <article className="panel">
            <h2>Gmail Connection</h2>
            <Link className="text-link" href="/gmail-hub">
              Verify my Gmail connection
            </Link>
          </article>
          <article className="panel">
            <h2>Gemini Status</h2>
            <p>
              {config.askDemoMode
                ? "Demo mode: no live Gemini calls from this session."
                : "Live mode configured for the KB Ask path and Gmail draft evaluation."}
            </p>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
