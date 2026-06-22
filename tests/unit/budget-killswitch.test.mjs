import { describe, expect, it } from "vitest";

import {
  decideBillingAction,
  decodeBudgetNotification,
} from "../../infra/budget-guardrail/decide.mjs";
import { handleBudgetEvent } from "../../infra/budget-guardrail/handler.mjs";

// The exact JSON shape Cloud Billing publishes to the budget Pub/Sub topic.
function notification({ costAmount, budgetAmount = 10, currencyCode = "USD" }) {
  return {
    budgetDisplayName: "pmi-kc-kb-prod $10 kill switch",
    alertThresholdExceeded: 1.0,
    costAmount,
    costIntervalStart: "2026-06-01T00:00:00Z",
    budgetAmount,
    budgetAmountType: "SPECIFIED_AMOUNT",
    currencyCode,
  };
}

function cloudEvent(payload) {
  // 2nd-gen CloudEvent Pub/Sub envelope: data.message.data is base64-encoded JSON.
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  return { data: { message: { data } } };
}

function mockBilling({ billingEnabled = true } = {}) {
  const calls = { get: [], update: [] };
  return {
    calls,
    async getProjectBillingInfo(request) {
      calls.get.push(request);
      return [{ billingEnabled }];
    },
    async updateProjectBillingInfo(request) {
      calls.update.push(request);
      return [{ billingEnabled: false }];
    },
  };
}

const silentLogger = { log() {}, warn() {} };

describe("budget kill switch — decode", () => {
  it("decodes the 2nd-gen CloudEvent Pub/Sub envelope", () => {
    const decoded = decodeBudgetNotification(
      cloudEvent(notification({ costAmount: 4.2 })),
    );
    expect(decoded.costAmount).toBe(4.2);
    expect(decoded.budgetAmount).toBe(10);
  });

  it("decodes the 1st-gen background-event shape", () => {
    const data = Buffer.from(
      JSON.stringify(notification({ costAmount: 1 })),
      "utf8",
    ).toString("base64");
    expect(decodeBudgetNotification({ data }).costAmount).toBe(1);
  });

  it("throws when the Pub/Sub message data is missing", () => {
    expect(() => decodeBudgetNotification({ data: { message: {} } })).toThrow();
  });
});

describe("budget kill switch — decide", () => {
  it("disables when cost reaches the cap", () => {
    const decision = decideBillingAction(notification({ costAmount: 10 }), {
      capUsd: 10,
    });
    expect(decision.disable).toBe(true);
    expect(decision.effectiveCap).toBe(10);
  });

  it("does not disable below the cap", () => {
    expect(
      decideBillingAction(notification({ costAmount: 9.99 }), { capUsd: 10 }).disable,
    ).toBe(false);
  });

  it("uses the smaller of the env cap and the budget amount", () => {
    // Budget amount 5 is below the $10 env cap -> effective cap is 5.
    const decision = decideBillingAction(
      notification({ costAmount: 6, budgetAmount: 5 }),
      {
        capUsd: 10,
      },
    );
    expect(decision.effectiveCap).toBe(5);
    expect(decision.disable).toBe(true);
  });

  it("takes no action when costAmount is missing/non-numeric", () => {
    expect(decideBillingAction({ budgetAmount: 10 }, { capUsd: 10 }).disable).toBe(false);
  });
});

describe("budget kill switch — handler (injected billing client)", () => {
  const deps = (billing) => ({
    getBillingClient: async () => billing,
    projectId: "pmi-kc-kb-prod",
    capUsd: 10,
    logger: silentLogger,
  });

  it("disables billing when over cap and billing is enabled", async () => {
    const billing = mockBilling({ billingEnabled: true });
    const result = await handleBudgetEvent(
      cloudEvent(notification({ costAmount: 12.5 })),
      deps(billing),
    );

    expect(result.disabled).toBe(true);
    expect(billing.calls.update).toHaveLength(1);
    expect(billing.calls.update[0]).toEqual({
      name: "projects/pmi-kc-kb-prod",
      projectBillingInfo: { billingAccountName: "" },
    });
  });

  it("does not touch billing below the cap", async () => {
    const billing = mockBilling({ billingEnabled: true });
    const result = await handleBudgetEvent(
      cloudEvent(notification({ costAmount: 3 })),
      deps(billing),
    );

    expect(result.disabled).toBe(false);
    expect(billing.calls.get).toHaveLength(0);
    expect(billing.calls.update).toHaveLength(0);
  });

  it("no-ops when billing is already disabled", async () => {
    const billing = mockBilling({ billingEnabled: false });
    const result = await handleBudgetEvent(
      cloudEvent(notification({ costAmount: 99 })),
      deps(billing),
    );

    expect(result.disabled).toBe(false);
    expect(result.alreadyDisabled).toBe(true);
    expect(billing.calls.update).toHaveLength(0);
  });

  it("requires a project id", async () => {
    // An explicit empty string bypasses the env-fallback default and exercises the guard.
    await expect(
      handleBudgetEvent(cloudEvent(notification({ costAmount: 1 })), {
        getBillingClient: async () => mockBilling(),
        projectId: "",
        capUsd: 10,
        logger: silentLogger,
      }),
    ).rejects.toThrow(/must be set/i);
  });
});
