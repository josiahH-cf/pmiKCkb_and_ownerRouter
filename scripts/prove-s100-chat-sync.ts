// S100 per-key live proof runner (owner-authorized bounded proof windows). Mirrors the S97-S99
// runners: local ADC, the deployed S100 service modules, the real S20 ledger, and the official
// account operations. The committed per-key gates stay authoritative — every consequential
// operation refuses unless its exact key is inside an open proof window. The packet arrives
// untracked (temp/) and is never committed. Evidence is bodyless: message bodies and raw provider
// rows are never printed; the runner echoes only ids, roles, mapping states, hashes, counts,
// pagination, and the exact preview values the owner must confirm.
//
// Owner-approved proof shape: one manually confirmed chat page on the designated TEST work order
// (chat.sync key), then — only after a mapped resident with a verified email exists — one exact
// resident-reply unsent Gmail draft (resident draft key). Neither proof authorizes the other key.
//
// Usage (always with explicit production context):
//   ENVIRONMENT_KIND=production DATA_CONTEXT=live GOOGLE_CLOUD_PROJECT=pmi-kc-kb-prod \
//     npx tsx scripts/prove-s100-chat-sync.ts <preview|confirm|thread|rerun|draft-preview|\
//     draft-confirm|draft-reconcile> [--packet=temp/s100-proof-packet.json] [--execution=...] \
//     [--hash=...] [--message=...]

import { readFileSync } from "node:fs";

for (const file of [".env.local", ".env.production.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^"|"$/g, "");
      }
    }
  } catch {
    // Optional file; ambient environment stays authoritative.
  }
}

import { getAuth } from "firebase-admin/auth";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { requireEnvironmentDescriptor } from "@/lib/environment/descriptor";
import {
  executeGovernedDraft,
  prepareGovernedDraft,
  reconcileGovernedDraft,
} from "@/lib/external-execution/governed-draft-execution";
import { expectedExternalS20ExecutionId } from "@/lib/external-execution/s20-bridge";
import { createDescriptorBoundGmailRuntimeClient } from "@/lib/gmail-hub/dependencies";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { getMaintenanceWorkOrderLink } from "@/lib/firestore/maintenance-work-order-links";
import {
  loadPreparedWorkOrderAction,
  preparedActionInput,
  savePreparedWorkOrderAction,
} from "@/lib/firestore/maintenance-work-order-prepared-actions";
import {
  applyRerunResidentBinding,
  commitChatSyncPage,
  getWorkOrderChatMessage,
  listWorkOrderChatRecords,
  type ChatSyncCounts,
} from "@/lib/firestore/rentvine-work-order-chat-messages";
import { rentVineAccountCode } from "@/lib/integrations/rentvine/client";
import { resolveResidentFromLeaseTenants } from "@/lib/integrations/rentvine/chat-contract";
import {
  RESIDENT_REPLY_DRAFT_KEY,
  RentVineWorkOrderChatSyncExecutor,
  WORK_ORDER_CHAT_SYNC_KEY,
  buildChatSyncClients,
} from "@/lib/maintenance/execution/chat-sync-service";
import { buildResidentReplyDraftAction } from "@/lib/maintenance/execution/resident-reply-draft-request";
import { MAINTENANCE_EXECUTION_DEFINITION_MAP } from "@/lib/maintenance/execution/matrix";
import {
  WORK_ORDER_READ_KEY,
  assertWorkOrderActionAllowed,
  buildTrustedContext,
  workOrderDefinition,
  workOrderS20,
} from "@/lib/maintenance/execution/work-order-service";
import type { ExternalActionPreparationInput } from "@/lib/external-execution/s20-bridge";

const OWNER_EMAIL = "josiah@pmikcmetro.com";
const CHAT_CONTRACT_REF = "documented:rentvine:chat-messages:v1";
const CHAT_CONNECTION_REF = "rentvine-manager-api:production";
const CHAT_MAPPING_REF = "maintenance-ticket-work-order-chat:v1";

interface ProofPacket {
  /** The persisted Live TEST app ticket carrying the receipted S99 work-order link. */
  ticketId: string;
  /** The exact confirmed provider page (default 1). */
  page?: number;
  /** Draft proof only: owner-authored reply copy for the mapped resident message. */
  draftMessageId?: number;
  draftSubject?: string;
  draftBody?: string;
}

function argValue(name: string, fallback: string): string {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}

function loadPacket(): ProofPacket {
  const path = argValue("packet", "temp/s100-proof-packet.json");
  return JSON.parse(readFileSync(path, "utf8")) as ProofPacket;
}

async function ownerActor(): Promise<AuthenticatedUser> {
  const record = await getAuth().getUserByEmail(OWNER_EMAIL);
  return {
    uid: record.uid,
    email: OWNER_EMAIL,
    role: "Admin",
    hd: "pmikcmetro.com",
  } as AuthenticatedUser;
}

function echo(label: string, value: unknown): void {
  console.log(`${label}: ${JSON.stringify(value)}`);
}

function accountRef(): string {
  const baseUrl = process.env.RENTVINE_API_BASE_URL?.trim();
  if (!baseUrl) throw new Error("RENTVINE_API_BASE_URL is not configured.");
  return `rentvine:${rentVineAccountCode(baseUrl)}`;
}

function syncAction(input: {
  ticketRef: string;
  workOrderId: string;
  page: number;
  attempt: number;
}): ExternalActionPreparationInput {
  return {
    workflowId: `maintenance:${input.ticketRef}`,
    // A failed or ambiguous attempt consumed its deterministic id; a later deliberate sync of the
    // same page runs under the next attempt suffix and relies on exact deduplication.
    actionId:
      input.attempt === 0
        ? `work-order-chat-sync:${input.ticketRef}:p${input.page}`
        : `work-order-chat-sync:${input.ticketRef}:p${input.page}:a${input.attempt}`,
    actionKey: WORK_ORDER_CHAT_SYNC_KEY,
    dataMode: "live",
    values: {
      ticket_ref: input.ticketRef,
      work_order_id: input.workOrderId,
      page: String(input.page),
      page_size: "20",
      marks_read_for_managers: true,
    },
    sourceRefs: [`ticket:${input.ticketRef}`, `rentvine:work-order:${input.workOrderId}`],
    contractRef: CHAT_CONTRACT_REF,
    connectionRef: CHAT_CONNECTION_REF,
    mappingRef: CHAT_MAPPING_REF,
  };
}

async function boundWorkOrderId(
  actor: AuthenticatedUser,
  ticketId: string,
): Promise<string> {
  const link = await getMaintenanceWorkOrderLink(actor, ticketId);
  if (!link?.provider_work_order_id || link.state !== "succeeded") {
    throw new Error("The ticket has no receipted RentVine work-order binding.");
  }
  return link.provider_work_order_id;
}

async function freshResident(actor: AuthenticatedUser, messageId: number) {
  const clients = buildChatSyncClients();
  if (!clients) throw new Error("RentVine credentials are not configured.");
  const stored = await getWorkOrderChatMessage(actor, accountRef(), messageId);
  if (!stored || stored.role !== "tenant" || stored.contact_id === null) {
    throw new Error("Only a synchronized resident-origin message can seed the draft.");
  }
  if (stored.mapping_state !== "resident_bound") {
    throw new Error("The message still needs resident mapping.");
  }
  const detail = await clients.workOrders.getWorkOrder(Number(stored.work_order_id));
  const leaseId = detail.workOrder.leaseId;
  if (leaseId === null) throw new Error("The work order no longer binds a lease.");
  const leaseResponse = await clients.leases.getLeaseWithTenants(leaseId);
  const match = resolveResidentFromLeaseTenants(leaseResponse, stored.contact_id);
  if (!match?.email) {
    throw new Error("The authoritative source did not resolve one verified email.");
  }
  return { stored, leaseId, match };
}

async function buildDraftAction(actor: AuthenticatedUser, packet: ProofPacket) {
  if (
    !packet.draftMessageId ||
    !packet.draftSubject?.trim() ||
    !packet.draftBody?.trim()
  ) {
    throw new Error(
      "The packet must supply draftMessageId, draftSubject, and draftBody.",
    );
  }
  if (/[\r\n]/.test(packet.draftSubject)) {
    throw new Error("The subject may not contain line breaks.");
  }
  const { stored, leaseId, match } = await freshResident(actor, packet.draftMessageId);
  return buildResidentReplyDraftAction({
    ticketRef: stored.ticket_ref,
    messageRef: `${accountRef()}:${stored.message_id}`,
    recipient: {
      to: match.email!,
      sourceRef: `rentvine:lease:${leaseId}:lease-tenant:${match.leaseTenantId}:v${match.sourceVersion.slice(0, 16)}`,
    },
    mailbox: { email: actor.email, sourceRef: `app:session:${actor.uid}` },
    subject: packet.draftSubject,
    body: packet.draftBody,
  });
}

async function main(): Promise<void> {
  const op = process.argv[2];
  if (!op) {
    throw new Error(
      "Usage: prove-s100-chat-sync.ts <preview|confirm|thread|rerun|draft-preview|draft-confirm|draft-reconcile>",
    );
  }
  const descriptor = requireEnvironmentDescriptor();
  // getAdminFirestore initializes the default Firebase app; getAuth inside ownerActor needs it.
  const db = getAdminFirestore();
  const actor = await ownerActor();

  if (op === "preview") {
    await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_CHAT_SYNC_KEY);
    const packet = loadPacket();
    const workOrderId = await boundWorkOrderId(actor, packet.ticketId);
    const action = syncAction({
      ticketRef: packet.ticketId,
      workOrderId,
      page: packet.page ?? 1,
      attempt: Number(argValue("attempt", "0")),
    });
    const record = await workOrderS20.prepare(actor, {
      action,
      definition: workOrderDefinition(WORK_ORDER_CHAT_SYNC_KEY),
      trustedContext: buildTrustedContext(action),
      validate: (input) =>
        new RentVineWorkOrderChatSyncExecutor({
          clients: () => {
            throw new Error("Preparation never constructs a provider client.");
          },
          accountRef: accountRef(),
          commit: async () => {},
        }).validate(input),
    });
    await savePreparedWorkOrderAction(
      actor,
      {
        execution_id: record.id,
        ticket_ref: packet.ticketId,
        action: {
          workflowId: action.workflowId,
          actionId: action.actionId,
          actionKey: WORK_ORDER_CHAT_SYNC_KEY,
          dataMode: "live",
          values: { ...action.values },
          sourceRefs: [...action.sourceRefs],
          contractRef: action.contractRef!,
          connectionRef: action.connectionRef!,
          mappingRef: action.mappingRef!,
        },
        prepared_by_uid: actor.uid,
      },
      db,
    );
    echo("execution", record.id);
    echo("preview-hash", record.preview_hash);
    echo("preview", action.values);
    echo("warning", "RentVine will mark retrieved messages as read for managers.");
    return;
  }

  if (op === "confirm") {
    await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_CHAT_SYNC_KEY);
    const executionId = argValue("execution", "");
    const previewHash = argValue("hash", "");
    if (!executionId || !previewHash) {
      throw new Error(
        "confirm requires --execution=... and --hash=... from the preview.",
      );
    }
    const prepared = await loadPreparedWorkOrderAction(actor, executionId, db);
    if (!prepared || prepared.action.actionKey !== WORK_ORDER_CHAT_SYNC_KEY) {
      throw new Error("No prepared sync matches this id.");
    }
    const clients = buildChatSyncClients();
    if (!clients) throw new Error("RentVine credentials are not configured.");
    const action = preparedActionInput(prepared);
    if (executionId !== expectedExternalS20ExecutionId(action)) {
      throw new Error("The execution id does not match the prepared sync.");
    }
    let counts: ChatSyncCounts | null = null;
    let nextPage: number | null = null;
    const executor = new RentVineWorkOrderChatSyncExecutor({
      clients: () => clients,
      accountRef: accountRef(),
      commit: async (input) => {
        counts = await commitChatSyncPage(
          actor,
          {
            accountRef: accountRef(),
            ticketRef: String(action.values.ticket_ref),
            workOrderId: String(action.values.work_order_id),
            syncAttemptRef: executionId,
            dispositions: input.dispositions,
            residentBindings: input.residentBindings,
            nowMs: Date.now(),
          },
          db,
        );
        nextPage = input.pagination.nextPage;
      },
    });
    const outcome = await workOrderS20.execute(actor, {
      action,
      confirmedPreviewHash: previewHash,
      definition: workOrderDefinition(WORK_ORDER_CHAT_SYNC_KEY),
      executionId,
      executor,
      trustedContext: buildTrustedContext(action),
    });
    echo("execution-state", outcome.execution.state);
    echo("counts", counts);
    echo("next-page", nextPage);
    echo("receipt-provider-ref", outcome.result?.providerRef ?? null);
    echo("receipt-result-hash", outcome.result?.resultHash ?? null);
    echo(
      "read-marker-note",
      "RentVine may have marked the retrieved messages read for managers; that state has no rollback.",
    );
    return;
  }

  if (op === "thread") {
    const packet = loadPacket();
    const records = await listWorkOrderChatRecords(actor, packet.ticketId, db);
    echo(
      "records",
      records.map((record) =>
        record.lane === "message"
          ? {
              lane: record.lane,
              id: record.message_id,
              role: record.role,
              at: record.created_at_iso,
              mapping: record.mapping_state,
              truncated: record.truncated,
              bodyUnits: record.body.length,
              hash16: record.payload_hash.slice(0, 16),
              attachments: record.attachments.length,
            }
          : {
              lane: record.lane,
              id: record.message_id,
              reason: record.reason,
              hash16: record.payload_hash.slice(0, 16),
            },
      ),
    );
    return;
  }

  if (op === "rerun") {
    await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_READ_KEY);
    const messageId = Number(argValue("message", "0"));
    if (!Number.isSafeInteger(messageId) || messageId <= 0) {
      throw new Error("rerun requires --message=<positive id>.");
    }
    const clients = buildChatSyncClients();
    if (!clients) throw new Error("RentVine credentials are not configured.");
    const stored = await getWorkOrderChatMessage(actor, accountRef(), messageId, db);
    if (!stored || stored.role !== "tenant" || stored.contact_id === null) {
      throw new Error("No stored tenant-role message matches.");
    }
    const detail = await clients.workOrders.getWorkOrder(Number(stored.work_order_id));
    const leaseId = detail.workOrder.leaseId;
    let binding = null;
    if (leaseId !== null) {
      const leaseResponse = await clients.leases.getLeaseWithTenants(leaseId);
      const match = resolveResidentFromLeaseTenants(leaseResponse, stored.contact_id);
      binding = match
        ? {
            contactId: stored.contact_id,
            leaseId,
            leaseTenantId: match.leaseTenantId,
            sourceVersion: match.sourceVersion,
          }
        : null;
    }
    const state = await applyRerunResidentBinding(
      actor,
      { accountRef: accountRef(), messageId, binding },
      db,
    );
    echo("mapping-state", state);
    return;
  }

  if (op === "draft-preview" || op === "draft-confirm" || op === "draft-reconcile") {
    const packet = loadPacket();
    const action = await buildDraftAction(actor, packet);
    const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get(
      RESIDENT_REPLY_DRAFT_KEY,
    )!;
    const requestShape = {
      action,
      definition,
      createClient: () =>
        createDescriptorBoundGmailRuntimeClient(actor.email, descriptor),
    };
    if (op === "draft-preview") {
      const prepared = await prepareGovernedDraft(actor, requestShape);
      echo("execution", prepared.id);
      echo("preview-hash", prepared.preview_hash);
      echo("from", action.values.from);
      echo("to", action.values.to);
      echo("subject", action.values.subject);
      echo("recipient-source-ref", action.values.recipient_source_ref);
      echo("body-units", String(action.values.body).length);
      return;
    }
    if (op === "draft-confirm") {
      const executionId = argValue("execution", "");
      const previewHash = argValue("hash", "");
      if (!executionId || !previewHash) {
        throw new Error(
          "draft-confirm requires --execution=... and --hash=... from the preview.",
        );
      }
      const outcome = await executeGovernedDraft(actor, {
        ...requestShape,
        executionId,
        previewHash,
      });
      echo("execution-state", outcome.execution.state);
      echo("draft-id", outcome.result?.providerRef ?? null);
      return;
    }
    const executionId = argValue("execution", "");
    if (!executionId) throw new Error("draft-reconcile requires --execution=...");
    const outcome = await reconcileGovernedDraft(actor, {
      ...requestShape,
      executionId,
    });
    echo("reconcile-status", outcome.status);
    echo(
      "draft-id",
      "receipt" in outcome && outcome.receipt ? outcome.receipt.providerRef : null,
    );
    return;
  }

  throw new Error(`Unknown operation ${op}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
