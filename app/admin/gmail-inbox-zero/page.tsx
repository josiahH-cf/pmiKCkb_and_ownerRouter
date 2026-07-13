import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { TemplateWorkspace } from "@/components/gmail-hub/TemplateWorkspace";
import { GMAIL_INBOX_ZERO_NAME } from "@/lib/constants";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { readServerConfig } from "@/lib/config/server";

/**
 * Admin-only Gmail Inbox 0 management surface. The static read-only v1 placeholder is retired: this
 * page now renders the Template & triage workspace beside the activated per-user Gmail status. The
 * live hub remains the place where a user checks their own connection and exact-confirms a send.
 */
export default async function GmailInboxZeroAdminPage() {
  const user = await requirePageCapability("manageAdmin");
  const config = readServerConfig();

  return (
    <AppShell user={user}>
      <section className="content ui-stack">
        <div>
          <h1 className="section-title">{`${GMAIL_INBOX_ZERO_NAME} Management`}</h1>
          <p className="muted">
            Manage the approved rules and reply patterns and evaluate them over pasted,
            sanitized facts. Per-user mailbox read, draft, exact-confirmed send/reply,
            labels, and push sync are active; human send authority is preserved.{" "}
            <Link href="/gmail-hub">Open the Gmail hub</Link> ·{" "}
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
              Open the Gmail hub to verify the signed-in user&apos;s own mailbox
              connection, start or renew its push watch, and use the reviewed mail
              actions.
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

        <TemplateWorkspace />
      </section>
    </AppShell>
  );
}
