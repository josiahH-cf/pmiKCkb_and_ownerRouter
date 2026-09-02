import { describe, expect, it, vi } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  RenewalWritebackService,
  RenewalWritebackServiceError,
  type RenewalWritebackDependencies,
  type RenewalWritebackWriter,
} from "@/lib/lease-renewal/writeback/execution-service";
import {
  buildRenewalWritebackProposal,
  type RecurringChargeProjection,
  type RenewalWritebackProposal,
  type RenewalWritebackProposalInput,
} from "@/lib/lease-renewal/writeback/proposal-contract";

const NOW = Date.parse("2026-09-01T12:00:00.000Z");
const DESCRIPTOR = {
  environmentKind: "production",
  dataContext: "live",
  source: "explicit",
} as const;

function charge(
  overrides: Partial<RecurringChargeProjection> = {},
): RecurringChargeProjection {
  return {
    leaseRecurringChargeID: "701",
    leaseID: "4821",
    accountID: "9",
    amount: "1250.00",
    description: "Monthly rent",
    dayDue: "1",
    frequency: "1",
    startDate: "01/01/2026",
    isMoveInCharge: "0",
    isFromImport: "0",
    endDate: "12/31/2026",
    nextChargeDate: "10/01/2026",
    rentIncreaseID: null,
    importSourceKey: null,
    recurringStatusID: 1,
    ...overrides,
  };
}

interface Harness {
  service: RenewalWritebackService;
  store: MemoryExternalExecutionStore;
  calls: { method: string; args: unknown[] }[];
  state: {
    lease: {
      startDate: string;
      endDate: string | null;
      increaseEligibilityDate: string | null;
    };
    charges: Map<string, RecurringChargeProjection>;
    nextChargeId: number;
    writerFailure?: { error: unknown; onMethod: string };
    readbackOverride?: () => void;
    gateExecutable: boolean;
    /** S51 refusal shape; the injected gate resolves every one of these to non-executable. */
    gateRefusalState?: "action_suspended" | "global_suspended" | "unreadable";
  };
  createWriterSpy: ReturnType<typeof vi.fn>;
}

class ProviderHttpError extends Error {
  constructor(public readonly status: number) {
    super(`provider ${status}`);
  }
}

function harness(overrides: Partial<Harness["state"]> = {}): Harness {
  const state: Harness["state"] = {
    lease: {
      startDate: "2025-09-01",
      endDate: "2026-08-31",
      increaseEligibilityDate: null,
    },
    charges: new Map([["701", charge()]]),
    nextChargeId: 900,
    gateExecutable: true,
    ...overrides,
  };
  const calls: Harness["calls"] = [];
  const record = (method: string, ...args: unknown[]) => calls.push({ method, args });

  const writer: RenewalWritebackWriter = {
    async updateLease(leaseId, payload) {
      record("updateLease", leaseId, payload);
      if (state.writerFailure?.onMethod === "updateLease")
        throw state.writerFailure.error;
      state.lease = {
        startDate: payload.startDate,
        endDate: payload.endDate !== undefined ? payload.endDate : state.lease.endDate,
        increaseEligibilityDate:
          payload.increaseEligibilityDate !== undefined
            ? payload.increaseEligibilityDate
            : state.lease.increaseEligibilityDate,
      };
      state.readbackOverride?.();
      return { lease: { leaseID: leaseId } };
    },
    async updateExistingRecurringCharge(leaseId, chargeId, payload) {
      record("updateExistingRecurringCharge", leaseId, chargeId, payload);
      if (state.writerFailure?.onMethod === "updateExistingRecurringCharge") {
        throw state.writerFailure.error;
      }
      const existing = state.charges.get(chargeId);
      if (!existing) throw new ProviderHttpError(404);
      const echoIsoUpdate = (value: unknown): unknown => {
        if (typeof value !== "string") return value;
        const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
        return us ? `${us[3]}-${us[1]}-${us[2]}` : value;
      };
      const applied = Object.fromEntries(
        Object.entries(payload).map(([key, value]) => [
          key,
          key === "startDate" || key === "endDate" ? echoIsoUpdate(value) : value,
        ]),
      );
      state.charges.set(chargeId, {
        ...existing,
        ...applied,
      } as RecurringChargeProjection);
      return { recurringCharge: { leaseRecurringChargeID: chargeId } };
    },
    async createRecurringCharge(leaseId, payload) {
      record("createRecurringCharge", leaseId, payload);
      if (state.writerFailure?.onMethod === "createRecurringCharge") {
        throw state.writerFailure.error;
      }
      const id = String(state.nextChargeId++);
      // The live provider echoes submitted MM/DD/YYYY dates back as ISO YYYY-MM-DD
      // (verified on the 2026-09-02 create proof); the fake mirrors that.
      const echoIso = (value: string | null | undefined): string | null => {
        if (value === null || value === undefined) return null;
        const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
        return us ? `${us[3]}-${us[1]}-${us[2]}` : value;
      };
      const created = charge({
        leaseRecurringChargeID: id,
        leaseID: leaseId,
        accountID: payload.accountID,
        amount: payload.amount,
        description: payload.description,
        dayDue: payload.dayDue,
        frequency: payload.frequency,
        startDate: echoIso(payload.startDate) as string,
        endDate: echoIso(payload.endDate ?? null),
        nextChargeDate: null,
        recurringStatusID: 2,
      });
      state.charges.set(id, created);
      return { recurringCharge: created, previousCharge: null };
    },
    async deleteRecurringChargeForCreateReversal(leaseId, chargeId) {
      record("deleteRecurringCharge", leaseId, chargeId);
      if (state.writerFailure?.onMethod === "deleteRecurringCharge") {
        throw state.writerFailure.error;
      }
      const existing = state.charges.get(chargeId);
      if (!existing) throw new ProviderHttpError(404);
      state.charges.delete(chargeId);
      return existing;
    },
  };

  const store = new MemoryExternalExecutionStore();
  const createWriterSpy = vi.fn(() => writer);
  const dependencies: RenewalWritebackDependencies = {
    descriptor: DESCRIPTOR as never,
    store,
    reads: {
      async getLease() {
        return { lease: { ...state.lease } };
      },
      async getRecurringCharge(_leaseId, chargeId) {
        // The real read client unwraps the {recurringCharge} envelope before returning.
        const found = state.charges.get(chargeId);
        if (!found) throw new ProviderHttpError(404);
        return { ...found };
      },
      async listRecurringCharges() {
        return [...state.charges.values()].map((entry) => ({ ...entry }));
      },
    },
    createWriter: createWriterSpy as unknown as () => RenewalWritebackWriter,
    gateFor: () => ({
      isExecutable: async () =>
        state.gateExecutable && state.gateRefusalState === undefined,
      run: async (effect) => {
        if (!state.gateExecutable || state.gateRefusalState !== undefined) {
          throw new Error("gate closed");
        }
        return effect();
      },
    }),
    now: () => NOW,
  };
  return {
    service: new RenewalWritebackService(dependencies),
    store,
    calls,
    state,
    createWriterSpy,
  };
}

function proposalInput(
  overrides: Partial<RenewalWritebackProposalInput> = {},
): RenewalWritebackProposalInput {
  return {
    leaseId: "4821",
    account: "pmikcmetro",
    actorUid: "admin-1",
    actorEmail: "admin-1@pmikcmetro.com",
    actorRole: "Admin",
    leaseState: {
      startDate: "2025-09-01",
      endDate: "2026-08-31",
      increaseEligibilityDate: null,
    },
    sourceReadAtIso: "2026-09-01T11:59:00.000Z",
    evidenceRef: "renewal-progress:4821",
    effects: [
      {
        kind: "renewal_dates_update",
        before: {
          startDate: "2025-09-01",
          endDate: "2026-08-31",
          increaseEligibilityDate: null,
        },
        after: { endDate: "2027-08-31" },
      },
    ],
    nowMs: NOW,
    ...overrides,
  };
}

function confirmed(proposal: RenewalWritebackProposal, index = 0) {
  const effect = proposal.effects[index];
  return {
    proposal,
    effectHash: effect.effectHash,
    confirmation: {
      previewHash: proposal.previewHash,
      effectHash: effect.effectHash,
      confirmedAtIso: new Date(NOW).toISOString(),
    },
  };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  let error: unknown;
  try {
    await promise;
  } catch (thrown) {
    error = thrown;
  }
  expect(error).toBeInstanceOf(RenewalWritebackServiceError);
  expect((error as RenewalWritebackServiceError).code).toBe(code);
}

// S51_DYNAMIC_REFUSAL:s97-writeback-effect-writer
it.each(["action_suspended", "global_suspended", "unreadable"] as const)(
  "does not construct the RentVine writer for a confirmed effect when runtime state is %s",
  async (gateRefusalState) => {
    const h = harness({ gateExecutable: false, gateRefusalState });
    const proposal = buildRenewalWritebackProposal(proposalInput());
    await expectCode(h.service.executeEffect(confirmed(proposal)), "action_closed");
    expect(h.createWriterSpy).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
  },
);

// S51_DYNAMIC_REFUSAL:s97-writeback-reversal-writer
it.each(["action_suspended", "global_suspended", "unreadable"] as const)(
  "does not construct the RentVine writer for a confirmed reversal when runtime state is %s",
  async (gateRefusalState) => {
    const h = harness();
    const proposal = buildRenewalWritebackProposal(proposalInput());
    await h.service.executeEffect(confirmed(proposal));
    const reversal = await h.service.previewReversal({
      proposal,
      effectHash: proposal.effects[0].effectHash,
    });
    h.state.gateExecutable = false;
    h.state.gateRefusalState = gateRefusalState;
    h.createWriterSpy.mockClear();
    await expectCode(
      h.service.executeReversal({
        proposal,
        effectHash: proposal.effects[0].effectHash,
        reversal,
        confirmedAtIso: new Date(NOW).toISOString(),
      }),
      "action_closed",
    );
    expect(h.createWriterSpy).not.toHaveBeenCalled();
  },
);

describe("S97 one-attempt execution", () => {
  it("executes a confirmed dates effect once with exact readback and replays duplicates", async () => {
    const h = harness();
    const proposal = buildRenewalWritebackProposal(proposalInput());
    const first = await h.service.executeEffect(confirmed(proposal));
    expect(first.duplicate).toBe(false);
    expect(first.receipt.actionKey).toBe("rentvine.lease.renewal_dates.update");
    expect(h.calls.filter((call) => call.method === "updateLease")).toHaveLength(1);
    // startDate is copied unchanged; only the changed date is present.
    expect(h.calls[0].args[1]).toEqual({
      startDate: "2025-09-01",
      endDate: "2027-08-31",
    });
    expect(h.state.lease.endDate).toBe("2027-08-31");

    const second = await h.service.executeEffect(confirmed(proposal));
    expect(second.duplicate).toBe(true);
    expect(second.receipt.resultHash).toBe(first.receipt.resultHash);
    expect(h.calls.filter((call) => call.method === "updateLease")).toHaveLength(1);
  });

  it("creates a charge with full readback and exposes the provider id for reversal", async () => {
    const h = harness();
    const proposal = buildRenewalWritebackProposal(
      proposalInput({
        effects: [
          {
            kind: "recurring_charge_create",
            create: {
              accountID: "9",
              amount: "45.00",
              description: "Renewal admin fee",
              dayDue: "1",
              frequency: "1",
              startDate: "09/01/2026",
            },
          },
        ],
      }),
    );
    const result = await h.service.executeEffect(confirmed(proposal));
    expect(result.createdChargeId).toBe("900");
    expect(result.receipt.providerRef).toBe("s97-charge:900");
    expect(result.receipt.resultHash).toBe(
      hashExecutionPreview({
        version: "s97-charge-projection/v1",
        projection: h.state.charges.get("900"),
      }),
    );
  });

  it("refuses before writer construction on stale provider state, closed gate, or bad confirmation", async () => {
    const drifted = harness({
      lease: {
        startDate: "2025-09-01",
        endDate: "2026-07-31",
        increaseEligibilityDate: null,
      },
    });
    const proposal = buildRenewalWritebackProposal(proposalInput());
    await expectCode(
      drifted.service.executeEffect(confirmed(proposal)),
      "provider_state_drift",
    );
    expect(drifted.calls).toHaveLength(0);

    const closed = harness({ gateExecutable: false });
    await expectCode(closed.service.executeEffect(confirmed(proposal)), "action_closed");
    expect(closed.calls).toHaveLength(0);

    const h = harness();
    await expectCode(
      h.service.executeEffect({
        ...confirmed(proposal),
        confirmation: {
          previewHash: proposal.previewHash,
          effectHash: "f".repeat(64),
          confirmedAtIso: new Date(NOW).toISOString(),
        },
      }),
      "confirmation_invalid",
    );
    expect(h.calls).toHaveLength(0);
  });

  it("treats a provider timeout as ambiguous with no retry and no second POST", async () => {
    const h = harness();
    h.state.writerFailure = {
      onMethod: "updateLease",
      error: new ProviderHttpError(504),
    };
    const proposal = buildRenewalWritebackProposal(proposalInput());
    await expectCode(h.service.executeEffect(confirmed(proposal)), "provider_ambiguous");
    expect(h.calls.filter((call) => call.method === "updateLease")).toHaveLength(1);

    // A second confirmation cannot retry the ambiguous attempt.
    await expectCode(h.service.executeEffect(confirmed(proposal)), "execution_state");
    expect(h.calls.filter((call) => call.method === "updateLease")).toHaveLength(1);
  });

  it("treats a definite 4xx refusal as failed (not ambiguous) and still never retries", async () => {
    const h = harness();
    h.state.writerFailure = {
      onMethod: "updateLease",
      error: new ProviderHttpError(403),
    };
    const proposal = buildRenewalWritebackProposal(proposalInput());
    await expectCode(h.service.executeEffect(confirmed(proposal)), "provider_refused");
    await expectCode(h.service.executeEffect(confirmed(proposal)), "execution_state");
    expect(h.calls.filter((call) => call.method === "updateLease")).toHaveLength(1);
  });

  it("marks a post-write readback mismatch ambiguous rather than blindly succeeding", async () => {
    const h = harness();
    h.state.readbackOverride = () => {
      h.state.lease = { ...h.state.lease, endDate: "2028-01-01" };
    };
    const proposal = buildRenewalWritebackProposal(proposalInput());
    await expectCode(h.service.executeEffect(confirmed(proposal)), "provider_ambiguous");
  });
});

describe("S97 reconciliation", () => {
  it("honors the running window, then reports after/before/drift by observation only", async () => {
    const h = harness();
    h.state.writerFailure = {
      onMethod: "updateLease",
      error: new ProviderHttpError(500),
    };
    const proposal = buildRenewalWritebackProposal(proposalInput());
    await expectCode(h.service.executeEffect(confirmed(proposal)), "provider_ambiguous");
    h.state.writerFailure = undefined;

    // Provider state still equals before → observation cannot prove the effect.
    await expectCode(
      h.service.reconcileEffect({ proposal, effectHash: proposal.effects[0].effectHash }),
      "reconcile_not_proven",
    );

    // Provider state equals the exact after → a reconciled receipt is recorded.
    h.state.lease = { ...h.state.lease, endDate: "2027-08-31" };
    const receipt = await h.service.reconcileEffect({
      proposal,
      effectHash: proposal.effects[0].effectHash,
    });
    expect(receipt.reconciled).toBe(true);

    // Drifted third state refuses with drift.
    const h2 = harness();
    h2.state.writerFailure = {
      onMethod: "updateLease",
      error: new ProviderHttpError(500),
    };
    const proposal2 = buildRenewalWritebackProposal(proposalInput());
    await expectCode(
      h2.service.executeEffect(confirmed(proposal2)),
      "provider_ambiguous",
    );
    h2.state.lease = { ...h2.state.lease, endDate: "2030-01-01" };
    await expectCode(
      h2.service.reconcileEffect({
        proposal: proposal2,
        effectHash: proposal2.effects[0].effectHash,
      }),
      "reconcile_drift",
    );
  });
});

describe("S97 separately confirmed reversal", () => {
  it("restores dates only through a new preview/confirmation and exact readback", async () => {
    const h = harness();
    const proposal = buildRenewalWritebackProposal(proposalInput());
    await h.service.executeEffect(confirmed(proposal));

    const preview = await h.service.previewReversal({
      proposal,
      effectHash: proposal.effects[0].effectHash,
    });
    expect(preview.kind).toBe("restore_dates");
    const result = await h.service.executeReversal({
      proposal,
      effectHash: proposal.effects[0].effectHash,
      reversal: preview,
      confirmedAtIso: new Date(NOW).toISOString(),
    });
    expect(result.duplicate).toBe(false);
    expect(h.state.lease.endDate).toBe("2026-08-31");

    const replay = await h.service.executeReversal({
      proposal,
      effectHash: proposal.effects[0].effectHash,
      reversal: preview,
      confirmedAtIso: new Date(NOW).toISOString(),
    });
    expect(replay.duplicate).toBe(true);
    expect(h.calls.filter((call) => call.method === "updateLease")).toHaveLength(2);
  });

  it("refuses reversal when the target drifted after the forward effect", async () => {
    const h = harness();
    const proposal = buildRenewalWritebackProposal(proposalInput());
    await h.service.executeEffect(confirmed(proposal));
    h.state.lease = { ...h.state.lease, endDate: "2031-01-01" };
    await expectCode(
      h.service.previewReversal({
        proposal,
        effectHash: proposal.effects[0].effectHash,
      }),
      "reversal_target_drift",
    );
  });

  it("deletes only the exact unchanged receipt-bound created charge and proves absence", async () => {
    const h = harness();
    const proposal = buildRenewalWritebackProposal(
      proposalInput({
        effects: [
          {
            kind: "recurring_charge_create",
            create: {
              accountID: "9",
              amount: "45.00",
              description: "Renewal admin fee",
              dayDue: "1",
              frequency: "1",
              startDate: "09/01/2026",
            },
          },
        ],
      }),
    );
    const created = await h.service.executeEffect(confirmed(proposal));
    expect(created.createdChargeId).toBe("900");

    const preview = await h.service.previewReversal({
      proposal,
      effectHash: proposal.effects[0].effectHash,
    });
    expect(preview.kind).toBe("delete_created_charge");
    const result = await h.service.executeReversal({
      proposal,
      effectHash: proposal.effects[0].effectHash,
      reversal: preview,
      confirmedAtIso: new Date(NOW).toISOString(),
    });
    expect(result.receipt.providerRef).toBe("s97-charge-deleted:900");
    expect(h.state.charges.has("900")).toBe(false);
    expect(
      h.calls.filter((call) => call.method === "deleteRecurringCharge"),
    ).toHaveLength(1);
  });

  it("refuses delete-reversal when the created charge changed after creation", async () => {
    const h = harness();
    const proposal = buildRenewalWritebackProposal(
      proposalInput({
        effects: [
          {
            kind: "recurring_charge_create",
            create: {
              accountID: "9",
              amount: "45.00",
              description: "Renewal admin fee",
              dayDue: "1",
              frequency: "1",
              startDate: "09/01/2026",
            },
          },
        ],
      }),
    );
    await h.service.executeEffect(confirmed(proposal));
    const drifted = h.state.charges.get("900");
    h.state.charges.set("900", { ...drifted!, amount: "60.00" });
    await expectCode(
      h.service.previewReversal({
        proposal,
        effectHash: proposal.effects[0].effectHash,
      }),
      "reversal_target_drift",
    );
    expect(
      h.calls.filter((call) => call.method === "deleteRecurringCharge"),
    ).toHaveLength(0);
  });

  it("updates an existing charge and restores its exact prior reversible fields", async () => {
    const h = harness();
    const proposal = buildRenewalWritebackProposal(
      proposalInput({
        effects: [
          {
            kind: "recurring_charge_update",
            chargeId: "701",
            before: charge(),
            changes: { amount: "1300.00" },
          },
        ],
      }),
    );
    await h.service.executeEffect(confirmed(proposal));
    expect(h.state.charges.get("701")?.amount).toBe("1300.00");

    const preview = await h.service.previewReversal({
      proposal,
      effectHash: proposal.effects[0].effectHash,
    });
    expect(preview.kind).toBe("restore_charge_fields");
    await h.service.executeReversal({
      proposal,
      effectHash: proposal.effects[0].effectHash,
      reversal: preview,
      confirmedAtIso: new Date(NOW).toISOString(),
    });
    expect(h.state.charges.get("701")?.amount).toBe("1250.00");
  });
});

describe("S97 environment boundary", () => {
  it("refuses every operation outside explicit Production + Live", async () => {
    const h = harness();
    const service = new RenewalWritebackService({
      descriptor: {
        environmentKind: "demo",
        dataContext: "live_readonly",
        source: "explicit",
      } as never,
      store: h.store,
      reads: {
        getLease: async () => ({}),
        getRecurringCharge: async () => ({}),
        listRecurringCharges: async () => [],
      },
      createWriter: () => {
        throw new Error("writer must not construct");
      },
      gateFor: () => ({ isExecutable: async () => true, run: async (fn) => fn() }),
      now: () => NOW,
    });
    const proposal = buildRenewalWritebackProposal(proposalInput());
    await expectCode(service.executeEffect(confirmed(proposal)), "environment_refused");
  });
});
