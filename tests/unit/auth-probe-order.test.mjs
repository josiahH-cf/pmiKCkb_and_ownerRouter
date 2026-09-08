import { describe, expect, it, vi } from "vitest";
import { probeAdc, probeGcloud } from "../../scripts/auth/ensure.mjs";
import { inspectCredentialStore } from "../../scripts/auth/credential-store.mjs";
import { verifyEnrollment } from "../../scripts/auth/verify-enrollment.mjs";

const owner = "josiah@pmikcmetro.com";
describe("local credential inspection precedes refresh", () => {
  it.each(["canary-admin@pmikcmetro.com", "someone@gmail.com", ""])(
    "never mints CLI tokens for %s",
    (account) => {
      const mint = vi.fn();
      const capture = (args) =>
        args.includes("auth/impersonate_service_account")
          ? "(unset)"
          : args.includes("account")
            ? account
            : args.includes("list")
              ? account
              : "available";
      probeGcloud({}, { capture, tokenProbe: mint });
      expect(mint).not.toHaveBeenCalled();
    },
  );
  it("status does not refresh even the authorized CLI identity", () => {
    const mint = vi.fn();
    probeGcloud(
      {},
      {
        statusOnly: true,
        tokenProbe: mint,
        capture: (args) =>
          args.includes("auth/impersonate_service_account") ? "(unset)" : owner,
      },
    );
    expect(mint).not.toHaveBeenCalled();
  });
  it.each(["principal_unknown", "wrong_store", "credential_type_forbidden"])(
    "refuses %s ADC before constructing a client",
    async (errorKind) => {
      const createClient = vi.fn();
      const result = await probeAdc(
        {},
        { createClient, inspect: () => ({ present: true, errorKind }) },
      );
      expect(result.errorKind).toBe(errorKind);
      expect(createClient).not.toHaveBeenCalled();
    },
  );
  it("status reads metadata without constructing a refresh client", async () => {
    const createClient = vi.fn();
    const result = await probeAdc(
      {},
      {
        statusOnly: true,
        createClient,
        inspect: () => ({ present: true, principal: owner }),
      },
    );
    expect(result.fresh).toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
  });
  it("uses library refresh only after binding and checks Google's returned identity", async () => {
    const getAccessToken = vi.fn(async () => ({ token: "fixture-opaque-token" }));
    const result = await probeAdc(
      {},
      {
        inspect: () => ({ present: true, principal: owner }),
        createClient: async () => ({ getAccessToken }),
        fetchImpl: async () => ({ ok: true, json: async () => ({ email: owner }) }),
      },
    );
    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ fresh: true, principal: owner });
    expect(JSON.stringify(result)).not.toContain("fixture-opaque-token");
  });
  it("refuses a redirected store and a service-account key without reading its body", () => {
    const read = vi.fn();
    expect(
      inspectCredentialStore({ env: { CLOUDSDK_CONFIG: "/mnt/c/foreign-store" }, read })
        .errorKind,
    ).toBe("wrong_store");
    expect(
      inspectCredentialStore({
        env: { GOOGLE_APPLICATION_CREDENTIALS: "/ignored/key" },
        read,
      }).errorKind,
    ).toBe("credential_type_forbidden");
    expect(read).not.toHaveBeenCalled();
  });
  it("never binds an enrollment when Google observes another account", async () => {
    const bind = vi.fn();
    await expect(
      verifyEnrollment({
        env: {},
        bind,
        probeCli: () => ({ activeAccount: owner }),
        inspect: () => ({ credentials: {}, errorKind: "principal_unknown" }),
        clientFor: async () => ({ getAccessToken: async () => ({ token: "fixture" }) }),
        principalFor: async () => "canary-editor@pmikcmetro.com",
      }),
    ).rejects.toThrow("Google did not verify");
    expect(bind).not.toHaveBeenCalled();
  });
});
