import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { TemplateWorkspace } from "@/components/gmail-hub/TemplateWorkspace";
import { GMAIL_INBOX_ZERO_NAME } from "@/lib/constants";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { readServerConfig } from "@/lib/config/server";

/**
 * Admin-only Gmail Inbox 0 management surface. The static read-only v1 placeholder is retired: this
 * page now renders the live Template & triage workspace (the governed engines run over pasted,
 * sanitized facts) beside an honest not-connected Gmail status. No live mailbox is read; nothing here
 * can send — a human presses Send in Gmail once the access model is approved.
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
            sanitized facts. Live mailbox actions wait on the approved Gmail access model;
            human send authority is preserved.{" "}
            <Link href="/gmail-hub">Open the Gmail hub</Link> ·{" "}
            <Link href="/admin">Back to Admin</Link>
          </p>
        </div>

        <div className="grid two">
          <article className="panel">
            <h2>Gmail Connection</h2>
            <p>
              <span className="queue-pill" data-value="Action Required">
                Not connected
              </span>
            </p>
            <p className="muted">
              Blocked on the client-approved Gmail access model, mailbox scan protocol,
              and live test-thread protocol (owner-side asks).
            </p>
          </article>
          <article className="panel">
            <h2>Gemini Status</h2>
            <p>
              {config.askDemoMode
                ? "Demo mode — no live Gemini calls from this session."
                : "Live mode configured for the KB Ask path; Gmail evaluation remains client-gated."}
            </p>
          </article>
        </div>

        <TemplateWorkspace />
      </section>
    </AppShell>
  );
}
