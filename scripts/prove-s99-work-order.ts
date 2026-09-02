// S99 per-key live proof runner (owner-authorized bounded proof windows). Mirrors the S97/S98
// runners: local ADC, the deployed S99 service modules, the real S20 ledger, and the official
// account operations, with every exact value echoed. The committed per-key gates stay
// authoritative — each operation refuses unless its exact key is inside an open proof window.
// The packet arrives untracked (temp/) and is never committed; no provider body, credential, or
// customer value is printed beyond the exact ids and receipts the proof must echo.
//
// Owner-approved proof shape (2026-09-02): synthesize one clearly labeled TEST work order on
// property 84 (create key), read it back through the bounded exact reads (read key), then cancel
// it through the unique live system `Cancelled` status (update_status key) as its intended final
// state — which is also the TEST cleanup.
//
// Usage (always with explicit production context):
//   ENVIRONMENT_KIND=production DATA_CONTEXT=live GOOGLE_CLOUD_PROJECT=pmi-kc-kb-prod \
//     npx tsx scripts/prove-s99-work-order.ts <read|propose-create|approve|execute|reconcile|\
//     propose-cancel|link> [--packet=temp/s99-proof-packet.json] [--execution=...]

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
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  approveActionExecution,
  getActionExecution,
} from "@/lib/firestore/action-executions";
import {
  claimMaintenanceWorkOrderLink,
  getMaintenanceWorkOrderLink,
  projectMaintenanceWorkOrderOutcome,
} from "@/lib/firestore/maintenance-work-order-links";
import {
  loadPreparedWorkOrderAction,
  preparedActionInput,
  savePreparedWorkOrderAction,
} from "@/lib/firestore/maintenance-work-order-prepared-actions";
import { getMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import {
  WORK_ORDER_CREATE_KEY,
  WORK_ORDER_READ_KEY,
  WORK_ORDER_STATUS_KEY,
  assembleWorkOrderCreateAction,
  assembleWorkOrderStatusAction,
  assertWorkOrderActionAllowed,
  buildTrustedContext,
  buildWorkOrderClients,
  runWorkOrderRead,
  workOrderDefinition,
  workOrderExecutor,
  workOrderS20,
} from "@/lib/maintenance/execution/work-order-service";

const OWNER_EMAIL = "josiah@pmikcmetro.com";

interface ProofPacket {
  /** The persisted Live TEST app ticket the create proof consumes. */
  ticketId: string;
  /** Explicit staff-confirmed create selections (fresh catalogs revalidate them). */
  priorityId: "1" | "2" | "3";
  workOrderStatusId: string;
  isVacant: boolean;
  vendorTradeId?: string;
  /** For the read proof: the exact provider id once created. */
  workOrderId?: string;
  /** For the cancel proof: the unique live system `Cancelled` status id, staff-verified. */
  cancelledStatusId?: string;
}

function argValue(name: string, fallback: string): string {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}

function loadPacket(): ProofPacket {
  const path = argValue("packet", "temp/s99-proof-packet.json");
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

async function main(): Promise<void> {
  const op = process.argv[2];
  if (!op) {
    throw new Error(
      "Usage: prove-s99-work-order.ts <read|propose-create|approve|execute|reconcile|propose-cancel|link>",
    );
  }
  const descriptor = requireEnvironmentDescriptor();
  // getAdminFirestore initializes the default Firebase app; getAuth inside ownerActor needs it.
  const db = getAdminFirestore();
  const actor = await ownerActor();
  const clients = buildWorkOrderClients();
  if (!clients) throw new Error("RentVine work-order credentials are not configured.");

  if (op === "read") {
    await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_READ_KEY);
    const packet = loadPacket();
    if (packet.workOrderId) {
      const result = await runWorkOrderRead(clients, {
        kind: "detail",
        workOrderId: Number(packet.workOrderId),
      });
      echo("detail", result.detail);
    } else {
      const ticket = await getMaintenanceTicket(actor, packet.ticketId, db);
      if (!ticket) throw new Error(`Unknown ticket ${packet.ticketId}.`);
      const result = await runWorkOrderRead(clients, { kind: "ticket", ticket });
      echo("filters", result.filters);
      echo("pages", result.list?.pages);
      echo("complete", result.list?.complete);
      echo(
        "rows",
        result.list?.rows.map((row) => ({
          id: row.workOrderId,
          number: row.workOrderNumber,
          status: row.workOrderStatusId,
          shared: `${row.isSharedWithTenant}/${row.isSharedWithOwner}`,
        })),
      );
    }
    const statuses = await clients.reader.listWorkOrderStatuses();
    echo(
      "status-catalog",
      statuses.map((entry) => ({
        id: entry.workOrderStatusId,
        name: entry.name,
        primary: entry.primaryWorkOrderStatusId,
        system: entry.isSystemStatus,
      })),
    );
    const cancelled = statuses.filter(
      (entry) => entry.isSystemStatus === "1" && entry.name === "Cancelled",
    );
    echo("unique-live-cancelled", cancelled);
    return;
  }

  if (op === "propose-create") {
    await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_READ_KEY);
    const packet = loadPacket();
    const ticket = await getMaintenanceTicket(actor, packet.ticketId, db);
    if (!ticket) throw new Error(`Unknown ticket ${packet.ticketId}.`);
    const existing = await getMaintenanceWorkOrderLink(actor, ticket.id, db);
    if (existing && existing.state !== "failed") {
      throw new Error(`Ticket already has a live create attempt (${existing.state}).`);
    }
    const assembled = await assembleWorkOrderCreateAction(
      clients,
      ticket,
      {
        priorityId: packet.priorityId,
        workOrderStatusId: packet.workOrderStatusId,
        isVacant: packet.isVacant,
        ...(packet.vendorTradeId !== undefined
          ? { vendorTradeId: packet.vendorTradeId }
          : {}),
      },
      existing ? existing.attempt_seq + 1 : 0,
    );
    const record = await workOrderS20.prepare(actor, {
      action: assembled.action,
      approvalQueue: {
        directLink: `/maintenance?ticket_id=${encodeURIComponent(ticket.id)}`,
        processRunRef: { id: assembled.action.workflowId, label: "S99 proof create" },
        requiredAdminUid: actor.uid,
      },
      definition: workOrderDefinition(WORK_ORDER_CREATE_KEY),
      trustedContext: assembled.trustedContext,
      validate: (input) => workOrderExecutor(() => clients).validate(input),
    });
    await savePreparedWorkOrderAction(actor, {
      execution_id: record.id,
      ticket_ref: ticket.id,
      action: {
        workflowId: assembled.action.workflowId,
        actionId: assembled.action.actionId,
        actionKey: WORK_ORDER_CREATE_KEY,
        dataMode: "live",
        values: { ...assembled.action.values },
        sourceRefs: [...assembled.action.sourceRefs],
        contractRef: assembled.action.contractRef!,
        connectionRef: assembled.action.connectionRef!,
        mappingRef: assembled.action.mappingRef!,
      },
      prepared_by_uid: actor.uid,
    });
    await claimMaintenanceWorkOrderLink(
      actor,
      {
        ticket_ref: ticket.id,
        action_key: WORK_ORDER_CREATE_KEY,
        execution_id: record.id,
        state: "pending",
        created_by_uid: actor.uid,
        attempt_seq: existing ? existing.attempt_seq + 1 : 0,
      },
      db,
    );
    echo("execution-id", record.id);
    echo("state", record.state);
    echo("preview", assembled.action.values);
    echo("status", { name: assembled.statusName, group: assembled.statusGroup });
    return;
  }

  if (op === "propose-cancel") {
    await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_READ_KEY);
    const packet = loadPacket();
    if (!packet.workOrderId || !packet.cancelledStatusId) {
      throw new Error("propose-cancel needs workOrderId and cancelledStatusId.");
    }
    // The cancellation target must be the unique live system catalog entry named Cancelled.
    const statuses = await clients.reader.listWorkOrderStatuses();
    const cancelled = statuses.filter(
      (entry) => entry.isSystemStatus === "1" && entry.name === "Cancelled",
    );
    if (
      cancelled.length !== 1 ||
      cancelled[0].workOrderStatusId !== packet.cancelledStatusId
    ) {
      throw new Error(
        `The live Cancelled system status is not the unique packet target (found ${JSON.stringify(cancelled)}).`,
      );
    }
    const assembled = await assembleWorkOrderStatusAction(clients, {
      workOrderId: packet.workOrderId,
      targetStatusId: packet.cancelledStatusId,
    });
    const record = await workOrderS20.prepare(actor, {
      action: assembled.action,
      approvalQueue: {
        directLink: "/maintenance",
        processRunRef: { id: assembled.action.workflowId, label: "S99 proof cancel" },
        requiredAdminUid: actor.uid,
      },
      definition: workOrderDefinition(WORK_ORDER_STATUS_KEY),
      trustedContext: assembled.trustedContext,
      validate: (input) => workOrderExecutor(() => clients).validate(input),
    });
    await savePreparedWorkOrderAction(actor, {
      execution_id: record.id,
      ticket_ref: null,
      action: {
        workflowId: assembled.action.workflowId,
        actionId: assembled.action.actionId,
        actionKey: WORK_ORDER_STATUS_KEY,
        dataMode: "live",
        values: { ...assembled.action.values },
        sourceRefs: [...assembled.action.sourceRefs],
        contractRef: assembled.action.contractRef!,
        connectionRef: assembled.action.connectionRef!,
        mappingRef: assembled.action.mappingRef!,
      },
      prepared_by_uid: actor.uid,
    });
    echo("execution-id", record.id);
    echo("state", record.state);
    echo("preview", assembled.action.values);
    echo("before", {
      status: assembled.before.workOrderStatusId,
      shared: `${assembled.before.isSharedWithTenant}/${assembled.before.isSharedWithOwner}`,
    });
    return;
  }

  const executionId = argValue("execution", "");
  if (!executionId) throw new Error(`${op} needs --execution=<id>.`);

  if (op === "approve") {
    const current = await getActionExecution(actor, executionId, db);
    await approveActionExecution(
      actor,
      executionId,
      {
        contextHash: current.context_hash,
        previewHash: current.preview_hash,
        reason: "S99 owner-authorized bounded proof window.",
      },
      db,
    );
    echo("approved", { executionId, previewHash: current.preview_hash });
    return;
  }

  const prepared = await loadPreparedWorkOrderAction(actor, executionId, db);
  if (!prepared) throw new Error(`No prepared action for ${executionId}.`);
  const actionKey = prepared.action.actionKey;
  await assertWorkOrderActionAllowed(descriptor, actionKey);
  const action = preparedActionInput(prepared);
  const definition = workOrderDefinition(actionKey);
  const executor = workOrderExecutor(() => clients);
  const trustedContext = buildTrustedContext(action);

  if (op === "execute") {
    const outcome = await workOrderS20.execute(actor, {
      action,
      definition,
      executionId,
      executor,
      trustedContext,
    });
    echo("execution-state", outcome.execution.state);
    if (outcome.result) {
      echo("receipt", {
        providerRef: outcome.result.providerRef,
        resultHash: outcome.result.resultHash,
        reconciled: outcome.result.reconciled,
      });
    }
    if (prepared.ticket_ref && actionKey === WORK_ORDER_CREATE_KEY) {
      const state =
        outcome.execution.state === "Succeeded"
          ? ("succeeded" as const)
          : outcome.execution.state === "Needs reconciliation"
            ? ("ambiguous" as const)
            : ("failed" as const);
      await projectMaintenanceWorkOrderOutcome(
        actor,
        {
          ticketRef: prepared.ticket_ref,
          executionId,
          state,
          ...(outcome.result
            ? {
                providerWorkOrderId: outcome.result.providerRef,
                receiptResultHash: outcome.result.resultHash,
              }
            : {}),
        },
        db,
      );
      echo("link", await getMaintenanceWorkOrderLink(actor, prepared.ticket_ref, db));
    }
    return;
  }

  if (op === "reconcile") {
    const outcome = await workOrderS20.reconcile(actor, {
      action,
      definition,
      executionId,
      executor,
      trustedContext,
    });
    echo("reconcile-status", outcome.status);
    echo("execution-state", outcome.execution.state);
    if ("receipt" in outcome && outcome.receipt) {
      echo("receipt", {
        providerRef: outcome.receipt.providerRef,
        resultHash: outcome.receipt.resultHash,
        reconciled: outcome.receipt.reconciled,
      });
      // Mirror the route: a reconciled create projects its durable outcome onto the ticket link.
      if (
        action.actionKey === WORK_ORDER_CREATE_KEY &&
        outcome.status === "succeeded" &&
        prepared.ticket_ref
      ) {
        await projectMaintenanceWorkOrderOutcome(
          actor,
          {
            ticketRef: prepared.ticket_ref,
            executionId,
            state: "succeeded",
            providerWorkOrderId: outcome.receipt.providerRef,
            receiptResultHash: outcome.receipt.resultHash,
          },
          db,
        );
        echo("link-projected", outcome.receipt.providerRef);
      }
    }
    return;
  }

  if (op === "link") {
    if (!prepared.ticket_ref) throw new Error("This execution has no ticket link.");
    echo("link", await getMaintenanceWorkOrderLink(actor, prepared.ticket_ref, db));
    return;
  }

  throw new Error(`Unknown operation ${op}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
