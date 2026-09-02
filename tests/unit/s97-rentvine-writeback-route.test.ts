import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import { OWNER_PROOF_WINDOW_OPEN_KEYS } from "@/lib/integrations/action-registry-seed";
import type { RenewalWritebackDependencies } from "@/lib/lease-renewal/writeback/execution-service";
import type { RenewalWritebackProposal } from "@/lib/lease-renewal/writeback/proposal-contract";

const mocks = vi.hoisted(() => ({
  user: {
    uid: "admin-1",
    email: "admin@pmikcmetro.com",
    role: "Admin" as string,
  },
  deps: null as RenewalWritebackDependencies | { status: "not_configured" } | null,
  proposals: new Map<string, RenewalWritebackProposal>(),
  gateOpen: false,
  writerCalls: [] as string[],
  projection: vi.fn(async () => ({})),
}));

vi.mock("@/lib/auth/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: vi.fn(async () => mocks.user),
}));

vi.mock("@/lib/environment/descriptor", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/environment/descriptor")>()),
  requireEnvironmentDescriptor: () => ({
    environmentKind: "production",
    dataContext: "live",
    source: "explicit",
  }),
}));

vi.mock("@/lib/lease-renewal/writeback/live", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/lease-renewal/writeback/live")>();
  return {
    ...actual,
    buildLiveRenewalWritebackDeps: () => mocks.deps ?? { status: "not_configured" },
    // The mutating branch stays the REAL per-key committed-seed gate unless a test opens it.
    assertRenewalWritebackExecutionAllowed: async (
      descriptor: Parameters<typeof actual.assertRenewalWritebackExecutionAllowed>[0],
      mode: "mutating" | "recovery",
      actionKey?: string,
    ) => {
      if (mode === "mutating" && mocks.gateOpen) return;
      return actual.assertRenewalWritebackExecutionAllowed(descriptor, mode, actionKey);
    },
  };
});

vi.mock("@/lib/lease-renewal/writeback/proposal-store", () => ({
  saveRenewalWritebackProposal: vi.fn(
    async (_actor: unknown, proposal: RenewalWritebackProposal) => {
      mocks.proposals.set(proposal.leaseId, proposal);
    },
  ),
  getRenewalWritebackProposal: vi.fn(
    async (_actor: unknown, leaseId: string) => mocks.proposals.get(leaseId) ?? null,
  ),
  discardRenewalWritebackProposal: vi.fn(async (_actor: unknown, leaseId: string) => {
    mocks.proposals.delete(leaseId);
  }),
}));

vi.mock("@/lib/firestore/lease-renewal-progress", () => ({
  recordRenewalProcessEvidence: mocks.projection,
}));

// The production-bound suspension reader would hang without Firestore in the unit env; an
// immediate throw exercises the same fail-closed unreadable path deterministically.
vi.mock("@/lib/firestore/runtime-action-suspensions", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/firestore/runtime-action-suspensions")>()),
  readRuntimeActionSuspension: vi.fn(async () => {
    throw new Error("suspension store unreadable in unit env");
  }),
}));

import { POST } from "@/app/api/lease-renewal/rentvine-writeback/route";

const LEASE = {
  startDate: "2025-09-01",
  endDate: "2026-08-31",
  increaseEligibilityDate: null as string | null,
};

function fakeDeps(): RenewalWritebackDependencies {
  const store = new MemoryExternalExecutionStore();
  return {
    descriptor: {
      environmentKind: "production",
      dataContext: "live",
      source: "explicit",
    } as never,
    store,
    reads: {
      async getLease() {
        return { lease: { ...LEASE } };
      },
      async getRecurringCharge() {
        throw new Error("no charge reads in these fixtures");
      },
      async listRecurringCharges() {
        return [];
      },
    },
    createWriter: () => {
      mocks.writerCalls.push("createWriter");
      return {
        async updateLease(leaseId: string, payload: Record<string, unknown>) {
          mocks.writerCalls.push("updateLease");
          LEASE.endDate = (payload.endDate as string | null | undefined) ?? LEASE.endDate;
          return { lease: { leaseID: leaseId } };
        },
        async updateExistingRecurringCharge() {
          throw new Error("unused");
        },
        async createRecurringCharge() {
          throw new Error("unused");
        },
        async deleteRecurringChargeForCreateReversal() {
          throw new Error("unused");
        },
      } as never;
    },
    gateFor: () => ({
      isExecutable: async () => mocks.gateOpen,
      run: async (effect) => {
        if (!mocks.gateOpen) throw new Error("gate closed");
        return effect();
      },
    }),
  };
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/lease-renewal/rentvine-writeback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function proposeDatesChange(): Promise<{
  previewHash: string;
  effectHash: string;
}> {
  const response = await post({
    operation: "propose",
    leaseId: "4821",
    evidenceRef: "workspace:4821",
    effects: [{ kind: "renewal_dates_update", after: { endDate: "2027-08-31" } }],
  });
  expect(response.status).toBe(200);
  const payload = (await response.json()) as {
    proposal: { preview_hash: string; effects: { effect_hash: string }[] };
  };
  return {
    previewHash: payload.proposal.preview_hash,
    effectHash: payload.proposal.effects[0].effect_hash,
  };
}

describe("S97 rentvine-writeback route", () => {
  beforeEach(() => {
    mocks.user = { uid: "admin-1", email: "admin@pmikcmetro.com", role: "Admin" };
    mocks.deps = fakeDeps();
    mocks.proposals.clear();
    mocks.gateOpen = false;
    mocks.writerCalls = [];
    mocks.projection.mockClear();
    LEASE.startDate = "2025-09-01";
    LEASE.endDate = "2026-08-31";
    LEASE.increaseEligibilityDate = null;
  });

  it("passes a missing-Space denial through unchanged for the S83 handoff", async () => {
    const { requireCapabilityInSpace } = await import("@/lib/auth/session");
    const { EditableLayerError } = await import("@/lib/firestore/errors");
    vi.mocked(requireCapabilityInSpace).mockRejectedValueOnce(
      new EditableLayerError("Renewals Space access is required.", 403),
    );
    const response = await post({
      operation: "propose",
      leaseId: "4821",
      evidenceRef: "workspace:4821",
      effects: [{ kind: "renewal_dates_update", after: { endDate: "2027-08-31" } }],
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("Renewals Space access is required");
    expect(mocks.proposals.size).toBe(0);
  });

  it("lets an Editor propose from fresh provider state but never execute", async () => {
    mocks.user = { uid: "editor-1", email: "editor@pmikcmetro.com", role: "Editor" };
    const { previewHash, effectHash } = await proposeDatesChange();
    expect(mocks.proposals.get("4821")?.previewHash).toBe(previewHash);

    const execute = await post({
      operation: "execute",
      leaseId: "4821",
      previewHash,
      effectHash,
      confirm: true,
    });
    expect(execute.status).toBe(403);
    const payload = (await execute.json()) as { error: string };
    expect(payload.error).toContain("Admin authority is required");
    expect(mocks.writerCalls).toEqual([]);
  });

  it("refuses Admin execution through the real per-key gate before any writer", async () => {
    const { previewHash, effectHash } = await proposeDatesChange();
    const execute = await post({
      operation: "execute",
      leaseId: "4821",
      previewHash,
      effectHash,
      confirm: true,
    });
    expect(execute.status).toBe(409);
    const payload = (await execute.json()) as { error_type: string };
    // S97 activation (2026-09-02): the committed seed term is open, so the fail-closed
    // runtime-suspension term (unreadable in the unit env) is the refusing gate.
    expect(payload.error_type).toBe("action_runtime_suspended");
    expect(mocks.writerCalls).toEqual([]);
    expect(mocks.projection).not.toHaveBeenCalled();
  });

  it("executes one confirmed effect once with receipt, projection, and duplicate return", async () => {
    const { previewHash, effectHash } = await proposeDatesChange();
    mocks.gateOpen = true;
    const first = await post({
      operation: "execute",
      leaseId: "4821",
      previewHash,
      effectHash,
      confirm: true,
    });
    expect(first.status).toBe(200);
    const outcome = (await first.json()) as {
      status: string;
      duplicate: boolean;
      receipt: { provider_ref: string; result_hash: string };
      projection: string;
    };
    expect(outcome.status).toBe("executed");
    expect(outcome.duplicate).toBe(false);
    expect(outcome.projection).toBe("projected");
    expect(outcome.receipt.result_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.writerCalls.filter((call) => call === "updateLease")).toHaveLength(1);
    expect(mocks.projection).toHaveBeenCalledWith(
      expect.anything(),
      "4821",
      "source-write-receipt",
      expect.objectContaining({ source: "app_record", disposition: "verified" }),
    );

    const second = await post({
      operation: "execute",
      leaseId: "4821",
      previewHash,
      effectHash,
      confirm: true,
    });
    expect(second.status).toBe(200);
    const duplicate = (await second.json()) as { duplicate: boolean };
    expect(duplicate.duplicate).toBe(true);
    expect(mocks.writerCalls.filter((call) => call === "updateLease")).toHaveLength(1);
  });

  it("keeps a provider-successful effect successful when projection fails", async () => {
    const { previewHash, effectHash } = await proposeDatesChange();
    mocks.gateOpen = true;
    mocks.projection.mockRejectedValueOnce(new Error("projection store down"));
    const response = await post({
      operation: "execute",
      leaseId: "4821",
      previewHash,
      effectHash,
      confirm: true,
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { status: string; projection: string };
    expect(payload.status).toBe("executed");
    expect(payload.projection).toBe("pending_reconciliation");
    expect(mocks.writerCalls.filter((call) => call === "updateLease")).toHaveLength(1);
  });

  it("refuses a stale preview hash before any gate or writer work", async () => {
    const { effectHash } = await proposeDatesChange();
    mocks.gateOpen = true;
    const response = await post({
      operation: "execute",
      leaseId: "4821",
      previewHash: "a".repeat(64),
      effectHash,
      confirm: true,
    });
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error_type: string };
    expect(payload.error_type).toBe("confirmation_invalid");
    expect(mocks.writerCalls).toEqual([]);
  });

  it("reports status with per-effect execution state and no proposal as null", async () => {
    const empty = await post({ operation: "status", leaseId: "999" });
    expect(empty.status).toBe(200);
    expect(((await empty.json()) as { proposal: unknown }).proposal).toBeNull();

    const { effectHash } = await proposeDatesChange();
    const response = await post({ operation: "status", leaseId: "4821" });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      effects: { effect_hash: string; state: string; reversal_kind: string }[];
      expired: boolean;
    };
    expect(payload.effects).toHaveLength(1);
    expect(payload.effects[0].effect_hash).toBe(effectHash);
    expect(payload.effects[0].state).toBe("not_started");
    expect(payload.effects[0].reversal_kind).toBe("restore_dates");
    expect(payload.expired).toBe(false);
  });

  it("discards a proposal without touching provider receipts", async () => {
    await proposeDatesChange();
    const response = await post({ operation: "discard", leaseId: "4821" });
    expect(response.status).toBe(200);
    expect(mocks.proposals.has("4821")).toBe(false);
    expect(mocks.writerCalls).toEqual([]);
  });

  it("reports not_configured instead of guessing provider configuration", async () => {
    mocks.deps = { status: "not_configured" };
    const response = await post({ operation: "status", leaseId: "4821" });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { status: string }).status).toBe("not_configured");
  });

  it("previews and executes the reversal as separately confirmed actions", async () => {
    const { previewHash, effectHash } = await proposeDatesChange();
    mocks.gateOpen = true;
    await post({
      operation: "execute",
      leaseId: "4821",
      previewHash,
      effectHash,
      confirm: true,
    });

    const preview = await post({
      operation: "reverse_preview",
      leaseId: "4821",
      effectHash,
    });
    expect(preview.status).toBe(200);
    const previewPayload = (await preview.json()) as {
      reversal: { kind: string; previewHash: string };
    };
    expect(previewPayload.reversal.kind).toBe("restore_dates");

    const writesBefore = mocks.writerCalls.filter(
      (call) => call === "updateLease",
    ).length;
    const execute = await post({
      operation: "reverse_execute",
      leaseId: "4821",
      effectHash,
      reversal: previewPayload.reversal,
      confirm: true,
    });
    expect(execute.status).toBe(200);
    const payload = (await execute.json()) as { status: string };
    expect(payload.status).toBe("reversed");
    expect(mocks.writerCalls.filter((call) => call === "updateLease").length).toBe(
      writesBefore + 1,
    );
    expect(LEASE.endDate).toBe("2026-08-31");
  });

  it("rejects unsupported operations and extra fields structurally", async () => {
    const generic = await post({
      operation: "execute",
      leaseId: "4821",
      previewHash: "a".repeat(64),
      effectHash: "b".repeat(64),
      confirm: true,
      method: "DELETE",
      path: "/leases/1",
    });
    expect(generic.status).toBe(400);
  });
});
