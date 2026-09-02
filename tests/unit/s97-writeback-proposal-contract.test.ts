import { describe, expect, it } from "vitest";

import {
  RECURRING_CHARGE_CREATE_KEY,
  RECURRING_CHARGE_UPDATE_KEY,
  RENEWAL_DATES_UPDATE_KEY,
  RENEWAL_WRITEBACK_PROPOSAL_VERSION,
  RenewalWritebackContractError,
  assertRenewalWritebackConfirmation,
  buildRenewalWritebackProposal,
  projectRecurringCharge,
  renewalWritebackExecutionId,
  renewalWritebackReversalExecutionId,
  type RecurringChargeProjection,
  type RenewalWritebackProposalInput,
} from "@/lib/lease-renewal/writeback/proposal-contract";

const NOW = Date.parse("2026-09-01T12:00:00.000Z");

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

describe("S97 proposal validation and ordering", () => {
  it("freezes a valid proposal with ordered effects, exact keys, reversals, and hashes", () => {
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
          {
            kind: "renewal_dates_update",
            before: {
              startDate: "2025-09-01",
              endDate: "2026-08-31",
              increaseEligibilityDate: null,
            },
            after: { endDate: "2027-08-31" },
          },
          {
            kind: "recurring_charge_update",
            chargeId: "701",
            before: charge(),
            changes: { amount: "1300.00" },
          },
        ],
      }),
    );

    expect(proposal.version).toBe(RENEWAL_WRITEBACK_PROPOSAL_VERSION);
    // ARCH-S97-5 order: dates, existing charge updates, then new charges.
    expect(proposal.effects.map((entry) => entry.actionKey)).toEqual([
      RENEWAL_DATES_UPDATE_KEY,
      RECURRING_CHARGE_UPDATE_KEY,
      RECURRING_CHARGE_CREATE_KEY,
    ]);
    expect(proposal.effects[0].reversal).toEqual({
      kind: "restore_dates",
      restore: {
        startDate: "2025-09-01",
        endDate: "2026-08-31",
        increaseEligibilityDate: null,
      },
    });
    expect(proposal.effects[1].reversal).toEqual({
      kind: "restore_charge_fields",
      chargeId: "701",
      restore: { amount: "1250.00" },
    });
    expect(proposal.effects[2].reversal).toEqual({ kind: "delete_created_charge" });
    expect(new Set(proposal.effects.map((entry) => entry.effectHash)).size).toBe(3);
    expect(proposal.previewHash).toMatch(/^[0-9a-f]{64}$/);
  });

  const reject = (
    label: string,
    mutate: (input: RenewalWritebackProposalInput) => RenewalWritebackProposalInput,
    code: string,
  ) => {
    it(`rejects ${label}`, () => {
      let error: unknown;
      try {
        buildRenewalWritebackProposal(mutate(proposalInput()));
      } catch (thrown) {
        error = thrown;
      }
      expect(error).toBeInstanceOf(RenewalWritebackContractError);
      expect((error as RenewalWritebackContractError).code).toBe(code);
    });
  };

  reject("an empty proposal", (input) => ({ ...input, effects: [] }), "no_change");
  reject(
    "a wrong provider account",
    (input) => ({ ...input, account: "othertenant" }),
    "account_mismatch",
  );
  reject(
    "an unmanaged actor",
    (input) => ({ ...input, actorEmail: "someone@gmail.com" }),
    "actor_invalid",
  );
  reject(
    "a stale dates before-state",
    (input) => ({
      ...input,
      effects: [
        {
          kind: "renewal_dates_update",
          before: {
            startDate: "2025-09-01",
            endDate: "2026-07-31",
            increaseEligibilityDate: null,
          },
          after: { endDate: "2027-08-31" },
        },
      ],
    }),
    "stale_before_state",
  );
  reject(
    "a dates effect with no actual change",
    (input) => ({
      ...input,
      effects: [
        {
          kind: "renewal_dates_update",
          before: input.leaseState,
          after: { endDate: "2026-08-31" },
        },
      ],
    }),
    "no_change",
  );
  reject(
    "an edited startDate smuggled through after",
    (input) => ({
      ...input,
      effects: [
        {
          kind: "renewal_dates_update",
          before: input.leaseState,
          after: { startDate: "2026-01-01" } as never,
        },
      ],
    }),
    "unsupported_field",
  );
  reject(
    "an open-ended-to-dated charge endDate transition",
    (input) => ({
      ...input,
      effects: [
        {
          kind: "recurring_charge_update",
          chargeId: "701",
          before: charge({ endDate: null }),
          changes: { endDate: "12/31/2027" },
        },
      ],
    }),
    "unsupported_transition",
  );
  reject(
    "a dated-to-open-ended charge endDate transition",
    (input) => ({
      ...input,
      effects: [
        {
          kind: "recurring_charge_update",
          chargeId: "701",
          before: charge(),
          changes: { endDate: null } as never,
        },
      ],
    }),
    "unsupported_transition",
  );
  reject(
    "an empty charge update",
    (input) => ({
      ...input,
      effects: [
        {
          kind: "recurring_charge_update",
          chargeId: "701",
          before: charge(),
          changes: {},
        },
      ],
    }),
    "no_change",
  );
  reject(
    "a duplicate charge update target",
    (input) => ({
      ...input,
      effects: [
        {
          kind: "recurring_charge_update",
          chargeId: "701",
          before: charge(),
          changes: { amount: "1300.00" },
        },
        {
          kind: "recurring_charge_update",
          chargeId: "701",
          before: charge(),
          changes: { description: "Adjusted rent" },
        },
      ],
    }),
    "duplicate_effect",
  );
  reject(
    "a second dates effect",
    (input) => ({
      ...input,
      effects: [input.effects[0], input.effects[0]],
    }),
    "duplicate_effect",
  );
  reject(
    "a malformed ISO date",
    (input) => ({
      ...input,
      effects: [
        {
          kind: "renewal_dates_update",
          before: input.leaseState,
          after: { endDate: "2027-02-30" },
        },
      ],
    }),
    "invalid_date",
  );
  reject(
    "a create missing a required field",
    (input) => ({
      ...input,
      effects: [
        {
          kind: "recurring_charge_create",
          create: {
            accountID: "9",
            amount: "45.0",
            description: "Fee",
            dayDue: "1",
            frequency: "1",
            startDate: "09/01/2026",
          },
        },
      ],
    }),
    "invalid_value",
  );
  reject(
    "a create with an out-of-range frequency",
    (input) => ({
      ...input,
      effects: [
        {
          kind: "recurring_charge_create",
          create: {
            accountID: "9",
            amount: "45.00",
            description: "Fee",
            dayDue: "1",
            frequency: "25",
            startDate: "09/01/2026",
          },
        },
      ],
    }),
    "invalid_value",
  );
});

describe("S97 charge projection strictness", () => {
  it("projects an exact canonical detail body", () => {
    expect(projectRecurringCharge(charge())).toEqual(charge());
  });

  it.each([
    ["a missing required field", { ...charge(), amount: undefined }],
    ["a numeric wire type", { ...charge(), amount: 1250 }],
    ["an invalid status enum", { ...charge(), recurringStatusID: 4 }],
    ["a non-object body", "not-an-object"],
  ])("blocks %s instead of coercing", (_label, raw) => {
    expect(() => projectRecurringCharge(raw as never)).toThrow(
      RenewalWritebackContractError,
    );
  });
});

describe("S97 confirmation and attempt identity", () => {
  it("binds one unexpired exact confirmation per effect and derives stable ids", () => {
    const proposal = buildRenewalWritebackProposal(proposalInput());
    const effect = proposal.effects[0];
    assertRenewalWritebackConfirmation({
      proposal,
      effect,
      confirmation: {
        previewHash: proposal.previewHash,
        effectHash: effect.effectHash,
        confirmedAtIso: new Date(NOW + 1000).toISOString(),
      },
      nowMs: NOW + 2000,
    });

    const id = renewalWritebackExecutionId(proposal, effect);
    expect(id).toBe(`s97:4821:${effect.effectHash}`);
    expect(renewalWritebackReversalExecutionId(id, "a".repeat(64))).toBe(
      `${id}:reversal:${"a".repeat(16)}`,
    );

    expect(() =>
      assertRenewalWritebackConfirmation({
        proposal,
        effect,
        confirmation: {
          previewHash: proposal.previewHash,
          effectHash: "b".repeat(64),
          confirmedAtIso: new Date(NOW).toISOString(),
        },
        nowMs: NOW,
      }),
    ).toThrow(/exact effect/);

    expect(() =>
      assertRenewalWritebackConfirmation({
        proposal,
        effect,
        confirmation: {
          previewHash: proposal.previewHash,
          effectHash: effect.effectHash,
          confirmedAtIso: new Date(NOW).toISOString(),
        },
        nowMs: NOW + 11 * 60 * 1000,
      }),
    ).toThrow(/expired/);
  });
});
