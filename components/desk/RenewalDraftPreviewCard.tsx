// RenewalDraftPreviewCard — surfaces a renewal draft (owner email or tenant offer) on a Space desk
// (S13 F3), reusing the built composers. It prepends the literal DRAFT_BANNER (house style, matching
// WelcomeDraftCard) so the human-send governance is visible, and shows every fact source-tagged with
// Needs-Verification markers left intact. Read-only, draft-only: never a send affordance.
//
// The desk has no single selected lease, so it renders a representative SAMPLE draft (synthetic, no
// client PII) to prove the composer + banner render here; the live per-lease drafts live on the
// Renewal Workspace review surface.

import { Card } from "@/components/ui";
import { DRAFT_BANNER } from "@/lib/constants";
import type { OwnerRenewalDraft } from "@/lib/lease-renewal/owner-draft";
import type { TenantOfferDraft } from "@/lib/lease-renewal/tenant-draft";

export function OwnerRenewalDraftPreviewCard({
  draft,
}: Readonly<{ draft: OwnerRenewalDraft }>) {
  return (
    <Card title="Owner renewal email (sample draft)">
      <p className="review-pill">{DRAFT_BANNER}</p>
      <p className="muted">Subject: {draft.subject}</p>
      <pre className="draft-body">{draft.body}</pre>
      {draft.missingInputs.length > 0 ? (
        <>
          <h3>Needs Verification</h3>
          <ul className="compact-list">
            {draft.missingInputs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

export function TenantRenewalDraftPreviewCard({
  draft,
}: Readonly<{ draft: TenantOfferDraft }>) {
  return (
    <Card title="Tenant renewal offer (sample draft)">
      <p className="review-pill">{DRAFT_BANNER}</p>
      <h3>Email</h3>
      <p className="muted">Subject: {draft.channels.email.subject}</p>
      <pre className="draft-body">{draft.channels.email.body}</pre>
      <h3>Portal Chat</h3>
      <pre className="draft-body">{draft.channels.portal_chat.body}</pre>
      <h3>Text</h3>
      <pre className="draft-body">{draft.channels.text.body}</pre>
    </Card>
  );
}
