import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import { queueActionAvailability } from "@/lib/approval/queue";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  prepareActionExecution,
  type TrustedExecutionContext,
} from "@/lib/execution/service";
import {
  claimActionExecution,
  getActionExecution,
} from "@/lib/firestore/action-executions";
import {
  listApprovalQueue,
  transitionApprovalQueueItem,
} from "@/lib/firestore/approval-queue";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const editor: AuthenticatedUser = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "editor-1",
};
const approver: AuthenticatedUser = {
  email: "approver@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Approver",
  uid: "approver-1",
};
const admin: AuthenticatedUser = {
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "admin-1",
};
const preview = {
  description: "Fixture-only repair",
  expected_status: "New",
  priority: "Normal",
  property_unit: "fixture-property",
  vendor_trade: "fixture-vendor",
};
const trustedContext: TrustedExecutionContext = {
  connectionReady: true,
  endpointDocumented: true,
  permissionGranted: true,
  roleScopeAuthorized: true,
  sourceValidated: true,
};
let db: Firestore;

beforeEach(() => {
  db = new FakeFirestore() as unknown as Firestore;
});

describe("S20 execution-linked Approval Queue", () => {
  it("routes High work to Admin and atomically approves the exact ledger preview", async () => {
    const execution = await prepareHighExecution("approve", db);
    const [item] = await listApprovalQueue(admin, {}, db);

    expect(item).toMatchObject({
      action_execution_id: execution.id,
      action_execution_preview_hash: execution.preview_hash,
      affected_system_action: "rentvine.work_order.create",
      risk: "High",
      status: "Ready for Approval",
    });
    expect(queueActionAvailability(approver, item)).toMatchObject({
      approve: false,
      approveReason: expect.stringMatching(/Admin role/i),
    });

    await expect(
      transitionApprovalQueueItem(
        admin,
        item.id,
        { action: "approve", confirm_high_risk: true },
        db,
      ),
    ).rejects.toThrow(/reason/i);
    await expect(getActionExecution(admin, execution.id, db)).resolves.toMatchObject({
      state: "Awaiting Admin",
    });

    const approvedQueue = await transitionApprovalQueueItem(
      admin,
      item.id,
      {
        action: "approve",
        confirm_high_risk: true,
        reason: "The exact fixture preview matches the documented source values.",
      },
      db,
    );
    expect(approvedQueue.status).toBe("Approved");
    await expect(getActionExecution(admin, execution.id, db)).resolves.toMatchObject({
      approval: {
        approvedByUid: admin.uid,
        previewHash: execution.preview_hash,
      },
      state: "Approved",
    });
    await expect(
      claimActionExecution(editor, execution.id, execution.preview_hash, db),
    ).resolves.toMatchObject({ attempt_count: 1, state: "Executing" });
  });

  it("returns the queue item and linked execution together", async () => {
    const execution = await prepareHighExecution("return", db);
    const [item] = await listApprovalQueue(admin, {}, db);

    const returned = await transitionApprovalQueueItem(
      admin,
      item.id,
      { action: "return", reason: "Correct the fixture source value." },
      db,
    );
    expect(returned.status).toBe("Returned");
    await expect(getActionExecution(admin, execution.id, db)).resolves.toMatchObject({
      state: "Returned",
    });
  });
});

async function prepareHighExecution(suffix: string, targetDb: Firestore) {
  return prepareActionExecution(
    editor,
    {
      actionKey: "rentvine.work_order.create",
      approvalQueue: {
        directLink: "/maintenance/fixture-ticket",
        processRunRef: { id: `fixture-${suffix}`, label: "Fixture maintenance" },
        requiredAdminUid: admin.uid,
      },
      idempotencyKey: `fixture-high-${suffix}`,
      preview,
      trustedContext,
    },
    { db: targetDb, registry: openRegistryAction("rentvine.work_order.create") },
  );
}

function openRegistryAction(key: string): CreateActionRegistryInput[] {
  return ACTION_REGISTRY_SEED.map((entry) =>
    entry.key === key
      ? {
          ...entry,
          documented_evidence: "Fixture-only documented adapter contract.",
          evidence_status: "Documented" as const,
          production_allowed: true,
          readiness: "Approved for Execution" as const,
        }
      : entry,
  );
}
