import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveIdentities } from "../../scripts/auth/identities.mjs";
import { assessCredentials, exitCodeFor } from "../../scripts/auth/plan.mjs";

const identities = resolveIdentities({});
const probe = {
  platform: "linux",
  wsl: true,
  gcloud: {
    available: true,
    activeAccount: "josiah@pmikcmetro.com",
    impersonation: null,
    storeAccounts: ["josiah@pmikcmetro.com"],
    tokenFresh: true,
  },
  adc: { present: true, fresh: true, principal: "josiah@pmikcmetro.com" },
};
const assess = (value = probe) =>
  assessCredentials(value, {
    identities,
    need: ["gcloud", "adc"],
    unattended: true,
  });

describe("owner-approved local authentication policy (2026-09-08)", () => {
  it("accepts the exact local managed account for unattended CLI and ADC without impersonation", () => {
    const result = assess();
    expect(exitCodeFor(result.items)).toBe(0);
    expect(result.repairs).toEqual([]);
  });
  it("rejects a different managed CLI account before proposing any account switch", () => {
    const result = assess({
      ...probe,
      gcloud: { ...probe.gcloud, activeAccount: "canary-admin@pmikcmetro.com" },
    });
    expect(result.items.find((x) => x.credential === "gcloud").code).toBe(
      "unexpected_identity",
    );
    expect(result.repairs).toEqual([]);
  });
  it("never treats unresolved ADC identity as ready", () => {
    const result = assessCredentials(
      { ...probe, adc: { ...probe.adc, principal: null } },
      {
        identities,
        need: ["adc"],
        unattended: false,
      },
    );
    expect(exitCodeFor(result.items)).toBe(2);
  });
  it("reports unprobed status as unverified, never token readiness", () => {
    const result = assess({
      ...probe,
      gcloud: { ...probe.gcloud, tokenFresh: undefined },
      adc: { ...probe.adc, fresh: undefined },
    });
    expect(exitCodeFor(result.items)).toBe(2);
    expect(result.items.filter((x) => x.state === "unverified")).toHaveLength(2);
  });
  it("requires successful GitHub authentication even when a token variable exists", () => {
    const result = assessCredentials(
      { gh: { available: true, loggedIn: false, tokenEnv: true } },
      {
        identities,
        need: ["gh"],
      },
    );
    expect(exitCodeFor(result.items)).toBe(2);
  });
  it("keeps both familiar sign-in commands in WSL", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    );
    expect(pkg.scripts["auth:session"]).toBe("bash scripts/auth/enroll.sh");
    expect(pkg.scripts["auth:enroll"]).toBe("bash scripts/auth/enroll.sh");
  });
});
