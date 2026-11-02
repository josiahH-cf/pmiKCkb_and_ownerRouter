import { afterEach, describe, expect, it, vi } from "vitest";
import { checkGmailHealth } from "../../scripts/auth/gmail-health.mjs";
import { safeProviderFailure } from "../../scripts/auth/provider-errors.mjs";
import { mintGmailDwdToken } from "../../lib/gmail-runtime/dwd-token";

const identity = {
  subject: "integrations@pmikcmetro.com",
  serviceAccount: "reader@pmi-kc-kb-prod.iam.gserviceaccount.com",
};
afterEach(() => {
  vi.useRealTimers();
});
function fixture() {
  return {
    ...identity,
    source: {
      request: vi.fn(async () => ({ data: { signedJwt: "fixture-assertion" } })),
    },
    mintToken: vi.fn(async () => "fixture-token"),
    fetchImpl: vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ emailAddress: identity.subject }),
    })),
  };
}
describe("bounded same-grant Gmail health", () => {
  it("validates the expected readonly mailbox without sending or accessing messages", async () => {
    const deps = fixture();
    expect(await checkGmailHealth(deps)).toMatchObject({ state: "ok", attempts: 1 });
    expect(deps.mintToken).toHaveBeenCalledWith(
      expect.objectContaining({
        ...identity,
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(deps.fetchImpl).toHaveBeenCalledOnce();
    expect(deps.fetchImpl.mock.calls[0][0]).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    );
  });
  it.each([401, 403, 400])(
    "does not retry or reinterpret HTTP %s as local credential expiry",
    async (status) => {
      const deps = fixture();
      deps.fetchImpl.mockResolvedValue({ ok: false, status });
      expect(await checkGmailHealth(deps)).toMatchObject({
        state: "blocked",
        httpStatus: status,
        attempts: 1,
        retryable: false,
        phase: "mailbox_profile",
      });
      expect(deps.mintToken).toHaveBeenCalledOnce();
    },
  );
  it("retries exactly once after a transient profile failure", async () => {
    const deps = fixture();
    deps.fetchImpl.mockResolvedValueOnce({ ok: false, status: 503 });
    expect(await checkGmailHealth(deps)).toMatchObject({ state: "ok", attempts: 2 });
    expect(deps.fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("stops after a second transient failure and preserves its exact phase", async () => {
    const deps = fixture();
    deps.fetchImpl.mockResolvedValue({ ok: false, status: 429 });
    expect(await checkGmailHealth(deps)).toMatchObject({
      state: "blocked",
      httpStatus: 429,
      attempts: 2,
      phase: "mailbox_profile",
    });
    expect(deps.fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("rejects a wrong mailbox without a retry or any grant change", async () => {
    const deps = fixture();
    deps.fetchImpl.mockResolvedValue({
      ok: true,
      json: async () => ({ emailAddress: "another@pmikcmetro.com" }),
    });
    expect(await checkGmailHealth(deps)).toMatchObject({
      state: "blocked",
      code: "wrong_provider_identity",
      attempts: 1,
    });
    expect(deps.fetchImpl).toHaveBeenCalledOnce();
  });
  it("does not mint a token for an unapproved configured identity", async () => {
    const deps = fixture();
    deps.subject = "other@pmikcmetro.com";
    expect(await checkGmailHealth(deps)).toMatchObject({
      code: "unexpected_delegated_identity",
    });
    expect(deps.mintToken).not.toHaveBeenCalled();
  });
  it("passes one shared abort signal through signing, exchange and profile read", async () => {
    const deps = fixture();
    deps.mintToken.mockImplementation(async (options) => {
      options.onStage("sign_jwt");
      await options.signJwt({
        serviceAccount: identity.serviceAccount,
        payload: "fixture-json-payload",
      });
      options.onStage("token_exchange");
      return "fixture-token";
    });
    expect(await checkGmailHealth(deps)).toMatchObject({ state: "ok" });
    const signal = deps.mintToken.mock.calls[0][0].signal;
    expect(deps.source.request).toHaveBeenCalledWith(
      expect.objectContaining({ signal, timeout: 10000, retry: false }),
    );
    expect(deps.fetchImpl.mock.calls[0][1].signal).toBe(signal);
  });
  it("bounds a stalled profile request with the attempt deadline and at most two attempts", async () => {
    const deps = fixture();
    deps.fetchImpl.mockImplementation(
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason), {
            once: true,
          });
        }),
    );
    const keepAlive = setInterval(() => {}, 50);
    try {
      expect(
        await checkGmailHealth({ ...deps, attemptMs: 20, totalMs: 500 }),
      ).toMatchObject({ state: "blocked", code: "network_timeout", attempts: 2 });
    } finally {
      clearInterval(keepAlive);
    }
  });
  it("extracts only safe HTTP/network categories while suppressing raw messages", () => {
    const error = new Error(
      "Gmail DWD token exchange failed (HTTP 400): fixture-sensitive-payload",
    );
    expect(safeProviderFailure(error)).toMatchObject({
      code: "provider_request_refused",
      httpStatus: 400,
      retryable: false,
    });
    expect(JSON.stringify(safeProviderFailure(error))).not.toContain(
      "fixture-sensitive-payload",
    );
    expect(
      safeProviderFailure(
        new TypeError("fetch failed", { cause: { code: "ETIMEDOUT" } }),
      ),
    ).toMatchObject({ code: "network_timeout", retryable: true });
  });
});

describe("existing DWD helper transport seam", () => {
  it("retains exactly one approved scope, subject and JWT lifetime with injected transports", async () => {
    const signJwt = vi.fn(async () => "fixture-signed-assertion");
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: "fixture-access-token" }),
    }));
    const signal = new AbortController().signal;
    expect(
      await mintGmailDwdToken({
        ...identity,
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        signJwt,
        fetchImpl,
        signal,
      }),
    ).toBe("fixture-access-token");
    const payload = JSON.parse(signJwt.mock.calls[0][0].payload);
    expect(payload).toMatchObject({
      iss: identity.serviceAccount,
      sub: identity.subject,
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      aud: "https://oauth2.googleapis.com/token",
    });
    expect(payload.exp - payload.iat).toBe(3600);
    expect(fetchImpl.mock.calls[0][1].signal).toBe(signal);
  });
  it("validates identity and scope before invoking any injected network transport", async () => {
    const signJwt = vi.fn();
    await expect(
      mintGmailDwdToken({ ...identity, scope: "https://mail.google.com/", signJwt }),
    ).rejects.toThrow("approved");
    await expect(
      mintGmailDwdToken({
        ...identity,
        subject: "other@example.com",
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        signJwt,
      }),
    ).rejects.toThrow();
    expect(signJwt).not.toHaveBeenCalled();
  });
});
