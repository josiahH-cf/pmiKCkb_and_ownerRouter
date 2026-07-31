import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeSuspension = vi.hoisted(() => ({
  current: { status: "clear" } as { status: string },
}));
vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => runtimeSuspension.current),
}));

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertLiveProviderActionAllowed,
  requireEnvironmentDescriptor,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { executePreparedAction, prepareActionExecution } from "@/lib/execution/service";
import {
  getActionExecution,
  resolveActionReconciliation,
} from "@/lib/firestore/action-executions";
import { FirestoreGmailLabelEffectStore } from "@/lib/firestore/gmail-label-effects";
import { WORKFLOW_REPLY_POLICY_REF } from "@/lib/gmail-hub/governed-artifacts";
import {
  gmailLabelExecutionId,
  GMAIL_GOVERNED_LABELS,
  type GmailLabelSnapshotDraft,
} from "@/lib/gmail-hub/label-contract";
import { communicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";
import {
  GmailAmbiguousLabelError,
  GmailHubError,
  GmailHubGateError,
  GmailHubService,
} from "@/lib/gmail-hub/service";
import { gmailMailboxKey, MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import { GmailRuntimeClient, GmailRuntimeError } from "@/lib/gmail-runtime/client";
import type { LiveEffectAttentionEvent } from "@/lib/operations/live-effect-attention-log";
import { assertProductionRuntimeActionExecutable } from "@/lib/operations/runtime-suspension-gate";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

/**
 * S25 falsification suite for `gmail.label.apply`.
 *
 * Every test drives the REAL S20 ledger (`prepareActionExecution`/`executePreparedAction`/
 * `resolveActionReconciliation`) against an in-memory Firestore, so the one-attempt state machine
 * under test is the committed one rather than a stand-in. The Gmail transport is the only fake.
 */

const actor: AuthenticatedUser = {
  uid: "user-josiah",
  email: "josiah@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Approver",
};
const otherActor: AuthenticatedUser = { ...actor, uid: "user-second-operator" };

const LABEL_IDS = {
  "Waiting on Outside": "Label_outside",
  "Waiting on Team": "Label_team",
  "Dan Decision": "Label_dan",
  "Draft Ready": "Label_draft",
} as const;

function context(
  overrides: Partial<WorkflowCommunicationContext> = {},
): WorkflowCommunicationContext {
  return {
    lane: "maintenance",
    entityType: "maintenance_ticket",
    entityId: "ticket-synthetic-1",
    purpose: "maintenance_owner",
    actionKey: "gmail.label.apply",
    sourceRefs: ["maintenance_ticket:ticket-synthetic-1"],
    templateRef: "maintenance-owner:v1.0",
    replyPolicyRef: WORKFLOW_REPLY_POLICY_REF,
    ...overrides,
  };
}

const labelInput = {
  context: context(),
  label: "Waiting on Team" as const,
  reason: "Waiting for staff review",
  ruleRef: "manual-human-review:v1" as const,
};

class FakeLabelClient extends GmailRuntimeClient {
  listLabelCalls = 0;
  threadReadCalls = 0;
  mutations: Array<{
    threadId: string;
    addLabelIds: readonly string[];
    removeLabelIds: readonly string[];
  }> = [];
  provisioned: string[] = [...GMAIL_GOVERNED_LABELS];
  threadLabelIds: string[] = ["INBOX"];
  mutationError: Error | null = null;
  /** When set, the provider "succeeds" but reports a different resulting set. */
  readbackLabelIds: string[] | null = null;

  constructor(subject = actor.email) {
    super({
      subject,
      transport: {
        async send() {
          throw new Error("unexpected transport call");
        },
      },
      getToken: async () => "unused",
    });
  }

  override async resolveExistingUserLabels<Name extends string>(names: readonly Name[]) {
    this.listLabelCalls += 1;
    const resolved = new Map<Name, { id: string; name: string; type: "user" }>();
    for (const name of names) {
      if (!this.provisioned.includes(name)) continue;
      resolved.set(name, {
        id: LABEL_IDS[name as keyof typeof LABEL_IDS],
        name,
        type: "user",
      });
    }
    return resolved;
  }

  override async getThreadLabelIds() {
    this.threadReadCalls += 1;
    return [...this.threadLabelIds];
  }

  override async modifyThreadLabels(
    threadId: string,
    mutation: { addLabelIds: readonly string[]; removeLabelIds: readonly string[] },
  ) {
    this.mutations.push({ threadId, ...mutation });
    if (this.mutationError) throw this.mutationError;
    const next = new Set(this.threadLabelIds);
    for (const id of mutation.addLabelIds) next.add(id);
    for (const id of mutation.removeLabelIds) next.delete(id);
    this.threadLabelIds = [...next];
    return {
      threadId,
      labelIds: this.readbackLabelIds ?? [...this.threadLabelIds],
    };
  }
}

interface HarnessOptions {
  client?: FakeLabelClient;
  db?: FakeFirestore;
  store?: MemoryGmailStateStore;
  as?: AuthenticatedUser;
  dataMode?: "live" | "test";
  gates?: readonly string[];
  assertEffectEnvironment?: () => void;
  assertRuntimeActionExecutable?: (action: string) => Promise<void>;
  sourceRefs?: string[];
  failAudit?: boolean;
}

function harness(options: HarnessOptions = {}) {
  const client = options.client ?? new FakeLabelClient();
  const db = options.db ?? new FakeFirestore();
  const store = options.store ?? new MemoryGmailStateStore();
  const attention: LiveEffectAttentionEvent[] = [];
  const nowMs = 1_700_000_000_000;

  store.communicationLinks.set("link-1", {
    id: "link-1",
    actor_uid: actor.uid,
    mailbox_key: gmailMailboxKey(actor.email),
    lane: "maintenance",
    entity_type: "maintenance_ticket",
    entity_id: "ticket-synthetic-1",
    purpose: "maintenance_owner",
    origin_action_key: "gmail.mailbox.read",
    source_refs: options.sourceRefs ?? ["maintenance_ticket:ticket-synthetic-1"],
    template_ref: "maintenance-owner:v1.0",
    reply_policy_ref: WORKFLOW_REPLY_POLICY_REF,
    gmail_thread_id: "thread-1",
    status: "linked",
    created_at_ms: nowMs,
    updated_at_ms: nowMs,
    ...communicationsRetentionFields("workflow_link", nowMs),
  });

  if (options.failAudit) {
    store.appendWorkflowActionAudit = async () => {
      throw new Error("audit sink unavailable");
    };
  }

  const gates = new Set(options.gates ?? ["gmail.label.apply", "gmail.mailbox.read"]);
  const firestore = db as unknown as Firestore;
  const createClient = vi.fn(() => client);
  const service = (as: AuthenticatedUser = options.as ?? actor) =>
    new GmailHubService(as, {
      createClient,
      store,
      assertEffectEnvironment: options.assertEffectEnvironment ?? (() => undefined),
      assertRuntimeActionExecutable:
        options.assertRuntimeActionExecutable ??
        (async (action) => {
          if (!gates.has(action)) throw new GmailHubGateError(action);
        }),
      now: () => nowMs,
      labelEffects: new FirestoreGmailLabelEffectStore(firestore),
      dataMode: options.dataMode ?? "live",
      prepareExecution: (user, input) =>
        prepareActionExecution(user, input, { db: firestore }),
      executePrepared: (input) => executePreparedAction({ ...input, db: firestore }),
      resolveExecutionReconciliation: (user, id, input) =>
        resolveActionReconciliation(user, id, input, firestore),
      emitLiveEffectAttention: (event) => {
        attention.push(event);
      },
    });

  return { attention, client, createClient, db, firestore, service, store };
}

const executionId = gmailLabelExecutionId({
  mailboxEmail: actor.email,
  context: context(),
  threadId: "thread-1",
  label: "Waiting on Team",
  ruleRef: "manual-human-review:v1",
  kind: "apply",
});

beforeEach(() => {
  runtimeSuspension.current = { status: "clear" };
});

describe("gmail.label.apply — S20 execution contract", () => {
  it("claims one attempt, performs exactly one governed mutation, and settles a bodyless receipt", async () => {
    const { client, firestore, service } = harness();

    const result = await service().applyThreadLabel("thread-1", labelInput);

    expect(result).toMatchObject({
      status: "settled",
      kind: "apply",
      executionId,
      threadId: "thread-1",
      labelName: "Waiting on Team",
      labelId: LABEL_IDS["Waiting on Team"],
      governedLabels: ["Waiting on Team"],
      duplicate: false,
      auditRecorded: true,
    });
    expect(client.mutations).toEqual([
      {
        threadId: "thread-1",
        addLabelIds: [LABEL_IDS["Waiting on Team"]],
        removeLabelIds: [],
      },
    ]);

    const execution = await getActionExecution(actor, executionId, firestore);
    expect(execution).toMatchObject({
      action_key: "gmail.label.apply",
      attempt_count: 1,
      state: "Succeeded",
      risk: "Low",
    });
    expect(execution.result_code).toMatch(/^gmail_label:apply:[a-f0-9]{64}$/);
    // Bodyless: neither the human reason nor the mailbox address may reach the durable ledger.
    const persisted = JSON.stringify([...(firestore as never as FakeFirestore).store]);
    expect(persisted).not.toContain(labelInput.reason);
    expect(persisted).not.toContain(actor.email);
  });

  it("returns duplicate evidence on replay without a second provider mutation", async () => {
    const { client, service } = harness();
    await service().applyThreadLabel("thread-1", labelInput);

    const replay = await service().applyThreadLabel("thread-1", labelInput);

    expect(replay).toMatchObject({ status: "settled", duplicate: true });
    expect(client.mutations).toHaveLength(1);
  });

  it("gives a second operator the same duplicate evidence instead of a second effect", async () => {
    const { client, service } = harness();
    await service().applyThreadLabel("thread-1", labelInput);

    const second = await service(otherActor).applyThreadLabel("thread-1", labelInput);

    expect(second).toMatchObject({ duplicate: true, labelName: "Waiting on Team" });
    expect(client.mutations).toHaveLength(1);
  });

  it("refuses a concurrent confirmation so only one attempt reaches Gmail", async () => {
    const { client, service } = harness();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = client.modifyThreadLabels.bind(client);
    let firstCall = true;
    client.modifyThreadLabels = async (threadId, mutation) => {
      if (firstCall) {
        firstCall = false;
        await gate;
      }
      return original(threadId, mutation);
    };

    const first = service().applyThreadLabel("thread-1", labelInput);
    // The second confirmation starts while the first still holds the claim.
    const second = service()
      .applyThreadLabel("thread-1", labelInput)
      .catch((e) => e);
    const secondOutcome = await second;
    release();
    await first;

    expect(client.mutations).toHaveLength(1);
    expect(secondOutcome).toBeInstanceOf(Error);
  });
});

describe("gmail.label.apply — refusals before any provider construction", () => {
  const environments = [
    {
      name: "Demo",
      assert: () =>
        assertLiveProviderActionAllowed({
          environmentKind: "demo",
          dataContext: "demo",
          source: "explicit",
        } satisfies EnvironmentDescriptor),
    },
    {
      name: "Live read-only",
      assert: () =>
        assertLiveProviderActionAllowed({
          environmentKind: "demo",
          dataContext: "live_readonly",
          source: "explicit",
        } satisfies EnvironmentDescriptor),
    },
    {
      name: "an invalid descriptor",
      assert: () => {
        requireEnvironmentDescriptor({ ENVIRONMENT_KIND: "production" });
      },
    },
  ] as const;

  it.each(environments)(
    "constructs no Gmail client in $name",
    async ({ assert: assertEffectEnvironment }) => {
      const { createClient, service } = harness({ assertEffectEnvironment });

      await expect(service().applyThreadLabel("thread-1", labelInput)).rejects.toThrow();
      expect(createClient).not.toHaveBeenCalled();
    },
  );

  // S51_DYNAMIC_REFUSAL:gmail-label-read-client
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "constructs no Gmail read client for an apply while runtime state is %s",
    async (status) => {
      runtimeSuspension.current = { status };
      const { createClient, service } = harness({
        assertRuntimeActionExecutable: assertProductionRuntimeActionExecutable,
      });

      await expect(service().applyThreadLabel("thread-1", labelInput)).rejects.toThrow();
      expect(createClient).not.toHaveBeenCalled();
    },
  );

  // S51_DYNAMIC_REFUSAL:gmail-label-mutation-client
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "constructs no Gmail mutation client for a restore while runtime state is %s",
    async (status) => {
      const { client, createClient, service } = harness({
        assertRuntimeActionExecutable: async (action) => {
          // Clear at apply time, suspended by the time the correction is confirmed.
          if (runtimeSuspension.current.status !== "clear") {
            await assertProductionRuntimeActionExecutable(action);
          }
        },
      });
      await service().applyThreadLabel("thread-1", labelInput);
      const mutationsBefore = client.mutations.length;
      createClient.mockClear();
      runtimeSuspension.current = { status };

      await expect(
        service().restoreThreadLabel("thread-1", labelInput),
      ).rejects.toThrow();
      expect(createClient).not.toHaveBeenCalled();
      expect(client.mutations).toHaveLength(mutationsBefore);
    },
  );

  it("refuses an unlinked thread, a wrong lane, and drifted source refs", async () => {
    const { client, service } = harness();

    await expect(
      service().applyThreadLabel("other-thread", labelInput),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service().applyThreadLabel("thread-1", {
        ...labelInput,
        context: context({
          lane: "renewals",
          entityType: "renewal_run",
          purpose: "renewal_tenant",
        }),
      }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      service().applyThreadLabel("thread-1", {
        ...labelInput,
        context: context({ sourceRefs: ["maintenance_ticket:forged"] }),
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(client.mutations).toEqual([]);
  });

  it("refuses a Gmail client bound to any mailbox other than the signed-in actor", async () => {
    const { service } = harness({ client: new FakeLabelClient("dan@pmikcmetro.com") });

    await expect(
      service().applyThreadLabel("thread-1", labelInput),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses an unprovisioned governed label without creating one or claiming the attempt", async () => {
    const client = new FakeLabelClient();
    client.provisioned = ["Waiting on Outside"];
    const { firestore, service } = harness({ client });

    await expect(service().applyThreadLabel("thread-1", labelInput)).rejects.toThrow(
      /not provisioned in this mailbox/,
    );
    expect(client.mutations).toEqual([]);
    // Nothing was prepared, so a later apply after provisioning still gets its full attempt.
    await expect(getActionExecution(actor, executionId, firestore)).rejects.toThrow();
  });

  it("refuses a label outside the governed allowlist and an unapproved rule", async () => {
    const { client, service } = harness();

    for (const input of [
      { ...labelInput, label: "Arbitrary label" },
      { ...labelInput, reason: "" },
      { ...labelInput, ruleRef: "invented-rule:v1" },
    ]) {
      await expect(
        service().applyThreadLabel("thread-1", input as never),
      ).rejects.toBeInstanceOf(Error);
    }
    expect(client.mutations).toEqual([]);
  });
});

describe("gmail.label.apply — terminal states and A2", () => {
  it("records a definitive failure and emits exactly one value-free A2 line", async () => {
    const client = new FakeLabelClient();
    client.mutationError = new GmailRuntimeError("refused", 400, false);
    const { attention, firestore, service } = harness({ client });

    await expect(service().applyThreadLabel("thread-1", labelInput)).rejects.toThrow(
      /refused the governed label change/,
    );

    const execution = await getActionExecution(actor, executionId, firestore);
    expect(execution).toMatchObject({
      state: "Failed",
      attempt_count: 1,
      last_error_code: "gmail_label_provider_refused",
    });
    expect(attention).toEqual([
      {
        marker: "LIVE_EFFECT_REQUIRES_ATTENTION",
        action_key: "gmail.label.apply",
        execution_id: executionId,
        state: "failed",
        data_mode: "live",
      },
    ]);
    // The A2 payload is exactly five approved fields — no reason, thread, mailbox, or label value.
    const emitted = JSON.stringify(attention);
    for (const forbidden of [
      labelInput.reason,
      actor.email,
      "thread-1",
      "Waiting on Team",
    ]) {
      expect(emitted).not.toContain(forbidden);
    }
  });

  it("records an ambiguous outcome for an indefinite provider error", async () => {
    const client = new FakeLabelClient();
    client.mutationError = new GmailRuntimeError("timeout", 504);
    const { attention, firestore, service } = harness({ client });

    await expect(
      service().applyThreadLabel("thread-1", labelInput),
    ).rejects.toBeInstanceOf(GmailAmbiguousLabelError);

    expect(await getActionExecution(actor, executionId, firestore)).toMatchObject({
      state: "Needs reconciliation",
      attempt_count: 1,
    });
    expect(attention).toEqual([expect.objectContaining({ state: "ambiguous" })]);
  });

  it("treats a readback that does not match the reviewed set as ambiguous, never as success", async () => {
    const client = new FakeLabelClient();
    client.readbackLabelIds = ["INBOX", LABEL_IDS["Dan Decision"]];
    const { firestore, service } = harness({ client });

    await expect(
      service().applyThreadLabel("thread-1", labelInput),
    ).rejects.toBeInstanceOf(GmailAmbiguousLabelError);

    expect(await getActionExecution(actor, executionId, firestore)).toMatchObject({
      state: "Needs reconciliation",
      last_error_code: "gmail_label_readback_ambiguous",
    });
  });

  it("refuses a second attempt after a definitive failure instead of re-mutating", async () => {
    const client = new FakeLabelClient();
    client.mutationError = new GmailRuntimeError("refused", 400, false);
    const { attention, firestore, service } = harness({ client });
    await expect(service().applyThreadLabel("thread-1", labelInput)).rejects.toThrow();
    // Whatever refused the first attempt is now resolved; the consumed attempt still stands.
    client.mutationError = null;

    await expect(service().applyThreadLabel("thread-1", labelInput)).rejects.toThrow(
      /already has an attempt/,
    );

    expect(client.mutations).toHaveLength(1);
    expect(await getActionExecution(actor, executionId, firestore)).toMatchObject({
      state: "Failed",
      attempt_count: 1,
    });
    // The failed transition committed once, so it raised attention once.
    expect(attention).toHaveLength(1);
  });

  it("emits no A2 line in the Test lane", async () => {
    const client = new FakeLabelClient();
    client.mutationError = new GmailRuntimeError("refused", 400, false);
    const { attention, service } = harness({ client, dataMode: "test" });

    await expect(service().applyThreadLabel("thread-1", labelInput)).rejects.toThrow();

    expect(attention).toEqual([]);
  });

  it("reconciles an ambiguous attempt read-only and never mutates a second time", async () => {
    const client = new FakeLabelClient();
    client.mutationError = new GmailRuntimeError("timeout", 504);
    const { attention, firestore, service } = harness({ client });
    await expect(service().applyThreadLabel("thread-1", labelInput)).rejects.toThrow();
    // The effect had in fact landed at Gmail before the ambiguous response.
    client.mutationError = null;
    client.threadLabelIds = ["INBOX", LABEL_IDS["Waiting on Team"]];

    const reconciled = await service().applyThreadLabel("thread-1", labelInput);

    expect(reconciled).toMatchObject({ status: "reconciled", duplicate: true });
    expect(client.mutations).toHaveLength(1);
    expect(await getActionExecution(actor, executionId, firestore)).toMatchObject({
      state: "Succeeded",
      attempt_count: 1,
    });
    // One terminal transition, one A2 line: reconciliation to success adds none.
    expect(attention).toHaveLength(1);
  });

  it("keeps an unconfirmed attempt open when reconciliation cannot see the effect", async () => {
    const client = new FakeLabelClient();
    client.mutationError = new GmailRuntimeError("timeout", 504);
    const { service } = harness({ client });
    await expect(service().applyThreadLabel("thread-1", labelInput)).rejects.toThrow();
    client.mutationError = null;
    client.threadLabelIds = ["INBOX"];

    const outcome = await service().applyThreadLabel("thread-1", labelInput);

    expect(outcome).toMatchObject({ status: "needs_reconciliation", duplicate: false });
    expect(client.mutations).toHaveLength(1);
  });

  it("reports a settled effect whose audit projection failed rather than failing the effect", async () => {
    const { client, firestore, service } = harness({ failAudit: true });

    const result = await service().applyThreadLabel("thread-1", labelInput);

    expect(result).toMatchObject({ status: "settled", auditRecorded: false });
    expect(client.mutations).toHaveLength(1);
    expect(await getActionExecution(actor, executionId, firestore)).toMatchObject({
      state: "Succeeded",
    });
  });
});

describe("gmail.label.apply — restoration of the prior governed label set", () => {
  it("removes a label the thread did not previously hold", async () => {
    const { client, service } = harness();
    await service().applyThreadLabel("thread-1", labelInput);
    expect(client.threadLabelIds).toContain(LABEL_IDS["Waiting on Team"]);

    const restored = await service().restoreThreadLabel("thread-1", labelInput);

    expect(restored).toMatchObject({
      status: "settled",
      kind: "restore",
      governedLabels: [],
    });
    expect(client.mutations.at(-1)).toEqual({
      threadId: "thread-1",
      addLabelIds: [],
      removeLabelIds: [LABEL_IDS["Waiting on Team"]],
    });
    expect(client.threadLabelIds).not.toContain(LABEL_IDS["Waiting on Team"]);
  });

  it("keeps a label the thread already held before the app touched it", async () => {
    const client = new FakeLabelClient();
    client.threadLabelIds = ["INBOX", LABEL_IDS["Waiting on Team"]];
    const { service } = harness({ client });
    await service().applyThreadLabel("thread-1", labelInput);

    const restored = await service().restoreThreadLabel("thread-1", labelInput);

    expect(restored.governedLabels).toEqual(["Waiting on Team"]);
    expect(client.threadLabelIds).toContain(LABEL_IDS["Waiting on Team"]);
  });

  it("earns its own single attempt and its own duplicate evidence", async () => {
    const { client, service } = harness();
    await service().applyThreadLabel("thread-1", labelInput);
    await service().restoreThreadLabel("thread-1", labelInput);
    const mutationCount = client.mutations.length;

    const replay = await service().restoreThreadLabel("thread-1", labelInput);

    expect(replay).toMatchObject({ kind: "restore", duplicate: true });
    expect(client.mutations).toHaveLength(mutationCount);
  });
});

describe("gmail.label.apply — durable snapshot integrity", () => {
  it("refuses a forged snapshot whose immutable facts were edited after preparation", async () => {
    const { db, firestore, service } = harness();
    await service().applyThreadLabel("thread-1", labelInput);
    const path = `gmail_label_effects/${executionId}`;
    const stored = db.store.get(path)!;
    db.seed(path, { ...stored, priorGovernedLabels: ["Dan Decision"] });

    await expect(
      new FirestoreGmailLabelEffectStore(firestore).get(executionId),
    ).rejects.toThrow(/integrity check/);
  });

  it("refuses to bind one execution id to a different effect", async () => {
    const { db, firestore, service } = harness();
    await service().applyThreadLabel("thread-1", labelInput);
    const stored = db.store.get(
      `gmail_label_effects/${executionId}`,
    ) as unknown as GmailLabelSnapshotDraft;

    await expect(
      new FirestoreGmailLabelEffectStore(firestore).persistPrepared(actor, {
        ...stored,
        labelId: "Label_forged",
      }),
    ).rejects.toThrow(/already bound to a different effect/);
  });

  it("cannot settle an effect whose provider start was never fenced", async () => {
    const { db, firestore, service } = harness();
    await service().applyThreadLabel("thread-1", labelInput);
    const path = `gmail_label_effects/${executionId}`;
    const stored = db.store.get(path)!;
    db.seed(path, { ...stored, state: "prepared" });

    await expect(
      new FirestoreGmailLabelEffectStore(firestore).markSettled({
        s20ExecutionId: executionId,
        snapshotHash: String(stored.snapshotHash),
        observedGovernedLabelIds: [LABEL_IDS["Waiting on Team"]],
      }),
    ).rejects.toThrow(/before its provider start is recorded/);
  });

  it("refuses a snapshot for an execution id it does not belong to", async () => {
    const { firestore } = harness();

    await expect(
      new FirestoreGmailLabelEffectStore(firestore).get("not-an-execution-id"),
    ).rejects.toThrow(/execution identity is invalid/);
  });
});

describe("gmail.label.apply — workflow matrix", () => {
  it("has no dependency on the permanently disabled direct renewal send", async () => {
    const { LEASE_EXECUTION_DEFINITION_MAP } =
      await import("@/lib/lease-renewal/execution/matrix");
    const definition = LEASE_EXECUTION_DEFINITION_MAP.get("gmail.label.apply");

    expect(definition).toMatchObject({ risk: "Low", dependsOn: [] });
    expect(definition?.dependsOn).not.toContain("gmail.renewal_notice.send");
  });

  it("keeps the governed allowlist at exactly the four Inbox-Zero labels", () => {
    expect(GMAIL_GOVERNED_LABELS).toEqual([
      "Waiting on Outside",
      "Waiting on Team",
      "Dan Decision",
      "Draft Ready",
    ]);
  });
});

describe("GmailHubError contract", () => {
  it("reports the ambiguous label error as a conflict", () => {
    const error = new GmailAmbiguousLabelError("ambiguous");
    expect(error).toBeInstanceOf(GmailHubError);
    expect(error.status).toBe(409);
  });
});
