import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { DRAFT_BANNER } from "@/lib/constants";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { TrustedExecutionContext } from "@/lib/execution/service";
import {
  executeExternalActionWithS20,
  prepareExternalActionWithS20,
  reconcileExternalActionWithS20,
  type ExternalActionPreparationInput,
  type TrustedExternalExecutionContext,
} from "@/lib/external-execution/s20-bridge";
import type { ExternalActionDefinition } from "@/lib/external-execution/types";
import { getActionExecution } from "@/lib/firestore/action-executions";
import {
  listApprovalQueue,
  transitionApprovalQueueItem,
} from "@/lib/firestore/approval-queue";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { LEASE_EXECUTION_DEFINITION_MAP } from "@/lib/lease-renewal/execution/matrix";
import { MAINTENANCE_EXECUTION_DEFINITION_MAP } from "@/lib/maintenance/execution/matrix";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import { syntheticExternalTechnicalGates } from "@/tests/helpers/external-execution";

const editor: AuthenticatedUser = {
  email: "synthetic-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "synthetic-editor",
};
const admin: AuthenticatedUser = {
  email: "synthetic-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "synthetic-admin",
};
const otherEditor: AuthenticatedUser = {
  email: "synthetic-editor-2@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "synthetic-editor-2",
};
const technicalContext: TrustedExecutionContext = {
  connectionReady: true,
  endpointDocumented: true,
  permissionGranted: true,
  roleScopeAuthorized: true,
  sourceValidated: true,
};
const labelContext: TrustedExecutionContext = {
  ...technicalContext,
  communication: {
    governedLabel: true,
    humanInitiated: true,
    mailboxScopeAuthorized: true,
    reversible: true,
    workflowLinked: true,
  },
};
const sendContext: TrustedExecutionContext = {
  ...technicalContext,
  communication: {
    bulk: false,
    exactConfirmed: true,
    humanInitiated: true,
    mailboxScopeAuthorized: true,
    modelTriggered: false,
    recipientMatchesPreview: true,
    scheduled: false,
    workflowLinked: true,
  },
};
const labelValues = {
  reason: "Synthetic reviewer selected the governed renewal label.",
  rule_ref: "synthetic:rule:renewal-review",
  suggested_label: "PMIKC/Renewal/NeedsReview",
  thread_ref: "synthetic:gmail-thread:renewal-1",
  workflow_context: "synthetic:workflow:renewal-1",
};
const sendValues = {
  body: "Synthetic renewal notice body.",
  from: "synthetic-leasing@pmikcmetro.com",
  mailbox_source_ref: "synthetic:mailbox:leasing",
  recipient_source_ref: "synthetic:rentvine-tenant:1",
  rfc_message_id: "synthetic:rfc-message:renewal-1",
  subject: "Synthetic lease renewal notice",
  template_ref: "synthetic:artifact:renewal-v1",
  to: "synthetic-tenant@example.invalid",
  workflow_context: "synthetic:workflow:renewal-1",
};
const workOrderValues = {
  description: "Synthetic kitchen sink repair.",
  expected_status: "New",
  priority: "Normal",
  property_unit: "synthetic:property-unit:101",
  vendor_trade: "synthetic:vendor-trade:plumbing",
};
const draftValues = {
  workflow_context: "synthetic:workflow:renewal-draft-1",
  template_ref: "tenant-renewal:v1.0",
  from: "synthetic-leasing@pmikcmetro.com",
  to: "synthetic-tenant@example.invalid",
  subject: "Synthetic renewal draft",
  body: `${DRAFT_BANNER}\n\nSynthetic source-backed renewal draft.`,
  recipient_source_ref: "synthetic:rentvine-tenant:1",
  mailbox_source_ref: "synthetic:mailbox:leasing",
  draft_banner_present: true,
};

let fakeDb: FakeFirestore;
let db: Firestore;

beforeEach(() => {
  fakeDb = new FakeFirestore();
  db = fakeDb as unknown as Firestore;
});

describe("S25/S26 external execution to S20 preparation bridge", () => {
  it("rejects Test actions unless the explicit local synthetic harness owns the bridge", async () => {
    const action = externalAction("gmail.label.apply", labelValues, "lane-fence");

    await expect(
      prepareExternalActionWithS20(
        editor,
        {
          action,
          definition: leaseDefinition(action.actionKey),
          trustedContext: trustedExternalContext(action, labelContext),
          validate: () => null,
        },
        { db },
      ),
    ).rejects.toThrow(/accepts Live actions only/i);
    expect(fakeDb.store.size).toBe(0);
  });

  it("makes zero provider or ledger calls for a Test action in the production S20 seam", async () => {
    const action = externalAction("gmail.label.apply", labelValues, "production-lane");
    vi.stubEnv("NODE_ENV", "production");
    try {
      await expect(
        prepareExternalActionWithS20(
          editor,
          {
            action,
            definition: leaseDefinition(action.actionKey),
            trustedContext: trustedExternalContext(action, labelContext),
            validate: () => null,
          },
          { db },
        ),
      ).rejects.toThrow(/production S20 provider bridge accepts Live actions only/i);
      expect(fakeDb.store.size).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("blocks a Registry-closed production action before any ledger or queue write", async () => {
    const action = externalAction("gmail.renewal_notice.send", sendValues, "closed");

    await expect(
      prepareExternalActionWithS20(
        editor,
        {
          action,
          definition: leaseDefinition(action.actionKey),
          trustedContext: trustedExternalContext(action, sendContext),
          validate: () => null,
        },
        { allowSyntheticAliases: true, db },
      ),
    ).rejects.toMatchObject({
      blockers: expect.arrayContaining(["action_not_production_allowed"]),
    });
    expect(fakeDb.store.size).toBe(0);
  });

  it.each([
    {
      actionKey: "gmail.label.apply",
      context: labelContext,
      expectedRisk: "Low",
      values: labelValues,
    },
    {
      actionKey: "gmail.renewal_notice.send",
      context: sendContext,
      expectedRisk: "Medium",
      values: sendValues,
    },
  ] as const)(
    "prepares executable $expectedRisk work as Ready from its exact Registry preview",
    async ({ actionKey, context, expectedRisk, values }) => {
      const action = externalAction(actionKey, values, expectedRisk.toLowerCase());
      const execution = await prepareExternalActionWithS20(
        editor,
        {
          action,
          definition: leaseDefinition(action.actionKey),
          trustedContext: trustedExternalContext(action, context),
          validate: () => null,
        },
        {
          allowSyntheticAliases: true,
          db,
          registry: openRegistryAction(action.actionKey),
        },
      );

      expect(execution).toMatchObject({
        action_key: action.actionKey,
        preview_hash: hashExecutionPreview({ ...action.values }),
        risk: expectedRisk,
        scope_ref: `external-workflow:test:${action.workflowId}`,
        state: "Ready",
      });
      expect(
        Array.from(fakeDb.store.keys()).every(
          (path) =>
            path.startsWith("action_executions/") ||
            path.startsWith("action_execution_activity/"),
        ),
      ).toBe(true);
    },
  );

  it("prepares executable High work as Awaiting Admin and approves the exact preview hash", async () => {
    const action = externalAction("rentvine.work_order.create", workOrderValues, "high");
    const execution = await prepareExternalActionWithS20(
      editor,
      {
        action,
        approvalQueue: {
          directLink: "/maintenance/synthetic-ticket-1",
          processRunRef: {
            id: action.workflowId,
            label: "Synthetic maintenance workflow",
          },
          requiredAdminUid: admin.uid,
        },
        definition: maintenanceDefinition(action.actionKey),
        trustedContext: trustedExternalContext(action, technicalContext),
        validate: () => null,
      },
      {
        allowSyntheticAliases: true,
        db,
        registry: openRegistryAction(action.actionKey),
      },
    );

    const exactPreviewHash = hashExecutionPreview({ ...action.values });
    expect(execution).toMatchObject({
      preview_hash: exactPreviewHash,
      risk: "High",
      state: "Awaiting Admin",
    });

    const [queueItem] = await listApprovalQueue(admin, {}, db);
    expect(queueItem).toMatchObject({
      action_execution_id: execution.id,
      action_execution_context_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      action_execution_preview_hash: exactPreviewHash,
      affected_system_action: action.actionKey,
      risk: "High",
      status: "Ready for Approval",
      action_execution_target: expect.stringContaining(
        "connection=synthetic:connection:provider",
      ),
    });

    await transitionApprovalQueueItem(
      admin,
      queueItem.id,
      {
        action: "approve",
        confirm_high_risk: true,
        reason: "The exact synthetic preview matches the test source aliases.",
      },
      db,
    );
    await expect(getActionExecution(admin, execution.id, db)).resolves.toMatchObject({
      approval: {
        approvedByUid: admin.uid,
        previewHash: exactPreviewHash,
      },
      attempt_count: 0,
      state: "Approved",
    });

    const execute = vi.fn(async () => ({
      actionKey: action.actionKey,
      providerRef: "provider:synthetic-work-order",
      resultHash: "a".repeat(64),
      reconciled: false,
      createdAt: "2026-07-14T00:00:00.000Z",
    }));
    await expect(
      executeExternalActionWithS20(
        admin,
        {
          action,
          definition: maintenanceDefinition(action.actionKey),
          executionId: execution.id,
          executor: { execute, reconcile: vi.fn(async () => null) },
          trustedContext: trustedExternalContext(action, technicalContext),
        },
        {
          allowSyntheticAliases: true,
          db,
          registry: openRegistryAction(action.actionKey),
        },
      ),
    ).resolves.toMatchObject({
      execution: { attempt_count: 1, state: "Succeeded" },
      result: { actionKey: action.actionKey },
    });
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(
      executeExternalActionWithS20(
        admin,
        {
          action,
          definition: maintenanceDefinition(action.actionKey),
          executionId: execution.id,
          executor: { execute, reconcile: vi.fn(async () => null) },
          trustedContext: trustedExternalContext(action, technicalContext),
        },
        {
          allowSyntheticAliases: true,
          db,
          registry: openRegistryAction(action.actionKey),
        },
      ),
    ).rejects.toThrow(/already has an attempt|cannot be retried/i);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects browser-supplied authority before writing the S20 ledger", async () => {
    const action = {
      ...externalAction("gmail.label.apply", labelValues, "authority"),
      authority: {
        actor: { role: "Admin", uid: "browser-claimed-admin" },
        roleScopeAuthorized: true,
      },
    } as unknown as ExternalActionPreparationInput;

    await expect(
      prepareExternalActionWithS20(
        editor,
        {
          action,
          definition: leaseDefinition(action.actionKey),
          trustedContext: trustedExternalContext(action, labelContext),
          validate: () => null,
        },
        {
          allowSyntheticAliases: true,
          db,
          registry: openRegistryAction(action.actionKey),
        },
      ),
    ).rejects.toThrow(/authority.*server-owned.*browser JSON/i);
    expect(fakeDb.store.size).toBe(0);
  });

  it("keeps exact Registry schema and immutable risk policy ahead of caller values", async () => {
    const action = externalAction(
      "gmail.renewal_notice.send",
      { ...sendValues, caller_risk: "Low" },
      "schema",
    );
    const definition = {
      ...leaseDefinition(action.actionKey),
      risk: "Low" as const,
    };

    await expect(
      prepareExternalActionWithS20(
        editor,
        {
          action,
          definition,
          trustedContext: trustedExternalContext(action, sendContext),
          validate: () => null,
        },
        {
          allowSyntheticAliases: true,
          db,
          registry: openRegistryAction(action.actionKey),
        },
      ),
    ).rejects.toMatchObject({ blockers: ["source_validation_failed"] });
    expect(fakeDb.store.size).toBe(0);

    await expect(
      prepareExternalActionWithS20(
        editor,
        {
          action,
          definition: leaseDefinition(action.actionKey),
          trustedContext: trustedExternalContext(action, sendContext),
          validate: () => null,
        },
        {
          allowSyntheticAliases: true,
          db,
          registry: openRegistryAction(action.actionKey),
        },
      ),
    ).rejects.toMatchObject({
      blockers: expect.arrayContaining(["preview_invalid"]),
    });
    expect(fakeDb.store.size).toBe(0);
  });

  it.each([
    ["group", "Caller-defined group"],
    ["correction", "Caller-defined correction"],
    ["requiredContract", "vendor_required"],
    ["dependsOn", []],
  ] as const)(
    "rejects a same-key definition with forged immutable %s before preparation",
    async (field, value) => {
      const action = externalAction(
        "gmail.renewal_notice.send",
        sendValues,
        `forged-${field}`,
      );
      const definition = {
        ...leaseDefinition(action.actionKey),
        [field]: value,
      } as ExternalActionDefinition;

      await expect(
        prepareExternalActionWithS20(
          editor,
          {
            action,
            definition,
            trustedContext: trustedExternalContext(action, sendContext),
            validate: () => null,
          },
          {
            allowSyntheticAliases: true,
            db,
            registry: openRegistryAction(action.actionKey),
          },
        ),
      ).rejects.toMatchObject({ blockers: ["source_validation_failed"] });
      expect(fakeDb.store.size).toBe(0);
    },
  );

  it("cannot remove a canonical dependency with a forged same-key execution definition", async () => {
    const action = externalAction(
      "gmail.renewal_notice.send",
      sendValues,
      "forged-dependency-execution",
    );
    const trustedContext = trustedExternalContext(action, sendContext);
    const options = {
      allowSyntheticAliases: true,
      db,
      registry: openRegistryAction(action.actionKey),
    } as const;
    const execution = await prepareExternalActionWithS20(
      editor,
      {
        action,
        definition: leaseDefinition(action.actionKey),
        trustedContext,
        validate: () => null,
      },
      options,
    );
    const execute = vi.fn(async () => validReceipt(action.actionKey, "must-not-run"));

    await expect(
      executeExternalActionWithS20(
        editor,
        {
          action,
          confirmedPreviewHash: execution.preview_hash,
          definition: {
            ...leaseDefinition(action.actionKey),
            dependsOn: [],
          },
          executionId: execution.id,
          executor: { execute, reconcile: vi.fn(async () => null) },
          trustedContext,
        },
        options,
      ),
    ).rejects.toMatchObject({ blockers: ["source_validation_failed"] });
    expect(execute).not.toHaveBeenCalled();
    await expect(getActionExecution(editor, execution.id, db)).resolves.toMatchObject({
      attempt_count: 0,
      state: "Ready",
    });
  });

  it("requires an explicit test-only option before invented aliases can enter preparation", async () => {
    const action = externalAction("gmail.label.apply", labelValues, "alias-guard");

    await expect(
      prepareExternalActionWithS20(
        editor,
        {
          action,
          definition: leaseDefinition(action.actionKey),
          trustedContext: trustedExternalContext(action, labelContext),
          validate: () => null,
        },
        { db, registry: openRegistryAction(action.actionKey) },
      ),
    ).rejects.toThrow(/restricted to the test harness/i);
    expect(fakeDb.store.size).toBe(0);
  });

  it("runs pure action validation and rejects blank target refs before ledger or queue writes", async () => {
    const action = externalAction("rentvine.work_order.create", workOrderValues, "pure");
    const options = {
      allowSyntheticAliases: true,
      db,
      registry: openRegistryAction(action.actionKey),
    } as const;
    await expect(
      prepareExternalActionWithS20(
        editor,
        {
          action,
          approvalQueue: {
            directLink: "/maintenance/synthetic-pure",
            processRunRef: { id: action.workflowId, label: "Synthetic pure validation" },
            requiredAdminUid: admin.uid,
          },
          definition: maintenanceDefinition(action.actionKey),
          trustedContext: trustedExternalContext(action, technicalContext),
          validate: () => "The governed work-order description is invalid.",
        },
        options,
      ),
    ).rejects.toThrow(/description is invalid/i);
    expect(fakeDb.store.size).toBe(0);

    const blank = { ...action, connectionRef: " " };
    await expect(
      prepareExternalActionWithS20(
        editor,
        {
          action: blank,
          approvalQueue: {
            directLink: "/maintenance/synthetic-pure",
            processRunRef: { id: blank.workflowId, label: "Synthetic pure validation" },
            requiredAdminUid: admin.uid,
          },
          definition: maintenanceDefinition(blank.actionKey),
          trustedContext: trustedExternalContext(blank, technicalContext),
          validate: () => null,
        },
        options,
      ),
    ).rejects.toMatchObject({ blockers: ["source_validation_failed"] });
    expect(fakeDb.store.size).toBe(0);
  });

  it("uses one canonical external identity across preparers", async () => {
    const action = externalAction("gmail.label.apply", labelValues, "canonical");
    const request = {
      action,
      definition: leaseDefinition(action.actionKey),
      trustedContext: trustedExternalContext(action, labelContext),
      validate: () => null,
    };
    const options = {
      allowSyntheticAliases: true,
      db,
      registry: openRegistryAction(action.actionKey),
    } as const;
    const first = await prepareExternalActionWithS20(editor, request, options);
    await expect(
      prepareExternalActionWithS20(otherEditor, request, options),
    ).rejects.toThrow(/idempotency key.*different execution/i);
    expect(
      [...fakeDb.store.keys()].filter((path) => path.startsWith("action_executions/")),
    ).toEqual([`action_executions/${first.id}`]);
  });

  it("requires exact Medium confirmation before the one provider claim", async () => {
    const action = externalAction(
      "gmail.renewal_notice.draft_create",
      draftValues,
      "medium-confirm",
    );
    const trustedContext = trustedExternalContext(action, sendContext);
    const options = {
      allowSyntheticAliases: true,
      db,
      registry: openRegistryAction(action.actionKey),
    } as const;
    const execution = await prepareExternalActionWithS20(
      editor,
      {
        action,
        definition: leaseDefinition(action.actionKey),
        trustedContext,
        validate: () => null,
      },
      options,
    );
    const execute = vi.fn(async () => validReceipt(action.actionKey, "draft-1"));
    const request = {
      action,
      definition: leaseDefinition(action.actionKey),
      executionId: execution.id,
      executor: { execute, reconcile: vi.fn(async () => null) },
      trustedContext,
    };
    await expect(executeExternalActionWithS20(editor, request, options)).rejects.toThrow(
      /exact confirmation/i,
    );
    expect(execute).not.toHaveBeenCalled();
    await expect(
      executeExternalActionWithS20(
        editor,
        { ...request, confirmedPreviewHash: execution.preview_hash },
        options,
      ),
    ).resolves.toMatchObject({ execution: { state: "Succeeded" } });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("snapshots values before awaits and rejects target drift with zero provider calls", async () => {
    const action = externalAction(
      "gmail.renewal_notice.draft_create",
      { ...draftValues },
      "snapshot",
    );
    const trustedContext = trustedExternalContext(action, sendContext);
    const options = {
      allowSyntheticAliases: true,
      db,
      registry: openRegistryAction(action.actionKey),
    } as const;
    const execution = await prepareExternalActionWithS20(
      editor,
      {
        action,
        definition: leaseDefinition(action.actionKey),
        trustedContext,
        validate: () => null,
      },
      options,
    );
    const observedBodies: unknown[] = [];
    const execute = vi.fn(async (input) => {
      observedBodies.push(input.values.body);
      return validReceipt(action.actionKey, "draft-snapshot-1");
    });
    const promise = executeExternalActionWithS20(
      editor,
      {
        action,
        definition: leaseDefinition(action.actionKey),
        executionId: execution.id,
        confirmedPreviewHash: execution.preview_hash,
        executor: { execute, reconcile: vi.fn(async () => null) },
        trustedContext,
      },
      options,
    );
    (action.values as Record<string, unknown>).body = "MUTATED AFTER CALL";
    await expect(promise).resolves.toMatchObject({
      execution: { state: "Succeeded" },
    });
    expect(observedBodies).toEqual([draftValues.body]);

    const driftAction = externalAction(
      "gmail.renewal_notice.draft_create",
      draftValues,
      "drift",
    );
    const driftContext = trustedExternalContext(driftAction, sendContext);
    const driftExecution = await prepareExternalActionWithS20(
      editor,
      {
        action: driftAction,
        definition: leaseDefinition(driftAction.actionKey),
        trustedContext: driftContext,
        validate: () => null,
      },
      options,
    );
    const changed = { ...driftAction, mappingRef: "synthetic:mapping:changed" };
    const changedExecute = vi.fn(async () => validReceipt(changed.actionKey, "never"));
    await expect(
      executeExternalActionWithS20(
        editor,
        {
          action: changed,
          definition: leaseDefinition(changed.actionKey),
          executionId: driftExecution.id,
          confirmedPreviewHash: driftExecution.preview_hash,
          executor: { execute: changedExecute, reconcile: vi.fn(async () => null) },
          trustedContext: trustedExternalContext(changed, sendContext),
        },
        options,
      ),
    ).rejects.toThrow(/does not match.*exact external action/i);
    expect(changedExecute).not.toHaveBeenCalled();
  });

  it("keeps malformed outcomes ambiguous, reconciles once, and strips extra receipt data", async () => {
    const action = externalAction(
      "gmail.renewal_notice.draft_create",
      draftValues,
      "reconcile",
    );
    const trustedContext = trustedExternalContext(action, sendContext);
    const options = {
      allowSyntheticAliases: true,
      db,
      registry: openRegistryAction(action.actionKey),
    } as const;
    const execution = await prepareExternalActionWithS20(
      editor,
      {
        action,
        definition: leaseDefinition(action.actionKey),
        trustedContext,
        validate: () => null,
      },
      options,
    );
    const execute = vi.fn(async () => ({
      ...validReceipt(action.actionKey, "bad-hash"),
      resultHash: "not-a-hash",
      token: "must-not-escape",
    }));
    await expect(
      executeExternalActionWithS20(
        editor,
        {
          action,
          definition: leaseDefinition(action.actionKey),
          executionId: execution.id,
          confirmedPreviewHash: execution.preview_hash,
          executor: { execute, reconcile: vi.fn(async () => null) },
          trustedContext,
        },
        options,
      ),
    ).resolves.toMatchObject({ execution: { state: "Needs reconciliation" } });

    const reconcile = vi
      .fn()
      .mockResolvedValueOnce(validReceipt(action.actionKey, "wrong-flag"))
      .mockResolvedValue({
        ...validReceipt(action.actionKey, "reconciled", true),
        customerData: "must-not-escape",
      });
    const reconcileRequest = {
      action,
      definition: leaseDefinition(action.actionKey),
      executionId: execution.id,
      executor: { execute, reconcile },
      trustedContext,
    };
    const blockedReconcile = vi.fn(async () =>
      validReceipt(action.actionKey, "must-not-read", true),
    );
    await expect(
      reconcileExternalActionWithS20(
        editor,
        {
          ...reconcileRequest,
          executor: { execute, reconcile: blockedReconcile },
          trustedContext: {
            ...trustedContext,
            permissionGranted: false,
            technical: {
              ...trustedContext.technical,
              permissionGranted: false,
            },
          },
        },
        options,
      ),
    ).rejects.toThrow(/permission_missing/i);
    expect(blockedReconcile).not.toHaveBeenCalled();
    await expect(
      reconcileExternalActionWithS20(editor, reconcileRequest, options),
    ).rejects.toThrow(/strict runtime validation/i);
    await expect(getActionExecution(editor, execution.id, db)).resolves.toMatchObject({
      state: "Needs reconciliation",
    });
    const resolved = await reconcileExternalActionWithS20(
      editor,
      {
        ...reconcileRequest,
        trustedContext: {
          ...trustedContext,
          technical: {
            ...trustedContext.technical,
            productionAllowed: false,
          },
        },
      },
      {
        ...options,
        registry: ACTION_REGISTRY_SEED,
      },
    );
    expect(resolved).toMatchObject({
      status: "succeeded",
      duplicate: false,
      receipt: { reconciled: true },
    });
    expect(JSON.stringify(resolved)).not.toMatch(/customerData|must-not-escape/);
    await expect(
      reconcileExternalActionWithS20(editor, reconcileRequest, options),
    ).resolves.toMatchObject({ status: "succeeded", duplicate: true });
    expect(reconcile).toHaveBeenCalledTimes(2);
  });
});

function externalAction(
  actionKey: string,
  values: ExternalActionPreparationInput["values"],
  suffix: string,
): ExternalActionPreparationInput {
  return {
    actionId: `synthetic-action-${suffix}`,
    actionKey,
    dataMode: "test",
    connectionRef: "synthetic:connection:provider",
    contractRef: "documented:synthetic:contract",
    mappingRef: "synthetic:mapping:account",
    sourceRefs: ["synthetic:source:verified"],
    values,
    workflowId: `synthetic-workflow-${suffix}`,
  };
}

function leaseDefinition(actionKey: string): ExternalActionDefinition {
  const definition = LEASE_EXECUTION_DEFINITION_MAP.get(actionKey);
  if (!definition) throw new Error(`Missing Lease definition for ${actionKey}.`);
  return definition;
}

function maintenanceDefinition(actionKey: string): ExternalActionDefinition {
  const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get(actionKey);
  if (!definition) throw new Error(`Missing Maintenance definition for ${actionKey}.`);
  return definition;
}

function trustedExternalContext(
  action: ExternalActionPreparationInput,
  context: TrustedExecutionContext,
): TrustedExternalExecutionContext {
  if (!action.contractRef || !action.connectionRef || !action.mappingRef) {
    throw new Error("Synthetic external refs are required.");
  }
  return {
    ...context,
    technical: syntheticExternalTechnicalGates({
      connectionReady: context.connectionReady === true,
      endpointDocumented: context.endpointDocumented === true,
      permissionGranted: context.permissionGranted === true,
      roleScopeAuthorized: context.roleScopeAuthorized,
      sourceValidated: context.sourceValidated,
    }),
    externalReferences: {
      connectionRef: action.connectionRef,
      contractRef: action.contractRef,
      mappingRef: action.mappingRef,
      sourceRefs: [...action.sourceRefs],
    },
  };
}

function openRegistryAction(actionKey: string): CreateActionRegistryInput[] {
  return ACTION_REGISTRY_SEED.map((entry) =>
    entry.key === actionKey
      ? {
          ...entry,
          documented_evidence: "Synthetic test adapter contract.",
          evidence_status: "Documented" as const,
          production_allowed: true,
          readiness: "Approved for Execution" as const,
        }
      : entry,
  );
}

function validReceipt(actionKey: string, providerRef: string, reconciled = false) {
  return {
    actionKey,
    providerRef,
    resultHash: "a".repeat(64),
    reconciled,
    createdAt: "2026-07-14T00:00:00.000Z",
  };
}
