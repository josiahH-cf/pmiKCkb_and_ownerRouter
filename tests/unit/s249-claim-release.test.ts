// S249 review fix F: a refusal where nothing was billed releases the per lease and cycle claim,
// so the cycle can still be prepared later; a billed or ambiguous outcome keeps it. Every
// dependency is an in-memory fake; nothing reaches a provider or a store. Synthetic values only.
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { KickoffPreparationRecord } from "@/lib/firestore/renewal-kickoff-preparations";
import {
  runKickoffPreparation,
  type KickoffLookupAnswer,
  type KickoffPreparationDeps,
} from "@/lib/lease-renewal/kickoff-preparation-service";

const STAFF = {
  uid: "synthetic-editor",
  email: "synthetic-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
} as AuthenticatedUser;

// ---- F: a refusal where nothing was billed releases the claim -----------------------------------

function claimHarness(answer: KickoffLookupAnswer & Record<string, unknown>) {
  const claims = new Map<string, KickoffPreparationRecord>();
  const lookup = vi.fn(async () => answer);
  const deps: KickoffPreparationDeps = {
    readLease: async () => ({
      cycleDateIso: "2026-12-31",
      inWorkingBatch: true,
      workRecordCycleId: "5b0c1d2e-3f40-4a51-8b62-7c8d9e0f1a2b",
      housingAssistance: null,
    }),
    storedComparison: async () => false,
    allowanceReached: async () => false,
    claim: async (input) => {
      const key = `${input.leaseId}_${input.cycleKey}`;
      const existing = claims.get(key);
      if (existing)
        return {
          claimed: false as const,
          record: existing,
          sameOperation: existing.operationId === input.operationId,
        };
      const record: KickoffPreparationRecord = {
        leaseId: input.leaseId,
        cycleKey: input.cycleKey,
        state: "claimed",
        trigger: input.trigger,
        actorUid: input.actorUid,
        operationId: input.operationId,
        claimedAt: "2026-11-05T15:00:00.000Z",
        settledAt: null,
        observationId: null,
        billed: null,
        reason: null,
      };
      claims.set(key, record);
      return { claimed: true as const, record };
    },
    settle: async (input) => {
      const key = `${input.leaseId}_${input.cycleKey}`;
      const prior = claims.get(key);
      if (prior)
        claims.set(key, { ...prior, state: input.state, billed: input.billed ?? null });
    },
    release: async (input) => {
      claims.delete(`${input.leaseId}_${input.cycleKey}`);
    },
    lookup,
  };
  return { deps, claims, lookup };
}

const run = (deps: KickoffPreparationDeps, operationId: string) =>
  runKickoffPreparation(STAFF, { leaseId: "9101", trigger: "staff", operationId }, deps);

describe("S249 F: the claim is released only when nothing was billed", () => {
  it("a refusal before the provider was called (runtime suspension) releases the claim; the cycle can be prepared later", async () => {
    const { deps, claims, lookup } = claimHarness({
      ok: false,
      error: 'Action "rentcast.listings.read" is closed by the runtime suspension gate.',
      providerCalled: false,
    });
    const first = await run(deps, "op-1");
    expect(first.status).toBe("failed");
    expect(first.message).toMatch(
      /Nothing was billed, so this lease can be prepared again\./,
    );
    expect(claims.size).toBe(0);
    // Later, a second preparation is not refused as already claimed.
    const second = await run(deps, "op-2");
    expect(second.status).not.toBe("already_claimed");
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("a provider answer it never bills (a non-2xx status) releases the claim", async () => {
    const { deps, claims } = claimHarness({
      ok: true,
      confidence: "Needs Verification",
      reason: "http_error",
      billed: false,
    });
    expect((await run(deps, "op-1")).status).toBe("failed");
    expect(claims.size).toBe(0);
  });

  it("an ambiguous failure (it may have reached the provider) keeps the claim", async () => {
    const { deps, claims } = claimHarness({ ok: false, error: "Server error" });
    expect((await run(deps, "op-1")).status).toBe("failed");
    expect([...claims.values()][0]?.state).toBe("failed");
    expect((await run(deps, "op-2")).status).toBe("already_claimed");
  });

  it("a timeout keeps the claim (the call may have been billed)", async () => {
    const { deps, claims } = claimHarness({
      ok: true,
      confidence: "Needs Verification",
      reason: "timeout",
    });
    await run(deps, "op-1");
    expect(claims.size).toBe(1);
    expect((await run(deps, "op-2")).status).toBe("already_claimed");
  });

  it("a billed outcome keeps the claim", async () => {
    const { deps, claims } = claimHarness({
      ok: true,
      confidence: "Likely",
      observationId: "obs-1",
      billed: true,
      cached: false,
    });
    expect(await run(deps, "op-1")).toMatchObject({ status: "prepared", billed: true });
    expect([...claims.values()][0]?.state).toBe("prepared");
  });

  it("the batch route passes the market-comps route's billed and not-called signals on", () => {
    const route = readFileSync(
      "app/api/lease-renewal/kickoff-preparation/route.ts",
      "utf8",
    );
    expect(route).toContain("payload.providerCalled === false");
    expect(route).toContain("payload.billed");
  });
});
