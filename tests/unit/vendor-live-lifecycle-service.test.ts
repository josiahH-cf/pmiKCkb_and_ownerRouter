import { afterEach, describe, expect, it, vi } from "vitest";

const runtimeSuspension = vi.hoisted(() => ({
  current: { status: "clear" } as { status: string },
}));
vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => runtimeSuspension.current),
}));

import type { AuthenticatedUser } from "@/lib/auth/session";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { ActionExecutionRecord } from "@/lib/execution/types";
import type {
  ExternalActionPreparationInput,
  TrustedExternalExecutionContext,
} from "@/lib/external-execution/s20-bridge";
import type {
  ExternalActionReceipt,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { ActionRuntimeSuspendedError } from "@/lib/operations/runtime-suspension-gate";
import {
  FirebaseLiveVendorAuthAdapter,
  GmailLiveVendorInviteDeliveryAdapter,
} from "@/lib/vendor/live-lifecycle-adapters";
import {
  executeLiveVendorLifecycle,
  prepareLiveVendorLifecycle,
  reconcileLiveVendorLifecycle,
  type LiveVendorLifecycleServiceDeps,
  type LiveVendorLifecycleSourceSelection,
} from "@/lib/vendor/live-lifecycle-service";

const ACTOR: AuthenticatedUser = {
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "admin-1",
};

const EXPLICIT_LIVE = {
  descriptor: {
    dataContext: "live",
    environmentKind: "production",
    source: "explicit",
  },
} as const;

const INVITE_INTENT = {
  actionKey: "vendor.account.invite",
  company: "Acme Plumbing",
  email: "dispatch@acmeplumbing.co",
  reason: "New approved plumbing partner",
  ticketId: "ticket-101",
} as const;

const INVITE_VALUES = {
  artifact_ref: "vendor-invite:v1.0",
  invite_mode: "initial",
  invite_version: "0",
  reason: INVITE_INTENT.reason,
  ticket_ref: INVITE_INTENT.ticketId,
  ticket_updated_at: "2026-07-30T12:00:00.000Z",
  vendor_company: INVITE_INTENT.company,
  vendor_email: INVITE_INTENT.email,
  vendor_ref: "vendor:new",
  vendor_status: "none",
  vendor_uid: "identity:new",
  vendor_updated_at: "generation:new",
} as const;

const EXECUTION_ID = `exec_${"a".repeat(40)}`;
const VENDOR_UID = `vendor_live_${"b".repeat(32)}`;
const VENDOR_REF = `vendor-live-${"b".repeat(32)}`;

afterEach(() => {
  runtimeSuspension.current = { status: "clear" };
});

describe("Live Vendor lifecycle service", () => {
  // S51_DYNAMIC_REFUSAL:vendor-runtime-provider
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "does not construct the Vendor lifecycle provider when runtime state is %s",
    async (status) => {
      const harness = makeHarness();
      const createProvider = vi.fn();
      const resolveLazyExecutor = vi.fn(
        async (): Promise<ExternalExecutor> => ({
          validate: () => null,
          execute: async () => {
            createProvider();
            throw new Error("provider should remain unreachable");
          },
          reconcile: async () => null,
        }),
      );
      runtimeSuspension.current = { status };

      await expect(
        executeLiveVendorLifecycle(
          ACTOR,
          {
            ...INVITE_INTENT,
            confirmedPreviewHash: hashExecutionPreview(INVITE_VALUES),
            executionId: EXECUTION_ID,
            operation: "execute",
          },
          { ...harness.deps, resolveLazyExecutor },
          EXPLICIT_LIVE,
        ),
      ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);

      expect(createProvider).not.toHaveBeenCalled();
      expect(resolveLazyExecutor).not.toHaveBeenCalled();
      expect(harness.source.resolve).not.toHaveBeenCalled();
    },
  );

  // S51_DYNAMIC_REFUSAL:vendor-ensure-client
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "does not construct Firebase for Vendor ensure when runtime state is %s",
    async (status) => {
      const harness = makeHarness();
      const createClient = vi.fn();
      const adapter = new FirebaseLiveVendorAuthAdapter(createClient);
      const resolveLazyExecutor = vi.fn(
        async (): Promise<ExternalExecutor> => ({
          validate: () => null,
          execute: async () => {
            await adapter.ensureVendorPrincipal({
              uid: VENDOR_UID,
              email: INVITE_INTENT.email,
              vendorRef: VENDOR_REF,
              customClaims: {
                vendor: true,
                vendor_id: VENDOR_REF,
                data_mode: "live",
              },
            });
            throw new Error("adapter should remain unreachable");
          },
          reconcile: async () => null,
        }),
      );
      runtimeSuspension.current = { status };

      await expect(
        executeLiveVendorLifecycle(
          ACTOR,
          {
            ...INVITE_INTENT,
            confirmedPreviewHash: hashExecutionPreview(INVITE_VALUES),
            executionId: EXECUTION_ID,
            operation: "execute",
          },
          { ...harness.deps, resolveLazyExecutor },
          EXPLICIT_LIVE,
        ),
      ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);

      expect(createClient).not.toHaveBeenCalled();
      expect(resolveLazyExecutor).not.toHaveBeenCalled();
    },
  );

  // S51_DYNAMIC_REFUSAL:vendor-disable-client
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "does not construct Firebase for Vendor disable when runtime state is %s",
    async (status) => {
      const harness = makeHarness({
        registry: openRegistry("vendor.account.disable"),
      });
      const createClient = vi.fn();
      const adapter = new FirebaseLiveVendorAuthAdapter(createClient);
      const resolveLazyExecutor = vi.fn(
        async (): Promise<ExternalExecutor> => ({
          validate: () => null,
          execute: async () => {
            await adapter.disableUser(VENDOR_UID, INVITE_INTENT.email);
            throw new Error("adapter should remain unreachable");
          },
          reconcile: async () => null,
        }),
      );
      runtimeSuspension.current = { status };

      await expect(
        executeLiveVendorLifecycle(
          ACTOR,
          {
            actionKey: "vendor.account.disable",
            reason: "End approved Vendor access",
            vendorId: VENDOR_REF,
            confirmedPreviewHash: "c".repeat(64),
            executionId: EXECUTION_ID,
            operation: "execute",
          },
          { ...harness.deps, resolveLazyExecutor },
          EXPLICIT_LIVE,
        ),
      ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);

      expect(createClient).not.toHaveBeenCalled();
      expect(resolveLazyExecutor).not.toHaveBeenCalled();
    },
  );

  // S51_DYNAMIC_REFUSAL:vendor-revoke-client
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "does not construct Firebase for Vendor revocation when runtime state is %s",
    async (status) => {
      const harness = makeHarness({
        registry: openRegistry("vendor.account.disable"),
      });
      const createClient = vi.fn();
      const adapter = new FirebaseLiveVendorAuthAdapter(createClient);
      const resolveLazyExecutor = vi.fn(
        async (): Promise<ExternalExecutor> => ({
          validate: () => null,
          execute: async () => {
            await adapter.revokeRefreshTokens(VENDOR_UID, INVITE_INTENT.email);
            throw new Error("adapter should remain unreachable");
          },
          reconcile: async () => null,
        }),
      );
      runtimeSuspension.current = { status };

      await expect(
        executeLiveVendorLifecycle(
          ACTOR,
          {
            actionKey: "vendor.account.disable",
            reason: "End approved Vendor access",
            vendorId: VENDOR_REF,
            confirmedPreviewHash: "c".repeat(64),
            executionId: EXECUTION_ID,
            operation: "execute",
          },
          { ...harness.deps, resolveLazyExecutor },
          EXPLICIT_LIVE,
        ),
      ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);

      expect(createClient).not.toHaveBeenCalled();
      expect(resolveLazyExecutor).not.toHaveBeenCalled();
    },
  );

  // S51_DYNAMIC_REFUSAL:vendor-invite-client
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "does not construct Gmail for a Vendor invite when runtime state is %s",
    async (status) => {
      const harness = makeHarness();
      const createClient = vi.fn();
      const adapter = new GmailLiveVendorInviteDeliveryAdapter({
        createClient,
        readConfig: () => ({
          appBaseUrl: "https://app.pmikcmetro.com",
          kbApprovalSender: "ops@pmikcmetro.com",
        }),
      });
      const resolveLazyExecutor = vi.fn(
        async (): Promise<ExternalExecutor> => ({
          validate: () => null,
          execute: async () => {
            await adapter.sendInvite({
              recipientEmail: INVITE_INTENT.email,
              recipientHash: "d".repeat(64),
              company: INVITE_INTENT.company,
              vendorRef: VENDOR_REF,
              vendorUid: VENDOR_UID,
              inviteVersion: 0,
              lifecycleExecutionId: EXECUTION_ID,
              challengeExpiresAt: "2026-07-30T13:00:00.000Z",
              ticketRef: INVITE_INTENT.ticketId,
              artifactRef: "vendor-invite:v1.0",
              rfcMessageId: `<vendor-invite-${"e".repeat(64)}@pmikcmetro.com>`,
            });
            throw new Error("adapter should remain unreachable");
          },
          reconcile: async () => null,
        }),
      );
      runtimeSuspension.current = { status };

      await expect(
        executeLiveVendorLifecycle(
          ACTOR,
          {
            ...INVITE_INTENT,
            confirmedPreviewHash: hashExecutionPreview(INVITE_VALUES),
            executionId: EXECUTION_ID,
            operation: "execute",
          },
          { ...harness.deps, resolveLazyExecutor },
          EXPLICIT_LIVE,
        ),
      ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);

      expect(createClient).not.toHaveBeenCalled();
      expect(resolveLazyExecutor).not.toHaveBeenCalled();
    },
  );

  it("prepares the exact server projection and Approval Queue link with no Live client", async () => {
    const harness = makeHarness();

    const outcome = await prepareLiveVendorLifecycle(
      ACTOR,
      { ...INVITE_INTENT, operation: "prepare" },
      harness.deps,
      EXPLICIT_LIVE,
    );

    expect(harness.source.resolve).toHaveBeenCalledWith({
      actor: ACTOR,
      intent: INVITE_INTENT,
      operation: "prepare",
    });
    expect(harness.resolveValidator).toHaveBeenCalledTimes(1);
    expect(harness.resolveLazyExecutor).not.toHaveBeenCalled();
    expect(harness.preparedAttempts.persist).toHaveBeenCalledWith(ACTOR, {
      execution: expect.objectContaining({ id: EXECUTION_ID }),
      selection: harness.selection,
    });
    expect(harness.liveClientConstructions()).toBe(0);
    expect(outcome).toMatchObject({
      approvalQueueHref: `/approval-queue?item_id=queue-for-${EXECUTION_ID}`,
      preview: {
        actionKey: "vendor.account.invite",
        executionId: EXECUTION_ID,
        previewHash: hashExecutionPreview(INVITE_VALUES),
        projection: INVITE_VALUES,
      },
      status: "awaiting_approval",
    });
    expect(outcome.preview.fields.map((field) => field.name)).toEqual([
      "vendor_company",
      "vendor_email",
      "ticket_ref",
      "ticket_updated_at",
      "artifact_ref",
      "invite_mode",
      "invite_version",
      "vendor_ref",
      "vendor_uid",
      "vendor_status",
      "vendor_updated_at",
      "reason",
    ]);
    expect(harness.s20.prepare).toHaveBeenCalledWith(
      ACTOR,
      expect.objectContaining({
        action: harness.selection.action,
        approvalQueue: expect.objectContaining({
          directLink: "/admin/vendors",
          requiredAdminUid: ACTOR.uid,
        }),
      }),
      { registry: harness.registry },
    );
  });

  it("clearly labels a server-derived corrective re-invite preview", async () => {
    const harness = makeHarness({ variant: "invite_correction" });

    const outcome = await prepareLiveVendorLifecycle(
      ACTOR,
      { ...INVITE_INTENT, operation: "prepare" },
      harness.deps,
      EXPLICIT_LIVE,
    );

    expect(outcome.preview.exactEffect).toContain("corrective re-invitation");
    expect(harness.s20.prepare).toHaveBeenCalledWith(
      ACTOR,
      expect.objectContaining({
        approvalQueue: expect.objectContaining({
          processRunRef: expect.objectContaining({
            label: "Vendor re-invite correction",
          }),
        }),
      }),
      { registry: harness.registry },
    );
  });

  it("refuses a stale exact hash before resolving a lazy executor or touching S20", async () => {
    const harness = makeHarness();

    await expect(
      executeLiveVendorLifecycle(
        ACTOR,
        {
          ...INVITE_INTENT,
          confirmedPreviewHash: "b".repeat(64),
          executionId: EXECUTION_ID,
          operation: "execute",
        },
        harness.deps,
        EXPLICIT_LIVE,
      ),
    ).rejects.toMatchObject({ code: "vendor_lifecycle_stale_preview" });

    expect(harness.resolveLazyExecutor).not.toHaveBeenCalled();
    expect(harness.s20.execute).not.toHaveBeenCalled();
    expect(harness.liveClientConstructions()).toBe(0);
  });

  it("refuses a closed named action before source reload, validator, or client work", async () => {
    const harness = makeHarness({ registry: undefined });

    await expect(
      prepareLiveVendorLifecycle(
        ACTOR,
        { ...INVITE_INTENT, operation: "prepare" },
        harness.deps,
        EXPLICIT_LIVE,
      ),
    ).rejects.toMatchObject({ code: "action_not_production_allowed" });

    expect(harness.source.resolve).not.toHaveBeenCalled();
    expect(harness.resolveValidator).not.toHaveBeenCalled();
    expect(harness.resolveLazyExecutor).not.toHaveBeenCalled();
    expect(harness.s20.prepare).not.toHaveBeenCalled();
    expect(harness.liveClientConstructions()).toBe(0);
  });

  it.each([
    {
      dataContext: "demo" as const,
      environmentKind: "demo" as const,
      source: "explicit" as const,
    },
    {
      dataContext: "live_readonly" as const,
      environmentKind: "demo" as const,
      source: "explicit" as const,
    },
    {
      dataContext: "live" as const,
      environmentKind: "production" as const,
      source: "legacy-node-env" as const,
    },
  ])(
    "refuses $environmentKind+$dataContext from $source before source/client work",
    async (descriptor) => {
      const harness = makeHarness();
      await expect(
        prepareLiveVendorLifecycle(
          ACTOR,
          { ...INVITE_INTENT, operation: "prepare" },
          harness.deps,
          { descriptor },
        ),
      ).rejects.toThrow();
      expect(harness.source.resolve).not.toHaveBeenCalled();
      expect(harness.resolveLazyExecutor).not.toHaveBeenCalled();
      expect(harness.liveClientConstructions()).toBe(0);
    },
  );

  it("passes only server-loaded dependency ids and constructs a client only inside post-claim execute", async () => {
    const harness = makeHarness({
      dependencyExecutionIds: {
        "vendor.account.invite": `exec_${"c".repeat(40)}`,
      },
      executeCallsWrapper: true,
    });

    const outcome = await executeLiveVendorLifecycle(
      ACTOR,
      {
        ...INVITE_INTENT,
        confirmedPreviewHash: hashExecutionPreview(INVITE_VALUES),
        executionId: EXECUTION_ID,
        operation: "execute",
      },
      harness.deps,
      EXPLICIT_LIVE,
    );

    expect(harness.s20.execute).toHaveBeenCalledWith(
      ACTOR,
      expect.objectContaining({
        dependencyExecutionIds: {
          "vendor.account.invite": `exec_${"c".repeat(40)}`,
        },
        executionId: EXECUTION_ID,
      }),
      { registry: harness.registry },
    );
    expect(harness.liveClientConstructions()).toBe(1);
    expect(outcome).toEqual({
      executionId: EXECUTION_ID,
      resultRecorded: true,
      status: "succeeded",
    });
  });

  it("constructs no Live client when S20 refuses before its atomic claim", async () => {
    const harness = makeHarness({ executeRejectsBeforeClaim: true });

    await expect(
      executeLiveVendorLifecycle(
        ACTOR,
        {
          ...INVITE_INTENT,
          confirmedPreviewHash: hashExecutionPreview(INVITE_VALUES),
          executionId: EXECUTION_ID,
          operation: "execute",
        },
        harness.deps,
        EXPLICIT_LIVE,
      ),
    ).rejects.toThrow("claim refused");

    expect(harness.resolveLazyExecutor).toHaveBeenCalledTimes(1);
    expect(harness.liveClientConstructions()).toBe(0);
  });

  it("keeps read-only reconciliation reachable with a closed mutation gate and rehydrates by execution id", async () => {
    const harness = makeHarness({ registry: undefined });

    const outcome = await reconcileLiveVendorLifecycle(
      ACTOR,
      {
        ...INVITE_INTENT,
        executionId: EXECUTION_ID,
        operation: "reconcile",
      },
      harness.deps,
      EXPLICIT_LIVE,
    );

    expect(harness.source.resolve).toHaveBeenCalledWith({
      actor: ACTOR,
      executionId: EXECUTION_ID,
      intent: INVITE_INTENT,
      operation: "reconcile",
    });
    expect(harness.s20.reconcile).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({
      duplicate: false,
      executionId: EXECUTION_ID,
      status: "not_found",
    });
  });

  it("atomically closes a missing-provider attempt as bodyless not applicable without a provider client", async () => {
    const harness = makeHarness({ preProviderFence: true, registry: undefined });

    const outcome = await reconcileLiveVendorLifecycle(
      ACTOR,
      {
        ...INVITE_INTENT,
        executionId: EXECUTION_ID,
        operation: "reconcile",
      },
      harness.deps,
      EXPLICIT_LIVE,
    );

    expect(outcome).toEqual({
      duplicate: false,
      executionId: EXECUTION_ID,
      outcome: "not_applicable",
      status: "succeeded",
    });
    expect(harness.preparedAttempts.fenceForReconciliation).toHaveBeenCalledTimes(1);
    expect(harness.resolveLazyExecutor).not.toHaveBeenCalled();
    expect(harness.s20.reconcile).not.toHaveBeenCalled();
    expect(JSON.stringify(outcome)).not.toMatch(/providerRef|resultHash|reason/i);
  });

  it("surfaces a reconciled no-new-effect correction as closed without leaking its receipt", async () => {
    const harness = makeHarness({
      reconcileReceipt: {
        actionKey: "vendor.account.invite",
        createdAt: "2026-07-30T12:02:00.000Z",
        dataMode: "live",
        liveEvidenceEligible: true,
        outcome: "not_applicable",
        providerRef: `vendor-invite-not-applicable:${"b".repeat(64)}`,
        reconciled: true,
        resultHash: "c".repeat(64),
      },
      registry: undefined,
      variant: "invite_correction",
    });

    const outcome = await reconcileLiveVendorLifecycle(
      ACTOR,
      {
        ...INVITE_INTENT,
        executionId: EXECUTION_ID,
        operation: "reconcile",
      },
      harness.deps,
      EXPLICIT_LIVE,
    );

    expect(outcome).toEqual({
      duplicate: false,
      executionId: EXECUTION_ID,
      outcome: "not_applicable",
      status: "succeeded",
    });
    expect(JSON.stringify(outcome)).not.toMatch(
      /providerRef|resultHash|vendor-invite-not-applicable/i,
    );
    expect(harness.s20.reconcile).toHaveBeenCalledTimes(1);
  });
});

function makeHarness(
  options: {
    dependencyExecutionIds?: Readonly<Record<string, string>>;
    executeCallsWrapper?: boolean;
    executeRejectsBeforeClaim?: boolean;
    preProviderFence?: boolean;
    reconcileReceipt?: ExternalActionReceipt;
    registry?: CreateActionRegistryInput[] | undefined;
    variant?: LiveVendorLifecycleSourceSelection["variant"];
  } = {},
) {
  const registry =
    "registry" in options ? options.registry : openRegistry("vendor.account.invite");
  const action: ExternalActionPreparationInput = {
    actionId: "invite-ticket-101",
    actionKey: "vendor.account.invite",
    connectionRef: "firebase-vendor-identity",
    contractRef: "vendor-account-lifecycle-v1",
    dataMode: "live",
    mappingRef: "vendor-ticket-assignment-v1",
    sourceRefs:
      options.variant === "invite_correction"
        ? [
            "ticket-101-generation-20260730",
            `vendor-invite-supersession:${"e".repeat(64)}`,
          ]
        : ["ticket-101-generation-20260730"],
    values: INVITE_VALUES,
    workflowId: "maintenance-ticket-101",
  };
  const trustedContext: TrustedExternalExecutionContext = {
    connectionReady: true,
    endpointDocumented: true,
    externalReferences: {
      connectionRef: action.connectionRef!,
      contractRef: action.contractRef!,
      mappingRef: action.mappingRef!,
      sourceRefs: action.sourceRefs,
    },
    permissionGranted: true,
    roleScopeAuthorized: true,
    sourceValidated: true,
    technical: {
      connectionReady: true,
      documentedEvidence: true,
      endpointDocumented: true,
      permissionGranted: true,
      productionAllowed: true,
      requiredValuesPresent: true,
      roleScopeAuthorized: true,
      sourceValidated: true,
    },
  };
  const selection: LiveVendorLifecycleSourceSelection = {
    action,
    ...(options.dependencyExecutionIds
      ? { dependencyExecutionIds: options.dependencyExecutionIds }
      : {}),
    trustedContext,
    ...(options.variant ? { variant: options.variant } : {}),
  };
  const source = { resolve: vi.fn(async () => selection) };
  let clientConstructions = 0;
  const receipt: ExternalActionReceipt = {
    actionKey: action.actionKey,
    createdAt: "2026-07-30T12:01:00.000Z",
    dataMode: "live",
    liveEvidenceEligible: true,
    providerRef: "firebase-user-1",
    reconciled: false,
    resultHash: "d".repeat(64),
  };
  const lazyExecutor: ExternalExecutor = {
    validate: () => null,
    execute: async () => {
      clientConstructions += 1;
      return receipt;
    },
    reconcile: async () => {
      clientConstructions += 1;
      return null;
    },
  };
  const resolveValidator = vi.fn(() => () => null);
  const resolveLazyExecutor = vi.fn(async () => lazyExecutor);
  const previewHash = hashExecutionPreview(INVITE_VALUES);
  const preparedRecord = executionRecord({
    preview_hash: previewHash,
    state: "Awaiting Admin",
  });
  const succeededRecord = executionRecord({
    attempt_count: 1,
    preview_hash: previewHash,
    result_code: "external_receipt:recorded",
    state: "Succeeded",
  });
  const s20 = {
    prepare: vi.fn(async () => preparedRecord),
    execute: vi.fn(async (_actor, request) => {
      if (options.executeRejectsBeforeClaim) throw new Error("claim refused");
      const result = options.executeCallsWrapper
        ? await request.executor.execute({
            ...request.action,
            authority: {
              actor: { role: ACTOR.role, uid: ACTOR.uid },
              roleScopeAuthorized: true,
              technical: trustedContext.technical,
            },
          })
        : undefined;
      return { execution: succeededRecord, ...(result ? { result } : {}) };
    }),
    reconcile: vi.fn(async () =>
      options.reconcileReceipt
        ? {
            duplicate: false,
            execution: succeededRecord,
            receipt: options.reconcileReceipt,
            status: "succeeded" as const,
          }
        : {
            duplicate: false,
            execution: executionRecord({
              attempt_count: 1,
              preview_hash: previewHash,
              state: "Needs reconciliation",
            }),
            status: "not_found" as const,
          },
    ),
  } satisfies NonNullable<LiveVendorLifecycleServiceDeps["s20"]>;
  const preparedAttempts: LiveVendorLifecycleServiceDeps["preparedAttempts"] = {
    persist: vi.fn(async () => undefined),
    requireUnstarted: vi.fn(async () => undefined),
    fenceForReconciliation: vi.fn(async () =>
      options.preProviderFence
        ? {
            duplicate: false,
            receipt: {
              actionKey: action.actionKey,
              attemptFenced: true as const,
              createdAt: "2026-07-30T12:00:00.000Z",
              dataMode: "live" as const,
              liveEvidenceEligible: true,
              outcome: "not_applicable" as const,
              providerRef: `vendor-lifecycle-pre-provider-fence:${EXECUTION_ID}`,
              reconciled: true,
              resultHash: "f".repeat(64),
            },
            status: "fenced" as const,
          }
        : { status: "provider_started" as const },
    ),
  };
  const deps: LiveVendorLifecycleServiceDeps = {
    preparedAttempts,
    resolveLazyExecutor,
    resolveValidator,
    ...(registry ? { registry } : {}),
    resolveApprovalQueueHref: async (_actor, id) =>
      `/approval-queue?item_id=queue-for-${id}`,
    s20,
    source,
  };

  return {
    deps,
    liveClientConstructions: () => clientConstructions,
    preparedAttempts,
    registry,
    resolveLazyExecutor,
    resolveValidator,
    s20,
    selection,
    source,
  };
}

function openRegistry(actionKey: string): CreateActionRegistryInput[] {
  const row = ACTION_REGISTRY_SEED.find((entry) => entry.key === actionKey);
  if (!row) throw new Error(`Missing Registry row for ${actionKey}.`);
  return [
    {
      ...row,
      evidence_status: "Documented",
      production_allowed: true,
      readiness: "Approved for Execution",
    },
  ];
}

function executionRecord(
  overrides: Partial<ActionExecutionRecord>,
): ActionExecutionRecord {
  return {
    action_key: "vendor.account.invite",
    action_kind: "identity_write",
    actor_role: "Admin",
    actor_uid: ACTOR.uid,
    attempt_count: 0,
    created_at: "2026-07-30T12:00:00.000Z",
    id: EXECUTION_ID,
    idempotency_hash: "e".repeat(64),
    preview_hash: hashExecutionPreview(INVITE_VALUES),
    requires_action_registry: true,
    risk: "High",
    state: "Awaiting Admin",
    updated_at: "2026-07-30T12:00:00.000Z",
    ...overrides,
  };
}
