import { can } from "@/lib/auth/roles";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  FirestoreGmailStateStore,
  type GmailStateStore,
} from "@/lib/gmail-hub/state-store";
import { isCommunicationsRecordActive } from "@/lib/gmail-hub/retention-policy";
import { workflowEntityHref } from "@/lib/gmail-hub/workflow-context";
import type { UnifiedNotification } from "@/lib/notifications/families";

export async function listGmailWorkflowNotifications(
  actor: AuthenticatedUser,
  options: { unreadOnly?: boolean; limit?: number } = {},
  store: GmailStateStore = new FirestoreGmailStateStore(),
): Promise<UnifiedNotification[]> {
  assertRead(actor);
  const nowMs = Date.now();
  return (await store.listCommunicationLinks(actor.email))
    .filter((link) => link.actor_uid === actor.uid)
    .filter((link) => hasSpaceAccess(actor, link.lane))
    .filter(
      (link) =>
        link.status === "attention_required" &&
        Boolean(link.attention_at_ms) &&
        isCommunicationsRecordActive(
          "gmail_workflow_communications",
          link.id,
          link,
          nowMs,
        ),
    )
    .filter((link) => (options.unreadOnly ? !link.read_at_ms : true))
    .slice(0, options.limit ?? 25)
    .map((link) => {
      const renewal = link.lane === "renewals";
      return {
        id: link.id,
        source: "gmail_workflow",
        family: renewal ? "renewal_communications" : "maintenance_communications",
        lane: "decision",
        severity: "medium",
        title: `${renewal ? "Renewal" : "Maintenance"} communication needs review`,
        message: `A linked ${renewal ? "renewal" : "maintenance"} communication has a new message.`,
        href: workflowEntityHref(link),
        created_at: new Date(link.attention_at_ms!).toISOString(),
        ...(link.read_at_ms ? { read_at: new Date(link.read_at_ms).toISOString() } : {}),
      } satisfies UnifiedNotification;
    });
}

export async function markGmailWorkflowNotificationRead(
  actor: AuthenticatedUser,
  communicationId: string,
  store: GmailStateStore = new FirestoreGmailStateStore(),
) {
  assertRead(actor);
  const link = (await store.listCommunicationLinks(actor.email)).find(
    (candidate) => candidate.id === communicationId && candidate.actor_uid === actor.uid,
  );
  if (!link || !hasSpaceAccess(actor, link.lane)) {
    throw new EditableLayerError(
      "That Gmail workflow notification is not available to this user.",
      404,
    );
  }
  await store.markCommunicationRead({
    linkId: link.id,
    mailboxEmail: actor.email,
    nowMs: Date.now(),
  });
}

function assertRead(actor: AuthenticatedUser) {
  if (!can(actor.role, "read")) {
    throw new EditableLayerError(
      "This user cannot read workflow communication attention.",
      403,
    );
  }
}
