// F-TMPL-2: the pure mapper from an editable-store TemplateRecord to the Gmail spine's ReplyTemplate.
// Extracted from template-store.ts so CLIENT components (the Gmail hub composers) can map templates
// fetched over the /api/spaces/[id]/templates route without importing template-store.ts, which pulls in
// firebase-admin. Types only here — no I/O, no send capability, client-safe.

import type { TemplateRecord } from "@/lib/firestore/types";
import type { ReplyTemplate } from "@/lib/gmail-inbox-zero/drafts";

// Bridge the editable store's TemplateStatus (Draft | In Review | Approved | Deprecated) to the Gmail
// spine's GmailRuleStatus (Proposed | Approved | Retired). Only a stored Approved template maps to
// Approved, so the spine still refuses everything else BEFORE the model runs.
export function toReplyTemplate(
  record: Pick<TemplateRecord, "id" | "name" | "body" | "status">,
): ReplyTemplate {
  return {
    id: record.id,
    name: record.name,
    body: record.body,
    status:
      record.status === "Approved"
        ? "Approved"
        : record.status === "Deprecated"
          ? "Retired"
          : "Proposed",
  };
}
