// F-TMPL-3: resolve reply templates for the anticipatory-draft route from SERVER-TRUSTED sources only.
// Previously the route accepted the whole template (id, name, body, AND status) from the client and
// passed it straight to the deterministic spine, whose approval gate (`status === "Approved"`) then
// compared client-supplied status against client-supplied body — so a caller could POST
// {status:"Approved", body:"<anything>"} and get a model-tailored draft of arbitrary prose. Here the
// client supplies only an id; the body and status come from the approved store (or the server-defined
// sample patterns that back the governance preview), making the spine's gate trustworthy.

import type { Firestore } from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { getTemplate } from "@/lib/firestore/editable";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { ReplyTemplate } from "@/lib/gmail-inbox-zero/drafts";
import { toReplyTemplate } from "@/lib/gmail-inbox-zero/reply-template-map";
import { SAMPLE_REPLY_TEMPLATES } from "@/lib/gmail-inbox-zero/sample-hub";

// Re-export the pure mapper (now client-safe in reply-template-map.ts) so existing server importers of
// toReplyTemplate keep working through this module.
export { toReplyTemplate };

// Resolve by id from the approved store first (getTemplate enforces read capability, Space access, and
// active-record — an unknown/soft-deleted id throws 404), then fall back to the server-defined sample
// reply patterns used by the governance preview. Returns null when the id matches neither. A scope
// denial (AuthError) or any non-404 error propagates rather than silently falling back to samples.
export async function resolveReplyTemplate(
  actor: AuthenticatedUser,
  templateId: string,
  db: Firestore = getAdminFirestore(),
): Promise<ReplyTemplate | null> {
  try {
    return toReplyTemplate(await getTemplate(actor, templateId, db));
  } catch (error) {
    if (!(error instanceof EditableLayerError) || error.status !== 404) {
      throw error;
    }
  }
  return SAMPLE_REPLY_TEMPLATES.find((template) => template.id === templateId) ?? null;
}
