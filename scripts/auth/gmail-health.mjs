import { safeProviderFailure } from "./provider-errors.mjs";

const SUBJECT = "integrations@pmikcmetro.com";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/** A bounded readonly mailbox check under the existing DWD grant. No grant or mailbox is changed. */
export async function checkGmailHealth({
  source,
  serviceAccount,
  subject,
  emit = () => {},
  fetchImpl = fetch,
  mintToken,
  attemptMs = 15_000,
  totalMs = 31_000,
} = {}) {
  if (
    subject?.trim().toLowerCase() !== SUBJECT ||
    !/^[^@\s]+@pmi-kc-kb-prod\.iam\.gserviceaccount\.com$/i.test(serviceAccount ?? "")
  ) {
    return {
      state: "blocked",
      code: "unexpected_delegated_identity",
      detail:
        "The configured DWD identity is outside the approved existing integration binding; no token or grant was requested.",
    };
  }
  if (
    !Number.isSafeInteger(attemptMs) ||
    attemptMs < 1 ||
    attemptMs > 30_000 ||
    !Number.isSafeInteger(totalMs) ||
    totalMs < 1 ||
    totalMs > 60_000
  )
    throw new RangeError("A bounded Gmail read budget is required.");
  const mint =
    mintToken ?? (await import("../../lib/gmail-runtime/dwd-token.ts")).mintGmailDwdToken;
  const deadline = Date.now() + totalMs;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      return {
        ...safeProviderFailure(new DOMException("", "TimeoutError")),
        attempts: attempt - 1,
        phase: "deadline",
      };
    const signal = AbortSignal.timeout(Math.min(attemptMs, remaining));
    let phase = "sign_jwt";
    try {
      const token = await mint({
        subject: SUBJECT,
        serviceAccount,
        scope: SCOPE,
        signal,
        onStage: (stage) => {
          phase = stage;
        },
        signJwt: async ({ serviceAccount: sa, payload }) => {
          const response = await source.request({
            url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(sa)}:signJwt`,
            method: "POST",
            data: { payload },
            timeout: Math.min(10_000, attemptMs),
            retry: false,
            signal,
          });
          return response.data.signedJwt;
        },
        fetchImpl: (url, options) => fetchImpl(url, { ...options, signal }),
      });
      phase = "mailbox_profile";
      const response = await fetchImpl(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        { method: "GET", headers: { Authorization: `Bearer ${token}` }, signal },
      );
      if (!response.ok) {
        const error = new Error("provider_profile_refused");
        error.status = response.status;
        throw error;
      }
      if ((await response.json()).emailAddress?.toLowerCase() !== SUBJECT)
        return {
          state: "blocked",
          code: "wrong_provider_identity",
          attempts: attempt,
          phase,
          detail:
            "The provider mailbox does not match the approved integration account. No mailbox or grant was changed.",
        };
      return {
        state: "ok",
        attempts: attempt,
        detail: `Existing readonly grant verified the exact managed mailbox${attempt === 2 ? " after one transient read retry" : ""}. No message, draft, send or staff mailbox was tested.`,
      };
    } catch (error) {
      const failure = safeProviderFailure(error);
      if (!failure.retryable || attempt === 2 || deadline - Date.now() < 300)
        return { ...failure, attempts: attempt, phase };
      emit(
        `provider gmail: transient ${failure.code} during ${phase}; one bounded readonly retry`,
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
