import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { GMAIL_INBOX_ZERO_NAME } from "@/lib/constants";
import { requirePageRole } from "@/lib/auth/page-guards";
import { readServerConfig } from "@/lib/config/server";
import {
  GMAIL_HARD_EXCLUSION_CATEGORIES,
  GMAIL_INBOX_ZERO_BASE_LABELS,
  GMAIL_INBOX_ZERO_LABELS,
  GMAIL_INBOX_ZERO_PHASES,
} from "@/lib/gmail-inbox-zero/constants";

/**
 * Minimal Admin-only Gmail Inbox 0 management page (read-only v1). Gmail runtime stays
 * client-gated: this page renders the governed label/rule/reply models and an honest
 * not-connected status. It performs no Gmail call and has no send capability.
 */
export default async function GmailInboxZeroAdminPage() {
  const user = await requirePageRole("Admin");
  const config = readServerConfig();
  const baseLabels = new Set<string>(GMAIL_INBOX_ZERO_BASE_LABELS);

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">{`${GMAIL_INBOX_ZERO_NAME} Management`}</h1>
        <p className="muted">
          Read-only v1. Gmail runtime is client-gated: no live Gmail access model is
          approved yet, and this page makes no Gmail call. Human send authority is
          preserved — nothing here can send. <Link href="/admin">Back to Admin</Link>
        </p>

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

        <article className="panel">
          <h2>Rollout Phase</h2>
          <p>
            Not started — the reversible, opt-in rollout begins at{" "}
            {GMAIL_INBOX_ZERO_PHASES[0]} (classify only, apply nothing) once access is
            approved.
          </p>
          <ul className="compact-list">
            <li>Shadow: classify only; nothing is applied to the mailbox.</li>
            <li>Suggest: auto-label only exact matches of Admin-approved rules.</li>
            <li>Drafts: unsent drafts from approved reply patterns; Dan presses Send.</li>
          </ul>
        </article>

        <article className="panel">
          <h2>Labels</h2>
          <ul className="compact-list">
            {GMAIL_INBOX_ZERO_LABELS.map((label) => (
              <li key={label}>
                {label}
                {baseLabels.has(label) ? " — base layer" : " — target set"}
              </li>
            ))}
          </ul>
          <p className="muted">
            Labels are additive and reversible; disconnecting leaves ordinary Gmail
            labels.
          </p>
        </article>

        <div className="grid two">
          <article className="panel">
            <h2>Rules</h2>
            <p className="muted">
              No approved rules yet. Plain-English rules become structured fields after
              Admin approval; Dan&apos;s corrections arrive here as Proposed changes.
            </p>
            <p className="muted">
              Hard exclusions (label only, never draft):{" "}
              {GMAIL_HARD_EXCLUSION_CATEGORIES.join(", ")}.
            </p>
          </article>
          <article className="panel">
            <h2>Approved Replies</h2>
            <p className="muted">
              No approved reply patterns yet. Drafts always carry the review-before-
              sending banner and mark missing facts for verification.
            </p>
          </article>
        </div>

        <article className="panel">
          <h2>History of Changes</h2>
          <p className="muted">
            No rule or reply-pattern changes yet. Changes are approval-gated and will be
            recorded here.
          </p>
        </article>
      </section>
    </AppShell>
  );
}
