import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { TemplateWorkspace } from "@/components/gmail-hub/TemplateWorkspace";
import { WORKFLOW_COMMUNICATIONS_NAME } from "@/lib/constants";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { readServerConfig } from "@/lib/config/server";

/**
 * Compatibility route for Admin workflow-communication governance. Samples below are not persisted
 * approved artifacts and cannot authorize live Gmail actions.
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
            Review synthetic rule and reply-pattern examples over pasted, sanitized facts.
            These examples are not persisted or production-approved. Live Gmail is limited
            to authorized workflow links, approved labels, targeted reads, and
            exact-confirmed replies; human send authority is preserved.{" "}
            <Link href="/gmail-hub">Open Workflow Communications</Link> ·{" "}
            <Link href="/admin">Back to Admin</Link>
          </p>
        </div>

        <div className="grid two">
          <article className="panel">
            <h2>Gmail Connection</h2>
            <p>
              <span className="queue-pill" data-value="Available">
                Activated
              </span>
            </p>
            <p className="muted">
              Open Workflow Communications to verify the signed-in user&apos;s own Gmail
              authorization, inspect bodyless workflow attention, and start or renew the
              targeted reply watch. Unrelated inbox content is not shown.
            </p>
          </article>
          <article className="panel">
            <h2>Gemini Status</h2>
            <p>
              {config.askDemoMode
                ? "Demo mode — no live Gemini calls from this session."
                : "Live mode configured for the KB Ask path and Gmail draft evaluation."}
            </p>
          </article>
        </div>

        <article className="panel ui-stack">
          <h2>Synthetic rule/template evaluator</h2>
          <p className="muted">
            Admin demonstration only. Production rules and reply templates require a
            future persisted, versioned approval surface.
          </p>
          <TemplateWorkspace />
        </article>
      </section>
    </AppShell>
  );
}
