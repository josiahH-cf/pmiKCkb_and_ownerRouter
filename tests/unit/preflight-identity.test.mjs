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
        error.includes("josiah.abernathy@gmail.com is not @pmikcmetro.com"),
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
        error.includes("ADC principal someone@gmail.com is not @pmikcmetro.com"),
      ),
    ).toBe(true);
  });

  it("warns but does not fail when ADC is present but the principal cannot be resolved", () => {
    const result = evaluateIdentity({ ...goodState, adcAccount: null });
    expect(result.ok).toBe(true);
    expect(
      result.warnings.some((warning) => warning.includes("Could not resolve the ADC")),
    ).toBe(true);
  });

  it("degrades to a warning (not a failure) when gcloud is unavailable", () => {
    const result = evaluateIdentity({
      gcloudAvailable: false,
      gcloudAccount: undefined,
      adcPresent: false,
      adcAccount: null,
      googleAppCreds: undefined,
    });
    expect(result.ok).toBe(true);
    expect(
      result.warnings.some((warning) => warning.includes("gcloud CLI not found")),
    ).toBe(true);
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

  it("lists all six identity systems with manual-verify for the non-probeable ones", () => {
    const checklist = buildIdentityChecklist(goodState);
    expect(checklist).toHaveLength(6);
    const connector = checklist.find((item) => item.system.startsWith("(a)"));
    expect(connector?.status).toBe("verify manually");
  });
});
