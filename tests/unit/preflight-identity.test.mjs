import { describe, expect, it } from "vitest";
import {
  buildIdentityChecklist,
  evaluateIdentity,
} from "../../scripts/preflight-identity.mjs";

const goodState = {
  gcloudAvailable: true,
  gcloudAccount: "josiah@pmikcmetro.com",
  adcPresent: true,
  adcAccount: "josiah@pmikcmetro.com",
  googleAppCreds: undefined,
};

// S112: the designated unattended identity. The automation principal impersonates the automation
// service account, so the ADC principal is that service account and nothing else.
const automation = {
  principal: "pmi-runner@pmikcmetro.com",
  serviceAccount: "pmi-kc-automation@pmi-kc-kb-prod.iam.gserviceaccount.com",
};

const unattendedState = {
  gcloudAvailable: true,
  gcloudAccount: automation.principal,
  impersonation: automation.serviceAccount,
  adcPresent: true,
  adcAccount: automation.serviceAccount,
  googleAppCreds: undefined,
};

describe("evaluateIdentity", () => {
  it("passes when gcloud + ADC both resolve to pmikcmetro.com and no key file is set", () => {
    const result = evaluateIdentity(goodState);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("fails when there is no active gcloud account", () => {
    const result = evaluateIdentity({ ...goodState, gcloudAccount: undefined });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((error) => error.includes("No active gcloud account")),
    ).toBe(true);
  });

  it("fails when the active gcloud account is not pmikcmetro.com", () => {
    const result = evaluateIdentity({
      ...goodState,
      gcloudAccount: "josiah.abernathy@gmail.com",
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((error) =>
        error.includes("not the authorized local managed account"),
      ),
    ).toBe(true);
  });

  it("fails when GOOGLE_APPLICATION_CREDENTIALS (a key file) is set", () => {
    const result = evaluateIdentity({
      ...goodState,
      googleAppCreds: "C:/keys/sa.json",
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((error) =>
        error.includes("GOOGLE_APPLICATION_CREDENTIALS is set"),
      ),
    ).toBe(true);
  });

  it("fails when ADC is missing", () => {
    const result = evaluateIdentity({
      ...goodState,
      adcPresent: false,
      adcAccount: null,
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((error) =>
        error.includes("Application Default Credentials are missing"),
      ),
    ).toBe(true);
  });

  it("fails when the ADC principal is not pmikcmetro.com", () => {
    const result = evaluateIdentity({
      ...goodState,
      adcAccount: "someone@gmail.com",
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((error) =>
        error.includes("ADC principal is not the verified local managed account"),
      ),
    ).toBe(true);
  });

  it("fails when ADC is present but the principal cannot be resolved", () => {
    const result = evaluateIdentity({ ...goodState, adcAccount: null });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("ADC principal"))).toBe(true);
  });
  it("fails when gcloud is unavailable", () => {
    const result = evaluateIdentity({ ...goodState, gcloudAvailable: false });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("gcloud CLI not found"))).toBe(
      true,
    );
  });
});

describe("evaluateIdentity (S112 automation identity)", () => {
  it("refuses the retired automation path for the local host", () => {
    const result = evaluateIdentity(unattendedState, { automation });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("still refuses a key file for the automation identity", () => {
    const result = evaluateIdentity(
      { ...unattendedState, googleAppCreds: "/tmp/key.json" },
      { automation },
    );
    expect(result.ok).toBe(false);
  });

  it("refuses any other service account as the ADC principal", () => {
    const result = evaluateIdentity(
      { ...unattendedState, adcAccount: "other@pmi-kc-kb-prod.iam.gserviceaccount.com" },
      { automation },
    );
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((error) => error.includes("is not the verified local")),
    ).toBe(true);
  });

  it("refuses the service-account ADC principal when no impersonation is configured", () => {
    const result = evaluateIdentity(
      { ...unattendedState, impersonation: null },
      { automation },
    );
    expect(result.ok).toBe(false);
  });

  it("under --unattended requires the specifically approved local account", () => {
    const attended = evaluateIdentity(goodState, { automation, unattended: true });
    expect(attended.ok).toBe(true);
    expect(attended.errors).toEqual([]);
    const unattended = evaluateIdentity(unattendedState, {
      automation,
      unattended: true,
    });
    expect(unattended.ok).toBe(false);
  });
});

describe("buildIdentityChecklist", () => {
  it("marks the gcloud/ADC row ok for a good state and FAIL otherwise", () => {
    const ok = buildIdentityChecklist(goodState).find((item) =>
      item.system.startsWith("(b)"),
    );
    expect(ok?.status).toBe("ok");

    const bad = buildIdentityChecklist({
      ...goodState,
      gcloudAccount: "x@gmail.com",
    }).find((item) => item.system.startsWith("(b)"));
    expect(bad?.status).toBe("FAIL");
  });

  it("marks the retired automation identity FAIL and shows its impersonation", () => {
    const row = buildIdentityChecklist(unattendedState, { automation }).find((item) =>
      item.system.startsWith("(b)"),
    );
    expect(row?.status).toBe("FAIL");
    expect(row?.detail).toContain("impersonating");
  });

  it("lists all six identity systems with manual-verify for the non-probeable ones", () => {
    const checklist = buildIdentityChecklist(goodState);
    expect(checklist).toHaveLength(6);
    const connector = checklist.find((item) => item.system.startsWith("(a)"));
    expect(connector?.status).toBe("verify manually");
  });
});
