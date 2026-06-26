import { describe, expect, it } from "vitest";
import { CHEAP_LIVE_MODEL } from "../../scripts/check-live-cost.mjs";
import {
  BUDGET_CAP_USD,
  evaluateBudgetGuard,
  parseAwayModeStatus,
  readAwayModeStatus,
  readBudgetGuardConfig,
} from "../../scripts/check-budget-guard.mjs";

const demoSafe = {
  askDemoMode: true,
  notificationsEnabled: false,
  geminiAnswerModel: CHEAP_LIVE_MODEL,
  liveSpaceIds: [],
  budgetCapUsd: BUDGET_CAP_USD,
};

const cheapLive = {
  askDemoMode: false,
  notificationsEnabled: false,
  geminiAnswerModel: CHEAP_LIVE_MODEL,
  liveSpaceIds: ["lease-renewals"],
  budgetCapUsd: BUDGET_CAP_USD,
};

describe("budget guard", () => {
  it("pins the documented $10 cap", () => {
    expect(BUDGET_CAP_USD).toBe(10);
  });

  it("passes the safe demo-mode posture with no flags", () => {
    const result = evaluateBudgetGuard(demoSafe);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.posture).toBe("demo");
  });

  it("passes the sanctioned cheap-live path (Flash + single lease-renewals Space)", () => {
    const result = evaluateBudgetGuard(cheapLive);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.posture).toBe("live");
  });

  it("rejects the Pro model in live mode without --allow-pro", () => {
    const result = evaluateBudgetGuard({
      ...cheapLive,
      geminiAnswerModel: "gemini-2.5-pro",
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("GEMINI_MODEL_ANSWER=gemini-2.5-pro");
  });

  it("allows the Pro model in live mode only with --allow-pro", () => {
    const result = evaluateBudgetGuard(
      { ...cheapLive, geminiAnswerModel: "gemini-2.5-pro" },
      { allowPro: true },
    );

    expect(result.ok).toBe(true);
  });

  it("skips the Gemini model check when generation is routed to a local model", () => {
    const result = evaluateBudgetGuard({
      ...cheapLive,
      modelProvider: "local",
      geminiAnswerModel: "gemini-2.5-pro",
    });

    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("MODEL_PROVIDER=local");
    expect(result.warnings.join(" ")).toContain("retrieval");
  });

  it("still enforces the single-Space limit under the local provider", () => {
    const result = evaluateBudgetGuard({
      ...cheapLive,
      modelProvider: "local",
      liveSpaceIds: ["lease-renewals", "owner-onboarding"],
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("--allow-multiple-spaces");
  });

  it("defaults MODEL_PROVIDER to gemini and reads local from the environment", () => {
    expect(readBudgetGuardConfig({ ASK_DEMO_MODE: "false" }, {}).modelProvider).toBe(
      "gemini",
    );
    expect(readBudgetGuardConfig({ MODEL_PROVIDER: "local" }, {}).modelProvider).toBe(
      "local",
    );
  });

  it("rejects extra live Spaces without --allow-multiple-spaces", () => {
    const result = evaluateBudgetGuard({
      ...cheapLive,
      liveSpaceIds: ["lease-renewals", "owner-onboarding"],
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("--allow-multiple-spaces");
  });

  it("rejects enabled Gmail notifications in live mode without --allow-notifications", () => {
    const result = evaluateBudgetGuard({ ...cheapLive, notificationsEnabled: true });

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("KB_APPROVAL_NOTIFICATIONS_ENABLED=true");
  });

  it("warns but does not fail when notifications are enabled in demo mode", () => {
    const result = evaluateBudgetGuard({ ...demoSafe, notificationsEnabled: true });

    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("KB_APPROVAL_NOTIFICATIONS_ENABLED=true");
  });

  it("refuses Pro override flags while away mode is active", () => {
    const result = evaluateBudgetGuard(
      { ...cheapLive, geminiAnswerModel: "gemini-2.5-pro" },
      { allowPro: true, awayModeActive: true },
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Away mode is active");
    expect(result.errors.join(" ")).toContain("--allow-pro");
  });

  it("allows explicit multi-Space migration posture while away mode is active", () => {
    const result = evaluateBudgetGuard(
      {
        ...cheapLive,
        liveSpaceIds: ["lease-renewals", "owner-onboarding"],
      },
      { allowMultipleSpaces: true, awayModeActive: true },
    );

    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("--allow-multiple-spaces");
    expect(result.warnings.join(" ")).toContain("bounded migration/setup work");
  });

  it("refuses live notification-send overrides while away mode is active", () => {
    const result = evaluateBudgetGuard(
      { ...cheapLive, notificationsEnabled: true },
      { allowNotifications: true, awayModeActive: true },
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("--allow-notifications");
  });

  it("warns when away mode is active and live mode is on, without failing", () => {
    const result = evaluateBudgetGuard(cheapLive, { awayModeActive: true });

    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain(
      "Away mode is active and live mode is on",
    );
  });

  it("parses the away-mode status marker", () => {
    expect(parseAwayModeStatus("AWAY_MODE_STATUS: ACTIVE")).toBe("ACTIVE");
    expect(parseAwayModeStatus("- AWAY_MODE_STATUS: INACTIVE\n")).toBe("INACTIVE");
    expect(parseAwayModeStatus("no marker here")).toBe("UNKNOWN");
  });

  it("treats a missing away-mode file as UNKNOWN (overlay safely disabled)", () => {
    expect(readAwayModeStatus("/nonexistent/away-mode.md")).toBe("UNKNOWN");
  });

  it("reads a conservative live posture from environment without a local file", () => {
    const config = readBudgetGuardConfig(
      {
        ASK_DEMO_MODE: "false",
        GEMINI_MODEL_ANSWER: "gemini-2.5-pro",
        SPACE_VERTEX_DATA_STORE_IDS: JSON.stringify({
          "lease-renewals": "store-1",
          "owner-onboarding": "store-2",
        }),
      },
      {},
    );

    expect(config.askDemoMode).toBe(false);
    expect(config.geminiAnswerModel).toBe("gemini-2.5-pro");
    expect(config.liveSpaceIds).toEqual(["lease-renewals", "owner-onboarding"]);
    expect(config.budgetCapUsd).toBe(BUDGET_CAP_USD);
  });
});
