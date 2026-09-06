import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import { ExternalActionOrchestrator } from "@/lib/external-execution/orchestrator";
import type {
  ExternalExecutionRecord,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  LEASE_EXECUTION_ACTIONS,
  LEASE_EXECUTION_DEFINITION_MAP,
} from "@/lib/lease-renewal/execution/matrix";
import { buildSyntheticActionInput } from "@/tests/helpers/synthetic-execution";
import {
  renewalAttemptFromExecutionRecord,
  RENEWAL_CONTINUATION_MIN_AGE_MS,
  applyRenewalReconciliations,
  projectRenewalAttemptSummary,
  reconcileOrphanedRenewalAttempts,
  selectOrphanedRenewalAttempts,
  type RenewalAttemptRecord,
} from "@/lib/lease-renewal/execution/attempt-continuation";
import { RENEWAL_EFFECT_RECONCILE_MIN_AGE_MS } from "@/lib/lease-renewal/execution/reconcile-age";
import { projectWorkspaceAttemptSummary } from "@/lib/lease-renewal/execution/workspace-continuation";
import type { RenewalWritebackProposal } from "@/lib/lease-renewal/writeback/proposal-contract";

// S107: a confirmed effect finishes server-side and is recovered read-only on the next load. No
// scheduler, worker, queue, or blind retry is added; an uncertain attempt names the operator's next
// action instead of retrying itself.

const NOW = Date.parse("2026-09-03T12:00:00.000Z");

function attempt(overrides: Partial<RenewalAttemptRecord> = {}): RenewalAttemptRecord {
  return {
    executionId: "exec-1",
    actionKey: "rentvine.lease.renewal_dates.update",
    state: "running",
    attemptCount: 1,
    updatedAtIso: new Date(NOW - RENEWAL_CONTINUATION_MIN_AGE_MS - 1_000).toISOString(),
    ...overrides,
  };
}

describe("S107 load-time reconciliation is read-only (ARCH-S107-2 / AC-S107-1)", () => {
  it("selects only covered, claimed, unresolved attempts older than the minimum age", () => {
    const attempts: RenewalAttemptRecord[] = [
      attempt({ executionId: "old-running" }),
      attempt({ executionId: "old-ambiguous", state: "ambiguous" }),
      attempt({
        executionId: "young-running",
        updatedAtIso: new Date(NOW - 1_000).toISOString(),
      }),
      attempt({ executionId: "succeeded", state: "succeeded" }),
      attempt({ executionId: "unclaimed", attemptCount: 0, state: "ready" }),
      attempt({ executionId: "other-family", actionKey: "gmail.thread.reply" }),
    ];
    expect(
      selectOrphanedRenewalAttempts(attempts, NOW).map((entry) => entry.executionId),
    ).toEqual(["old-running", "old-ambiguous"]);
  });

  it("covers exactly the RentVine and operating-Sheet families the loader can read", () => {
    const attempts = [
      attempt({
        executionId: "s97",
        actionKey: "rentvine.lease.recurring_charge.create",
      }),
      attempt({
        executionId: "s98",
        actionKey: "google_sheets.renewal_checklist.row_append",
      }),
      // No Dotloop attempt is ever loaded today (S34 has no runtime effect route), so the
      // continuation does not claim the family either.
      attempt({ executionId: "s34", actionKey: "dotloop.loop.create_from_template" }),
    ];
    expect(
      selectOrphanedRenewalAttempts(attempts, NOW).map((entry) => entry.executionId),
    ).toEqual(["s97", "s98"]);
  });

  it("reads the reconcile age from the one constant the S97/S98 services use", () => {
    expect(RENEWAL_CONTINUATION_MIN_AGE_MS).toBe(RENEWAL_EFFECT_RECONCILE_MIN_AGE_MS);
    expect(RENEWAL_CONTINUATION_MIN_AGE_MS).toBe(2 * 60 * 1_000);
  });

  it("projects an orphaned running attempt as needing an Admin's reconciliation, never settling it", () => {
    const summary = projectRenewalAttemptSummary({
      leaseId: "4821",
      attempts: [attempt({ executionId: "orphan" })],
      nowMs: NOW,
    });
    expect(summary.reconcilableCount).toBe(1);
    expect(summary.inFlight).toBe(true);
    expect(summary.lastAttemptState).toBe("running");
    expect(summary.nextAction).toMatch(/An Admin reconciles it from its exact receipt/);
    // A young running attempt is simply in flight.
    const young = projectRenewalAttemptSummary({
      leaseId: "4821",
      attempts: [attempt({ updatedAtIso: new Date(NOW - 1_000).toISOString() })],
      nowMs: NOW,
    });
    expect(young.reconcilableCount).toBe(0);
    expect(young.nextAction).toMatch(/still finishing/);
  });

  it("loads the workspace summary from the store without a single write (AC-S107-1)", async () => {
    const record = {
      id: "s97:4821:preview-1:effect-1",
      workflowId: "lease:4821",
      actionKey: "rentvine.lease.renewal_dates.update",
      state: "running" as const,
      attemptCount: 1 as const,
      previewHash: "preview-1",
      createdAt: new Date(NOW - RENEWAL_CONTINUATION_MIN_AGE_MS - 5_000).toISOString(),
      updatedAt: new Date(NOW - RENEWAL_CONTINUATION_MIN_AGE_MS - 5_000).toISOString(),
    };
    const writes: string[] = [];
    const store = {
      persistence: "memory" as const,
      get: async (id: string) =>
        id === record.id ? (record as unknown as ExternalExecutionRecord) : null,
      create: async () => {
        writes.push("create");
        throw new Error("write attempted");
      },
      claim: async () => {
        writes.push("claim");
        throw new Error("write attempted");
      },
      finish: async () => {
        writes.push("finish");
        throw new Error("write attempted");
      },
      fail: async () => {
        writes.push("fail");
        throw new Error("write attempted");
      },
    };
    const proposal = {
      leaseId: "4821",
      previewHash: "preview-1",
      effects: [{ effectHash: "effect-1", actionKey: record.actionKey }],
    } as unknown as RenewalWritebackProposal;
    const summary = await projectWorkspaceAttemptSummary({
      leaseId: "4821",
      store,
      rentvineProposal: proposal,
      nowMs: NOW,
    });
    expect(writes).toEqual([]);
    expect(summary.reconcilableCount).toBe(1);
    expect(summary.nextAction).toMatch(/An Admin reconciles it/);
  });

  it("keeps the continuation modules free of any effect-family service import", () => {
    for (const file of [
      "lib/lease-renewal/execution/attempt-continuation.ts",
      "lib/lease-renewal/execution/workspace-continuation.ts",
      "lib/lease-renewal/execution/attempt-loader.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (match) => match[1],
      );
      expect(
        imports.filter((specifier) =>
          /execution-service|\/live"?$|action-gate/.test(specifier),
        ),
        file,
      ).toEqual([]);
    }
  });

  it("reconciles each orphan through its own injected operation and never writes", async () => {
    const calls: string[] = [];
    const results = await reconcileOrphanedRenewalAttempts({
      leaseId: "4821",
      attempts: [
        attempt({ executionId: "exec-1" }),
        attempt({ executionId: "exec-2", state: "ambiguous" }),
      ],
      nowMs: NOW,
      reconcile: async (entry) => {
        calls.push(entry.executionId);
        return entry.executionId === "exec-1" ? "succeeded" : "ambiguous";
      },
    });
    expect(calls).toEqual(["exec-1", "exec-2"]);
    expect(results).toEqual([
      {
        executionId: "exec-1",
        actionKey: "rentvine.lease.renewal_dates.update",
        outcome: "succeeded",
      },
      {
        executionId: "exec-2",
        actionKey: "rentvine.lease.renewal_dates.update",
        outcome: "ambiguous",
      },
    ]);
  });

  it("leaves an attempt unresolved when its reconcile fails rather than inventing an outcome", async () => {
    const results = await reconcileOrphanedRenewalAttempts({
      leaseId: "4821",
      attempts: [attempt()],
      nowMs: NOW,
      reconcile: async () => {
        throw new Error("provider unavailable");
      },
    });
    expect(results[0].outcome).toBe("unresolved");
    expect(applyRenewalReconciliations([attempt()], results)[0].state).toBe("running");
  });

  it("applies only resolved outcomes to the current render", () => {
    const applied = applyRenewalReconciliations(
      [attempt({ executionId: "exec-1" }), attempt({ executionId: "exec-2" })],
      [
        {
          executionId: "exec-1",
          actionKey: "rentvine.lease.renewal_dates.update",
          outcome: "succeeded",
        },
      ],
    );
    expect(applied.map((entry) => entry.state)).toEqual(["succeeded", "running"]);
  });
});

describe("S107 one consolidated attempt summary (BEH-S107-1)", () => {
  it("reports the last confirmed step, attempt time, state, and next action", () => {
    const summary = projectRenewalAttemptSummary({
      leaseId: "4821",
      nowMs: NOW,
      attempts: [
        attempt({
          executionId: "exec-1",
          state: "succeeded",
          updatedAtIso: "2026-09-03T10:00:00.000Z",
        }),
        attempt({
          executionId: "exec-2",
          actionKey: "google_sheets.renewal_checklist.row_append",
          state: "succeeded",
          updatedAtIso: "2026-09-03T11:00:00.000Z",
        }),
      ],
    });
    expect(summary).toMatchObject({
      leaseId: "4821",
      lastConfirmedStep: "google_sheets.renewal_checklist.row_append",
      lastAttemptAtIso: "2026-09-03T11:00:00.000Z",
      lastAttemptState: "succeeded",
      blocker: null,
      inFlight: false,
    });
    expect(summary.nextAction).toMatch(/recorded with its receipt/i);
  });

  it("names the uncertain attempt and its next action even when a later step succeeded", () => {
    const summary = projectRenewalAttemptSummary({
      leaseId: "4821",
      nowMs: NOW,
      attempts: [
        attempt({
          executionId: "exec-1",
          state: "ambiguous",
          blocker: "The provider response was lost.",
          updatedAtIso: "2026-09-03T10:00:00.000Z",
        }),
        attempt({
          executionId: "exec-2",
          actionKey: "google_sheets.renewal_checklist.row_append",
          state: "succeeded",
          updatedAtIso: "2026-09-03T11:00:00.000Z",
        }),
      ],
    });
    expect(summary.blocker).toBe("The provider response was lost.");
    expect(summary.nextAction).toMatch(/uncertain/i);
    expect(summary.nextAction).not.toMatch(/retry automatically|will retry/i);
  });

  it("says nothing is in flight when the lease has no covered attempt", () => {
    expect(
      projectRenewalAttemptSummary({ leaseId: "4821", nowMs: NOW, attempts: [] }),
    ).toMatchObject({
      lastConfirmedStep: null,
      lastAttemptState: null,
      nextAction: "Nothing is in flight for this lease.",
      reconcilableCount: 0,
      inFlight: false,
    });
  });

  it("keeps one lease's uncertainty out of another lease's summary (BEH-S107-3)", () => {
    const shared = [
      attempt({ executionId: "lease-a", state: "ambiguous" }),
      attempt({ executionId: "lease-b", state: "succeeded" }),
    ];
    const leaseA = projectRenewalAttemptSummary({
      leaseId: "A",
      nowMs: NOW,
      attempts: [shared[0]],
    });
    const leaseB = projectRenewalAttemptSummary({
      leaseId: "B",
      nowMs: NOW,
      attempts: [shared[1]],
    });
    expect(leaseA.lastAttemptState).toBe("ambiguous");
    expect(leaseB.lastAttemptState).toBe("succeeded");
    expect(leaseB.blocker).toBeNull();
  });
});

describe("S107 adds no scheduler, worker, or blind retry (AC-S107-4)", () => {
  it("keeps the continuation module free of timers, queues, and retry loops", () => {
    const code = readFileSync(
      "lib/lease-renewal/execution/attempt-continuation.ts",
      "utf8",
    ).replaceAll(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(code).not.toMatch(
      /setInterval|setTimeout|cloudtasks|pubsub|CloudScheduler|cron|while\s*\(true\)/i,
    );
    expect(code).not.toMatch(/retry/i);
  });

  it("never lets a renewal effect route abort its provider work on client disconnect (ARCH-S107-1)", () => {
    const routes = renewalEffectRoutes();
    expect(routes.length).toBeGreaterThan(5);
    for (const path of routes) {
      const source = readFileSync(path, "utf8");
      // Forwarding the request's abort signal into an execution path would cancel a confirmed
      // provider call mid-flight and leave an attempt with no receipt.
      expect(source, path).not.toMatch(/request\.signal|AbortController|AbortSignal/);
    }
  });
});

function renewalEffectRoutes(): string[] {
  const root = join(process.cwd(), "app", "api", "lease-renewal");
  const found: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "route.ts") found.push(full);
    }
  };
  walk(root);
  return found;
}

describe("S107 abort, replay, and isolation fixtures (ARCH-S107-1 / BEH-S107-2 / AC-S107-3)", () => {
  const DRAFT_KEY = "gmail.renewal_notice.draft_create";
  const SEND_KEY = "gmail.renewal_notice.send";
  const EFFECT_KEY = "google_sheets.renewal_checklist.row_append";

  function harness() {
    const store = new MemoryExternalExecutionStore();
    const providerCalls = new Map<string, number>();
    let failEffect = false;
    const executor: ExternalExecutor = {
      async execute(input) {
        providerCalls.set(input.actionKey, (providerCalls.get(input.actionKey) ?? 0) + 1);
        if (input.actionKey === EFFECT_KEY && failEffect) {
          throw new Error("provider connection dropped after the call");
        }
        return {
          actionKey: input.actionKey,
          providerRef: `synthetic:${input.workflowId}:${input.actionId}`,
          resultHash: createHash("sha256")
            .update(`${input.workflowId}:${input.actionId}`)
            .digest("hex"),
          reconciled: false,
          createdAt: new Date().toISOString(),
        };
      },
      async reconcile() {
        return null;
      },
    };
    const orchestrator = new ExternalActionOrchestrator(
      LEASE_EXECUTION_DEFINITION_MAP,
      store,
      new Map([DRAFT_KEY, SEND_KEY, EFFECT_KEY].map((key) => [key, executor])),
      {
        allowFakeContracts: true,
        isRuntimeExecutable: async () => true,
        registry: ACTION_REGISTRY_SEED,
      },
    );
    const actionFor = (key: string, workflowId: string) => ({
      ...buildSyntheticActionInput(
        "lease",
        key,
        LEASE_EXECUTION_ACTIONS.indexOf(key as never),
        LEASE_EXECUTION_DEFINITION_MAP.get(key)!,
      ),
      workflowId,
    });
    // The Sheet append sits behind the notice chain; a fixture must satisfy that chain honestly
    // rather than weaken the dependency rule.
    const prepareEffect = async (workflowId: string) => {
      for (const key of [DRAFT_KEY, SEND_KEY]) {
        const action = actionFor(key, workflowId);
        const prepared = await orchestrator.prepare(action, [...store.records.values()]);
        if (prepared.state !== "ready") throw new Error(`${key}: ${prepared.blocker}`);
        await orchestrator.execute(action, prepared.previewHash);
      }
      const action = actionFor(EFFECT_KEY, workflowId);
      const prepared = await orchestrator.prepare(action, [...store.records.values()]);
      return { action, prepared };
    };
    return {
      store,
      orchestrator,
      prepareEffect,
      failEffectCall: () => {
        failEffect = true;
      },
      effectRecord: (workflowId: string) =>
        [...store.records.values()].find(
          (record) => record.workflowId === workflowId && record.actionKey === EFFECT_KEY,
        ) ?? null,
      effectCalls: () => providerCalls.get(EFFECT_KEY) ?? 0,
    };
  }

  it("leaves no attempt claimed when the request ends before the provider call (AC-S107-3)", async () => {
    const rig = harness();
    const { prepared } = await rig.prepareEffect("lease-s107-a");
    expect(prepared.state).toBe("ready");
    // The operator's connection ends here: `execute` is never reached.
    const record = rig.effectRecord("lease-s107-a");
    expect(record).toMatchObject({ state: "ready", attemptCount: 0 });
    expect(record?.receipt).toBeUndefined();
    expect(rig.effectCalls()).toBe(0);
    expect(selectOrphanedRenewalAttempts(attemptsOf(record), Date.now())).toEqual([]);
  });

  it("forwards no request abort signal into any renewal effect route (ARCH-S107-1)", () => {
    // A confirmed effect completes server-side. The proof that an abandoned browser cannot stop it
    // is that no effect route ever hands `request.signal` (or any AbortSignal) to execution.
    for (const file of [
      "app/api/lease-renewal/rentvine-writeback/route.ts",
      "app/api/lease-renewal/operating-sheet/route.ts",
      "app/api/lease-renewal/renewal-notice-draft/route.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split(/\r?\n/)
        .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
        .join("\n");
      expect(source, file).not.toMatch(/request\.signal|AbortSignal|AbortController/);
    }
  });

  it("yields one provider effect and one receipt for concurrent confirmations (BEH-S107-2)", async () => {
    const rig = harness();
    const { action, prepared } = await rig.prepareEffect("lease-s107-a");
    const settled = await Promise.allSettled([
      rig.orchestrator.execute(action, prepared.previewHash),
      rig.orchestrator.execute(action, prepared.previewHash),
    ]);
    expect(settled.some((entry) => entry.status === "fulfilled")).toBe(true);
    expect(rig.effectCalls()).toBe(1);
    const record = rig.effectRecord("lease-s107-a")!;
    expect(record.attemptCount).toBe(1);
    expect(record.receipt).toBeTruthy();
  });

  it("returns the same receipt for a replayed confirmation without a second effect (BEH-S107-2)", async () => {
    const rig = harness();
    const { action, prepared } = await rig.prepareEffect("lease-s107-a");
    const first = await rig.orchestrator.execute(action, prepared.previewHash);
    const replay = await rig.orchestrator.execute(action, prepared.previewHash);
    expect(replay).toMatchObject({ duplicate: true });
    expect(replay.receipt.providerRef).toBe(first.receipt.providerRef);
    expect(rig.effectCalls()).toBe(1);
  });

  it("keeps one lease's ambiguous attempt from changing another lease (BEH-S107-3)", async () => {
    const rig = harness();
    const leaseA = await rig.prepareEffect("lease-s107-a");
    rig.failEffectCall();
    await expect(
      rig.orchestrator.execute(leaseA.action, leaseA.prepared.previewHash),
    ).rejects.toThrow(/ambiguous/i);

    // The second lease prepares and reports its own state through the same shared store.
    const leaseB = await rig.prepareEffect("lease-s107-b");
    expect(leaseB.prepared.state).toBe("ready");
    expect(rig.effectRecord("lease-s107-a")).toMatchObject({ state: "ambiguous" });
    expect(rig.effectRecord("lease-s107-b")).toMatchObject({ state: "ready" });
    expect(
      projectRenewalAttemptSummary({
        leaseId: "lease-s107-b",
        nowMs: Date.now(),
        attempts: attemptsOf(rig.effectRecord("lease-s107-b")),
      }),
    ).toMatchObject({ lastAttemptState: null, blocker: null });
  });
});

function attemptsOf(record: ExternalExecutionRecord | null): RenewalAttemptRecord[] {
  const attempt = renewalAttemptFromExecutionRecord(record);
  return attempt ? [attempt] : [];
}
