import { can } from "@/lib/auth/roles";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { type GmailStateStore } from "@/lib/gmail-hub/state-store";
import {
  COMMUNICATION_STATUS_LABELS,
  communicationStatusBadge,
} from "@/lib/gmail-hub/communication-state";
import { createDefaultGmailStateStore } from "@/lib/gmail-hub/dependencies";
import { isCommunicationsRecordActive } from "@/lib/gmail-hub/retention-policy";
import {
  workflowCommunicationHref,
  type WorkflowCommunicationLink,
} from "@/lib/gmail-hub/workflow-context";
import { readCommunicationLabels } from "@/lib/gmail-hub/sequence-store";
import { leaseWorkspaceHrefOrNull } from "@/lib/lease-renewal/desk-view-continuation";
import type { UnifiedNotification } from "@/lib/notifications/families";

/** S275 R-S275-6: the stored lease label of each named communication; never a body or address. */
export type CommunicationLabelReader = (
  sequenceIds: readonly string[],
) => Promise<ReadonlyMap<string, string>>;

/**
 * S275 R-S275-6: the notification for a reply on a renewal message names who replied and the
 * lease label the communication stores, and opens that lease's waiting step. The label is read
 * only for links that already passed the workflow access check; no body, subject or address.
 */
export function renewalReplyNotice(
  link: Pick<
    WorkflowCommunicationLink,
    "lane" | "entity_type" | "entity_id" | "purpose" | "waiting_on" | "sequence_id"
  >,
  label: string | null,
): { title: string; message: string; href: string } | null {
  if (
    link.lane !== "renewals" ||
    link.entity_type !== "renewal_lease" ||
    link.waiting_on !== "team" ||
    (link.purpose !== "renewal_owner" && link.purpose !== "renewal_tenant")
  )
    return null;
  const owner = link.purpose === "renewal_owner";
  const href = leaseWorkspaceHrefOrNull(
    link.entity_id,
    owner ? "ask-owner" : "offer-tenant",
  );
  if (!href) return null;
  const lease = label?.trim() || `Lease ${link.entity_id}`;
  return {
    title: owner ? "Owner replied" : "Tenant replied",
    message: `${lease}: read the reply and record the ${owner ? "owner's" : "tenant's"} decision.`,
    href,
  };
}

export async function listGmailWorkflowNotifications(
  actor: AuthenticatedUser,
  options: { unreadOnly?: boolean; limit?: number } = {},
  store: GmailStateStore = createDefaultGmailStateStore(),
  readLabels: CommunicationLabelReader = readCommunicationLabels,
): Promise<UnifiedNotification[]> {
  assertRead(actor);
  const nowMs = Date.now();
  const links = (await store.listCommunicationLinks(actor.email))
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
    .slice(0, options.limit ?? 25);
  // S275 R-S275-6: the lease labels of the renewal replies shown; a failed read names the lease id.
  const replyIds = links.flatMap((link) =>
    link.sequence_id && renewalReplyNotice(link, null) ? [link.sequence_id] : [],
  );
  const labels: ReadonlyMap<string, string> = replyIds.length
    ? await readLabels(replyIds).catch(() => new Map<string, string>())
    : new Map<string, string>();
  return links.map((link) => {
    const renewal = link.lane === "renewals";
    const reply = renewalReplyNotice(
      link,
      link.sequence_id ? (labels.get(link.sequence_id) ?? null) : null,
    );
    if (reply)
      return {
        id: link.id,
        source: "gmail_workflow",
        family: "renewal_communications",
        lane: "decision",
        severity: "medium",
        title: reply.title,
        state_label: communicationStatusBadge(link.status),
        message: reply.message,
        href: reply.href,
        created_at: new Date(link.attention_at_ms!).toISOString(),
        ...(link.read_at_ms ? { read_at: new Date(link.read_at_ms).toISOString() } : {}),
      } satisfies UnifiedNotification;
    return {
      id: link.id,
      source: "gmail_workflow",
      family: renewal ? "renewal_communications" : "maintenance_communications",
      lane: "decision",
      severity: "medium",
      // The same words the hub and the linked detail use for this status.
      title: `${renewal ? "Renewal" : "Maintenance"} communication ${COMMUNICATION_STATUS_LABELS[link.status]}`,
      state_label: communicationStatusBadge(link.status),
      message: `A linked ${renewal ? "renewal" : "maintenance"} communication has a new message.`,
      href: workflowCommunicationHref(link),
      created_at: new Date(link.attention_at_ms!).toISOString(),
      ...(link.read_at_ms ? { read_at: new Date(link.read_at_ms).toISOString() } : {}),
    } satisfies UnifiedNotification;
  });
}

export async function markGmailWorkflowNotificationRead(
  actor: AuthenticatedUser,
  communicationId: string,
  store: GmailStateStore = createDefaultGmailStateStore(),
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
