import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import type {
  HealthCheckContract,
  HealthCheckStep,
  HealthCheckTransport,
} from "@/lib/integrations/health-checks";
import { validatePreviewPayload } from "@/lib/integrations/preview-payload";

/**
 * Test-only mock connector layer. Simulates the documented maintenance work-order chain
 * (intake -> Rentvine work order -> LeadSimple orchestration -> status sync -> QuickBooks
 * bill draft -> Sheets audit row) entirely in memory. Every mock write validates its
 * payload against the matching Action Registry entry's `preview_payload_schema`, which is
 * what makes the structured schemas load-bearing. No network, no SDKs, no external state.
 */

export function createMockHealthCheckTransport(
  script: { failStepIds?: string[]; detail?: string } = {},
): HealthCheckTransport {
  const failStepIds = new Set(script.failStepIds ?? []);

  return {
    async probe(_contract: HealthCheckContract, step: HealthCheckStep) {
      if (failStepIds.has(step.id)) {
        return { ok: false, detail: script.detail ?? `mock failure at ${step.id}` };
      }

      return { ok: true, detail: "mock pass" };
    },
  };
}

export interface MockConnectorEvent {
  system: string;
  action: string;
  payload: unknown;
}

export interface MockWorkOrder {
  id: string;
  status: string;
  payload: Record<string, unknown>;
}

export interface MockMaintenanceChain {
  rentvine: {
    createWorkOrder(payload: Record<string, unknown>): MockWorkOrder;
    updateStatus(id: string, targetStatus: string): void;
    getWorkOrder(id: string): MockWorkOrder | undefined;
  };
  leadsimple: {
    startProcess(workOrderId: string): { processId: string; stage: string };
    advanceStage(processId: string, targetStage: string): void;
  };
  quickbooks: {
    createBillDraft(payload: Record<string, unknown>): { billId: string };
  };
  sheets: {
    appendAuditRow(payload: Record<string, unknown>): void;
  };
  events: MockConnectorEvent[];
}

// LeadSimple stage -> Rentvine work-order status, mirroring the documented
// stage-to-status mapping in the maintenance chain.
const STAGE_TO_STATUS: Record<string, string> = {
  Scheduled: "Scheduled",
  "In Progress": "In Progress",
  Completed: "Completed",
};

function previewSchemaFor(key: string) {
  const entry = ACTION_REGISTRY_SEED.find((candidate) => candidate.key === key);

  if (!entry?.preview_payload_schema) {
    throw new Error(`Seed entry ${key} is missing a preview_payload_schema.`);
  }

  return entry.preview_payload_schema.map((field) => ({
    required: false,
    ...field,
  }));
}

function assertValidPayload(key: string, payload: Record<string, unknown>) {
  const result = validatePreviewPayload(previewSchemaFor(key), payload);

  if (!result.ok) {
    throw new Error(`Invalid ${key} payload: ${result.errors.join(" ")}`);
  }
}

export function createMockMaintenanceChain(): MockMaintenanceChain {
  const workOrders = new Map<string, MockWorkOrder>();
  const processes = new Map<string, { workOrderId: string; stage: string }>();
  const events: MockConnectorEvent[] = [];
  let workOrderCount = 0;
  let processCount = 0;
  let billCount = 0;

  return {
    rentvine: {
      createWorkOrder(payload) {
        assertValidPayload("rentvine.work_order.create", payload);
        workOrderCount += 1;
        const workOrder: MockWorkOrder = {
          id: `wo-${workOrderCount}`,
          status: "Open",
          payload,
        };
        workOrders.set(workOrder.id, workOrder);
        events.push({ system: "Rentvine", action: "work_order.create", payload });
        return workOrder;
      },
      updateStatus(id, targetStatus) {
        const workOrder = workOrders.get(id);

        if (!workOrder) {
          throw new Error(`Unknown mock work order ${id}.`);
        }

        assertValidPayload("rentvine.work_order.update_status", {
          work_order_id: id,
          current_status: workOrder.status,
          target_status: targetStatus,
        });
        workOrder.status = targetStatus;
        events.push({
          system: "Rentvine",
          action: "work_order.update_status",
          payload: { work_order_id: id, target_status: targetStatus },
        });
      },
      getWorkOrder(id) {
        return workOrders.get(id);
      },
    },
    leadsimple: {
      startProcess(workOrderId) {
        if (!workOrders.has(workOrderId)) {
          throw new Error(`Unknown mock work order ${workOrderId}.`);
        }

        processCount += 1;
        const processId = `proc-${processCount}`;
        processes.set(processId, { workOrderId, stage: "Scheduled" });
        events.push({
          system: "LeadSimple",
          action: "process.start",
          payload: { process_id: processId, work_order_id: workOrderId },
        });
        return { processId, stage: "Scheduled" };
      },
      advanceStage(processId, targetStage) {
        const process = processes.get(processId);

        if (!process) {
          throw new Error(`Unknown mock process ${processId}.`);
        }

        assertValidPayload("leadsimple.process.update_stage", {
          process_id: processId,
          current_stage: process.stage,
          target_stage: targetStage,
        });
        process.stage = targetStage;
        events.push({
          system: "LeadSimple",
          action: "process.update_stage",
          payload: { process_id: processId, target_stage: targetStage },
        });

        // The documented LeadSimple sync maps the stage back into the Rentvine
        // work-order status.
        const syncedStatus = STAGE_TO_STATUS[targetStage];

        if (syncedStatus) {
          const workOrder = workOrders.get(process.workOrderId);

          if (workOrder) {
            workOrder.status = syncedStatus;
            events.push({
              system: "Rentvine",
              action: "work_order.status_synced",
              payload: { work_order_id: workOrder.id, status: syncedStatus },
            });
          }
        }
      },
    },
    quickbooks: {
      createBillDraft(payload) {
        assertValidPayload("quickbooks.bill.create_draft", payload);
        billCount += 1;
        events.push({ system: "QuickBooks", action: "bill.create_draft", payload });
        return { billId: `bill-${billCount}` };
      },
    },
    sheets: {
      appendAuditRow(payload) {
        assertValidPayload("google_sheets.audit_snapshot.append", payload);
        events.push({
          system: "Google Sheets",
          action: "audit_snapshot.append",
          payload,
        });
      },
    },
    events,
  };
}
