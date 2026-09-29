import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectReleasePrerequisites,
  costControlsReady,
  prerequisiteAuthenticationReady,
} from "../../scripts/release-prerequisites.mjs";

const account = "01A5A3-65CA5A-614D45",
  project = "pmi-kc-kb-prod",
  principal = "josiah@pmikcmetro.com";
const topic = { name: `projects/${project}/topics/budget-guardrail-topic` };
const channels = ["16287730102411889527", "13690954259271761585"].map((id) => ({
  name: `projects/${project}/notificationChannels/${id}`,
  type: "email",
  enabled: true,
}));
const budgets = [
  ["15ddc8d6-e96e-4696-9d3c-c09e23997206", "25", false, false],
  ["033af8c0-8f21-48af-b89b-0632896e5018", "100", true, false],
  ["82962d7e-b340-4253-8348-38caff16e88a", "100", false, true],
].map(([id, amount, stop, all]) => ({
  name: `billingAccounts/${account}/budgets/${id}`,
  amount: { specifiedAmount: { units: amount, currencyCode: "USD" } },
  budgetFilter: {
    calendarPeriod: "MONTH",
    creditTypesTreatment: "INCLUDE_ALL_CREDITS",
    ...(all ? {} : { projects: ["projects/558870356522"] }),
  },
  thresholdRules: (stop ? [0.5, 0.9, 1] : [1]).map((thresholdPercent) => ({
    thresholdPercent,
    spendBasis: "CURRENT_SPEND",
  })),
  notificationsRule: stop
    ? { pubsubTopic: topic.name, schemaVersion: "1.0" }
    : { monitoringNotificationChannels: channels.map((c) => c.name) },
}));
const controls = () =>
  structuredClone({
    budgets,
    channels,
    topic,
    guardrail: {
      state: "ACTIVE",
      buildConfig: { runtime: "nodejs22" },
      serviceConfig: { environmentVariables: { KILL_SWITCH_CAP_USD: "100" } },
      eventTrigger: { pubsubTopic: topic.name },
    },
  });
const auth = () => ({
  exitCode: 0,
  items: ["gcloud", "adc", "canary"].map((credential) => ({
    credential,
    state: "ok",
    identity: principal,
    ...(credential === "canary" ? { label: "admin" } : {}),
  })),
});
const roots = [];
afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});
const permit = {
  state: "prepared",
  sha: "a".repeat(40),
  runId: "12345678-1234-1234-1234-123456789abc",
};
const now = Date.parse("2026-09-29T00:00:00Z");
function fixtureExec(calls, mutate = (value) => value) {
  const state = controls();
  return async (file, args) => {
    calls.push([file, args]);
    let value;
    if (args[0] === "scripts/auth/ensure.mjs") value = auth();
    else if (args[0] === "beta" && args[1] === "billing")
      value = {
        projectId: project,
        billingEnabled: true,
        billingAccountName: `billingAccounts/${account}`,
      };
    else if (args[0] === "billing") value = state.budgets;
    else if (args[0] === "functions") value = state.guardrail;
    else if (args[0] === "pubsub") value = state.topic;
    else value = state.channels.find((c) => args.includes(c.name));
    return JSON.stringify(mutate(value, args));
  };
}
describe("fresh release prerequisite collection", () => {
  it("requires exact existing cost controls and refuses missing, duplicate or narrowed protections", () => {
    expect(costControlsReady(controls())).toBe(true);
    for (const change of [
      (c) => c.budgets.pop(),
      (c) => c.budgets.push(c.budgets[0]),
      (c) => {
        c.budgets[0].amount.specifiedAmount.units = "100";
      },
      (c) => {
        c.budgets[1].budgetFilter.services = ["limited"];
      },
      (c) => {
        c.budgets[1].notificationsRule.pubsubTopic = "wrong";
      },
      (c) => {
        c.budgets[2].budgetFilter.projects = ["projects/558870356522"];
      },
      (c) => {
        c.guardrail.serviceConfig.environmentVariables.KILL_SWITCH_CAP_USD = "101";
      },
      (c) => {
        c.guardrail.state = "FAILED";
      },
      (c) => {
        c.channels[0].enabled = false;
      },
      (c) => {
        c.topic.name = "wrong";
      },
    ]) {
      const state = controls();
      change(state);
      expect(costControlsReady(state)).toBe(false);
    }
  });
  it("refuses unprobed, unexpected and duplicate authentication identities", () => {
    expect(prerequisiteAuthenticationReady(auth())).toEqual({
      auth_cli_adc: "ready",
      admin_browser: "ready",
    });
    for (const change of [
      (a) => {
        a.items[0].state = "unverified";
      },
      (a) => {
        a.items[1].identity = "unexpected@pmikcmetro.com";
      },
      (a) => a.items.push(a.items[0]),
    ]) {
      const state = auth();
      change(state);
      expect(prerequisiteAuthenticationReady(state).auth_cli_adc).toBe("blocked");
    }
    const state = auth();
    state.items[2].label = "editor";
    expect(prerequisiteAuthenticationReady(state).admin_browser).toBe("blocked");
  });
  it("performs only fresh probes/reads and preserves immutable sanitized attempts", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "release-prerequisites-"));
    roots.push(stateDir);
    const calls = [],
      exec = fixtureExec(calls);
    const first = await collectReleasePrerequisites({
      root: stateDir,
      stateDir,
      permit,
      now,
      exec,
      assertHeld: () => {},
      assertRuntime: () => {},
    });
    expect(Object.values(first.receipt.checks)).toEqual([
      "ready",
      "ready",
      "ready",
      "ready",
    ]);
    const firstHistory = readdirSync(stateDir).find((name) =>
      name.startsWith("prerequisites-"),
    );
    const before = readFileSync(join(stateDir, firstHistory), "utf8");
    const second = await collectReleasePrerequisites({
      root: stateDir,
      stateDir,
      permit,
      now: now + 1,
      assertHeld: () => {},
      assertRuntime: () => {},
      exec: fixtureExec(calls, (value, args) =>
        args[1] === "billing"
          ? { ...value, billingEnabled: false, secret: "MUST_NOT_PERSIST" }
          : value,
      ),
    });
    expect(second.receipt.checks.billing).toBe("blocked");
    expect(readFileSync(join(stateDir, firstHistory), "utf8")).toBe(before);
    expect(readFileSync(first.path, "utf8")).not.toContain("MUST_NOT_PERSIST");
    expect(
      readdirSync(stateDir).filter((name) => name.startsWith("prerequisites-")),
    ).toHaveLength(2);
    expect(calls).toHaveLength(16);
    expect(
      calls
        .flatMap(([, args]) => args)
        .some((arg) => ["update", "create", "enable", "login", "delete"].includes(arg)),
    ).toBe(false);
  });
  it("stops cloud reads after CLI failure and never persists a raw error", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "release-prerequisites-"));
    roots.push(stateDir);
    let attempts = 0;
    const { receipt, path } = await collectReleasePrerequisites({
      root: stateDir,
      stateDir,
      permit,
      now,
      assertHeld: () => {},
      assertRuntime: () => {},
      exec: async () => {
        attempts++;
        throw new Error("PRIVATE_RAW_RESPONSE");
      },
    });
    expect(attempts).toBe(1);
    expect(Object.values(receipt.checks)).toEqual([
      "blocked",
      "blocked",
      "blocked",
      "blocked",
    ]);
    expect(readFileSync(path, "utf8")).not.toContain("PRIVATE_RAW_RESPONSE");
  });
  it("preserves no readiness receipt when lock ownership is lost during a probe", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "release-prerequisites-"));
    roots.push(stateDir);
    let held = true;
    const calls = [];
    const fixture = fixtureExec(calls);
    await expect(
      collectReleasePrerequisites({
        root: stateDir,
        stateDir,
        permit,
        now,
        assertHeld: () => {
          if (!held) throw new Error("release_lock_lost");
        },
        assertRuntime: () => {},
        exec: async (...args) => {
          const value = await fixture(...args);
          held = false;
          return value;
        },
      }),
    ).rejects.toThrow("release_lock_lost");
    expect(calls).toHaveLength(1);
    expect(readdirSync(stateDir)).toEqual([]);
  });
  it("refuses an unapproved runtime before auth, cloud reads or evidence persistence", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "release-prerequisites-"));
    roots.push(stateDir);
    const calls = [];
    await expect(
      collectReleasePrerequisites({
        root: stateDir,
        stateDir,
        permit,
        now,
        assertHeld: () => {},
        assertRuntime: () => {
          throw new Error("native_release_runtime_required");
        },
        exec: fixtureExec(calls),
      }),
    ).rejects.toThrow("native_release_runtime_required");
    expect(calls).toEqual([]);
    expect(readdirSync(stateDir)).toEqual([]);
  });
});
