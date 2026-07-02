// WelcomeDraftCard — renders the Move-In welcome DRAFT on the desk (space-teeth E2e). Read-only,
// draft-only: it prepends the literal DRAFT_BANNER for UI consistency and surfaces every fact source-
// tagged, with missing inputs visible as Needs-Verification markers. A human reviews and sends.

import { Card } from "@/components/ui";
import { DRAFT_BANNER } from "@/lib/constants";
import type { WelcomeDraft } from "@/lib/move-in/welcome-draft";

export function WelcomeDraftCard({ draft }: Readonly<{ draft: WelcomeDraft }>) {
  return (
    <Card title="Welcome draft (email + Portal Chat)">
      <p className="review-pill">{DRAFT_BANNER}</p>

      <h3>Email</h3>
      <p className="muted">Subject: {draft.emailSubject}</p>
      <pre className="draft-body">{draft.emailBody}</pre>

      <h3>Portal Chat</h3>
      <pre className="draft-body">{draft.portalChatMessage}</pre>

      <p className="muted">{draft.feesNote}</p>

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
