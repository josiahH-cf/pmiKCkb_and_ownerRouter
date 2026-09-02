// S100 governed chat sync: one manually confirmed consequential page read of one server-bound
// Work Order chat, committed atomically with deduplication, quarantine, and transactional
// resident auto-binding. The confirmed dispatch is the only provider call path; a refusal before
// HTTP dispatch is a definite no-effect failure, and any failure after dispatch is ambiguous
// because the provider may already have marked messages read for managers. Reconciliation is
// deliberately absent: no passive provider verification exists that is not itself another
// consequential read, so recovery is a new deliberate sync relying on exact deduplication.

import { RentVineClient, createFetchTransport } from "@/lib/integrations/rentvine/client";
import { RentVineWorkOrderChatReader } from "@/lib/integrations/rentvine/chat-client";
import {
  decodeChatRow,
  resolveResidentFromLeaseTenants,
  type ChatPagination,
  type ChatRowDisposition,
} from "@/lib/integrations/rentvine/chat-contract";
import { RentVineWorkOrderReader } from "@/lib/integrations/rentvine/work-order-client";
import {
  ExternalExecutionError,
  type ExternalActionInput,
  type ExternalActionReceipt,
  type ExternalExecutor,
} from "@/lib/external-execution/types";
import type { ResidentBinding } from "@/lib/firestore/rentvine-work-order-chat-messages";
import { createHash } from "node:crypto";

export const WORK_ORDER_CHAT_SYNC_KEY = "rentvine.work_order.chat.sync";
export const RESIDENT_REPLY_DRAFT_KEY = "gmail.maintenance_resident_reply.draft_create";

export interface ChatSyncClients {
  chat: Pick<RentVineWorkOrderChatReader, "listWorkOrderChatPage">;
  workOrders: Pick<RentVineWorkOrderReader, "getWorkOrder">;
  leases: Pick<RentVineClient, "getLeaseWithTenants">;
}

/** Lazy live clients for the sync path; a closed key never constructs them. */
export function buildChatSyncClients(): ChatSyncClients | null {
  const baseUrl = process.env.RENTVINE_API_BASE_URL?.trim();
  const apiKey = process.env.RENTVINE_API_KEY?.trim();
  const apiSecret = process.env.RENTVINE_API_SECRET?.trim();
  if (!baseUrl || !apiKey || !apiSecret) return null;
  const config = { baseUrl, apiKey, apiSecret };
  const transport = createFetchTransport({ timeoutMs: 30_000 });
  return {
    chat: new RentVineWorkOrderChatReader(config, transport),
    workOrders: new RentVineWorkOrderReader(config, transport),
    leases: new RentVineClient(config, transport),
  };
}

export interface ChatSyncCommitInput {
  dispositions: ChatRowDisposition[];
  residentBindings: Map<number, ResidentBinding>;
  pagination: ChatPagination;
}

export interface ChatSyncExecutorDeps {
  clients: () => ChatSyncClients;
  accountRef: string;
  /** Route-owned atomic local commit; captures counts for the response. */
  commit: (input: ChatSyncCommitInput) => Promise<void>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function ambiguous(message: string): never {
  throw new ExternalExecutionError(message, "ambiguous");
}

/**
 * The S20 executor for the exact chat-sync key. Validation is provider-free; execute performs
 * the ONE confirmed page dispatch, then treats every later failure as ambiguous because the
 * provider read-marker may already have fired.
 */
export class RentVineWorkOrderChatSyncExecutor implements ExternalExecutor {
  constructor(private readonly deps: ChatSyncExecutorDeps) {}

  validate(input: ExternalActionInput) {
    if (input.actionKey !== WORK_ORDER_CHAT_SYNC_KEY) {
      return "Chat-sync executor received the wrong action key.";
    }
    const values = input.values;
    if (typeof values.ticket_ref !== "string" || !values.ticket_ref.trim()) {
      return "Authoritative ticket_ref is required.";
    }
    if (
      typeof values.work_order_id !== "string" ||
      !/^[1-9][0-9]*$/.test(values.work_order_id)
    ) {
      return "Authoritative work_order_id must be a canonical positive decimal string.";
    }
    if (typeof values.page !== "string" || !/^[1-9][0-9]*$/.test(values.page)) {
      return "The confirmed page must be a canonical positive decimal string.";
    }
    if (values.page_size !== "20") {
      return 'Preview field page_size must be the exact literal "20".';
    }
    if (values.marks_read_for_managers !== true) {
      return "The preview must acknowledge the irreversible manager read marker.";
    }
    return null;
  }

  async execute(input: ExternalActionInput): Promise<ExternalActionReceipt> {
    const blocker = this.validate(input);
    if (blocker) throw new ExternalExecutionError(blocker, "blocked");
    const clients = this.deps.clients();
    const workOrderId = Number(input.values.work_order_id);
    const page = Number(input.values.page);

    // THE consequential dispatch. Everything below this call is post-dispatch.
    const read = await clients.chat.listWorkOrderChatPage(workOrderId, page);

    let dispositions: ChatRowDisposition[] = [];
    const residentBindings = new Map<number, ResidentBinding>();
    try {
      dispositions = read.rows.map((row) =>
        decodeChatRow(row, { accountRef: this.deps.accountRef, workOrderId }),
      );
      const tenantContactIds = [
        ...new Set(
          dispositions
            .filter(
              (entry): entry is Extract<ChatRowDisposition, { kind: "message" }> =>
                entry.kind === "message" && entry.role === "tenant",
            )
            .map((entry) => entry.contactId)
            .filter((id): id is number => id !== null),
        ),
      ];
      if (tenantContactIds.length > 0) {
        // Fresh authoritative relation, read once inside the same claimed sync.
        const detail = await clients.workOrders.getWorkOrder(workOrderId);
        const leaseId = detail.workOrder.leaseId;
        if (leaseId !== null) {
          const leaseResponse = await clients.leases.getLeaseWithTenants(leaseId);
          for (const contactId of tenantContactIds) {
            const match = resolveResidentFromLeaseTenants(leaseResponse, contactId);
            if (match) {
              residentBindings.set(contactId, {
                contactId,
                leaseId,
                leaseTenantId: match.leaseTenantId,
                sourceVersion: match.sourceVersion,
              });
            }
          }
        }
      }
      await this.deps.commit({
        dispositions,
        residentBindings,
        pagination: read.pagination,
      });
    } catch (error) {
      ambiguous(
        `The provider read dispatched but the local commit did not complete; messages may already be marked read. (${
          error instanceof Error ? error.name : "unknown"
        })`,
      );
    }

    const providerRef = `chat:${workOrderId}:page:${page}`;
    return {
      actionKey: input.actionKey,
      providerRef,
      resultHash: sha256(
        JSON.stringify({
          accountRef: this.deps.accountRef,
          workOrderId,
          page,
          pagination: read.pagination,
          rowHashes: dispositions.map((entry) =>
            entry.kind === "rejected" ? entry.reason : entry.payloadHash,
          ),
        }),
      ),
      reconciled: false,
      outcome: "succeeded",
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * No passive verification exists: any provider read is itself another consequential
   * read-marker event, so reconciliation never contacts the provider and never resolves the
   * ambiguity. A later deliberate sync under a new confirmation is the only recovery.
   */
  async reconcile(): Promise<ExternalActionReceipt | null> {
    return null;
  }
}
