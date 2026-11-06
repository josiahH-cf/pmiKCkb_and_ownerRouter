// S249 ARCH-S249-3 / ARCH-S249-4 / AC-S249-3 / AC-S249-4: batch preparation for one lease, and the
// server fences of the automatic start. Every dependency is an in-memory fake; nothing here reaches
// a provider, a mailbox or a store. Synthetic values only.
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { KickoffPreparationRecord } from "@/lib/firestore/renewal-kickoff-preparations";
import {
  runKickoffPreparation,
  type KickoffLeaseRead,
  type KickoffLookupAnswer,
  type KickoffPreparationDeps,
} from "@/lib/lease-renewal/kickoff-preparation-service";

const STAFF: AuthenticatedUser = {
  uid: "synthetic-editor",
  email: "synthetic-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
} as AuthenticatedUser;
const CANARY: AuthenticatedUser = {
  ...STAFF,
  uid: "synthetic-canary",
  email: "canary-editor@pmikcmetro.com",
};

const LEASE: KickoffLeaseRead = {
  cycleDateIso: "2026-12-31",
  inWorkingBatch: true,
  workRecordCycleId: "5b0c1d2e-3f40-4a51-8b62-7c8d9e0f1a2b",
  housingAssistance: null,
};

const LIKELY: KickoffLookupAnswer = {
  ok: true,
  confidence: "Likely",
  observationId: "obs-1",
  cached: false,
};

function harness(
  overrides: Partial<{
    enabled: boolean;
    lease: KickoffLeaseRead | null;
    stored: boolean;
    allowance: boolean;
    answer: KickoffLookupAnswer;
  }> = {},
) {
  const claims = new Map<string, KickoffPreparationRecord>();
  const lookup = vi.fn(async () => overrides.answer ?? LIKELY);
  const release = vi.fn(async (input: { leaseId: string; cycleKey: string }) => {
    claims.delete(`${input.leaseId}_${input.cycleKey}`);
  });
  const deps: KickoffPreparationDeps = {
    automaticStartEnabled: async () => overrides.enabled ?? true,
    readLease: async () => (overrides.lease === undefined ? LEASE : overrides.lease),
    storedComparison: async () => overrides.stored ?? false,
    allowanceReached: async () => overrides.allowance ?? false,
    claim: vi.fn(async (input) => {
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
    }),
    settle: vi.fn(async (input) => {
      const key = `${input.leaseId}_${input.cycleKey}`;
      const prior = claims.get(key);
      if (prior)
        claims.set(key, { ...prior, state: input.state, billed: input.billed ?? null });
    }),
    release,
    lookup,
  };
  return { deps, lookup, release, claims };
}

const automatic = { leaseId: "9101", trigger: "automatic" as const, operationId: "op-1" };
const staff = { leaseId: "9101", trigger: "staff" as const, operationId: "op-1" };

describe("S249 ARCH-S249-4 server fences: no lookup outside the approved limits", () => {
  it("refuses a verification identity before anything is read or looked up", async () => {
    const { deps, lookup } = harness();
    const read = vi.spyOn(deps, "readLease");
    const result = await runKickoffPreparation(CANARY, staff, deps);
    expect(result).toMatchObject({ status: "refused", code: "verification_identity" });
    expect(read).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses the automatic start while the reviewed setting is off; a staff click still runs", async () => {
    const off = harness({ enabled: false });
    expect(await runKickoffPreparation(STAFF, automatic, off.deps)).toMatchObject({
      status: "refused",
      code: "automatic_start_off",
    });
    expect(off.lookup).not.toHaveBeenCalled();
    expect(await runKickoffPreparation(STAFF, staff, off.deps)).toMatchObject({
      status: "prepared",
      billed: true,
    });
    expect(off.lookup).toHaveBeenCalledTimes(1);
  });

  it("refuses the automatic start for a lease outside the working batch", async () => {
    const { deps, lookup } = harness({ lease: { ...LEASE, inWorkingBatch: false } });
    expect(await runKickoffPreparation(STAFF, automatic, deps)).toMatchObject({
      status: "refused",
      code: "outside_working_batch",
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("at the allowance makes no lookup and takes no claim", async () => {
    const { deps, lookup } = harness({ allowance: true });
    expect(await runKickoffPreparation(STAFF, automatic, deps)).toMatchObject({
      status: "allowance_reached",
      message: "Comparison not run: monthly allowance reached",
    });
    expect(deps.claim).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses a lease and cycle that already hold a claim", async () => {
    const { deps, lookup } = harness();
    await runKickoffPreparation(STAFF, automatic, deps);
    const again = await runKickoffPreparation(
      STAFF,
      { ...automatic, operationId: "op-2" },
      deps,
    );
    expect(again).toMatchObject({ status: "already_claimed", billed: false });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("S251 seam: a lease held back for housing assistance asks the predicate before any lookup", async () => {
    const { deps, lookup } = harness({
      lease: { ...LEASE, housingAssistance: { program: "Example Housing Office" } },
    });
    expect(await runKickoffPreparation(STAFF, automatic, deps)).toMatchObject({
      status: "held_back",
    });
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("S249 ARCH-S249-3 batch preparation: one billed lookup per lease per cycle", () => {
  it("reuses a stored comparison with no claim and no lookup (R-S249-2)", async () => {
    const { deps, lookup } = harness({ stored: true });
    expect(await runKickoffPreparation(STAFF, staff, deps)).toMatchObject({
      status: "reused",
      billed: false,
    });
    expect(deps.claim).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("five runs for the same lease and cycle make exactly one billed lookup", async () => {
    const { deps, lookup } = harness();
    const results = [];
    for (const [index, trigger] of (
      ["automatic", "staff", "automatic", "staff", "automatic"] as const
    ).entries())
      results.push(
        await runKickoffPreparation(
          STAFF,
          { leaseId: "9101", trigger, operationId: `op-${index}` },
          deps,
        ),
      );
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(results.filter((result) => result.billed)).toHaveLength(1);
    expect(results.slice(1).every((result) => result.status === "already_claimed")).toBe(
      true,
    );
  });

  it("a lookup refused at the allowance releases its claim, so the lease can be prepared later", async () => {
    const { deps, release, claims } = harness({
      answer: { ok: true, reason: "out_of_allowance", confidence: "Needs Verification" },
    });
    expect(await runKickoffPreparation(STAFF, automatic, deps)).toMatchObject({
      status: "allowance_reached",
    });
    expect(release).toHaveBeenCalledTimes(1);
    expect(claims.size).toBe(0);
  });

  it("nothing usable keeps the claim and offers own figures (S121 stays separate)", async () => {
    const { deps, claims } = harness({
      answer: { ok: true, reason: "too_few_comps", confidence: "Needs Verification" },
    });
    const result = await runKickoffPreparation(STAFF, automatic, deps);
    expect(result.status).toBe("no_usable");
    expect(result.message).toMatch(/Enter your own comparison figures/);
    expect([...claims.values()][0]?.state).toBe("no_usable");
  });

  it("a lookup that does not answer is never repeated by itself", async () => {
    const { deps } = harness();
    const silent = vi.fn(async (): Promise<KickoffLookupAnswer> => {
      throw new Error("synthetic timeout");
    });
    const fenced = { ...deps, lookup: silent };
    expect((await runKickoffPreparation(STAFF, automatic, fenced)).status).toBe("failed");
    expect(
      (await runKickoffPreparation(STAFF, { ...automatic, operationId: "op-9" }, fenced))
        .status,
    ).toBe("already_claimed");
    expect(silent).toHaveBeenCalledTimes(1);
  });
});

describe("S249 AC-S249-4 no preparation path creates a draft, send, schedule or provider write", () => {
  const sources = [
    "lib/lease-renewal/kickoff-preparation-service.ts",
    "lib/lease-renewal/kickoff-preparation-runtime.ts",
    "app/api/lease-renewal/kickoff-preparation/route.ts",
    "lib/firestore/renewal-kickoff-preparations.ts",
    "components/lease-renewal/RenewalKickoffPreparation.tsx",
  ].map((path) => [path, readFileSync(path, "utf8")] as const);
  it("imports no Gmail, sequence, draft, schedule or provider write module", () => {
    for (const [path, text] of sources) {
      const imports = [...text.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
      for (const name of imports)
        expect(
          /gmail|sequence|draft|schedule|writeback|external-execution|action-gate/.test(
            name!,
          ),
          `${path} imports ${name}`,
        ).toBe(false);
    }
  });

  it("the only billed call it can reach is the existing market-comps route", () => {
    const route = sources.find(([path]) => path.endsWith("route.ts"))![1];
    expect(route).toContain('from "@/app/api/lease-renewal/market-comps/route"');
    expect(route).not.toMatch(/RentCastMarketCompProvider|fetch\(/);
  });
});
