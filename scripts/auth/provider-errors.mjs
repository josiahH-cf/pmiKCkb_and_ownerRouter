const TRANSIENT_NETWORK = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const KINDS = new Set([
  "refresh_needed",
  "access_denied",
  "rate_limited",
  "unavailable",
  "not_found",
  "malformed_response",
]);
const LOCAL_CODES = new Set([
  "registered_configuration_unavailable",
  "local_rentvine_credentials_missing",
  "serving_environment_not_production_live",
  "dotloop_vault_binding_mismatch",
  "canonical_revision_unresolved",
  "unexpected_delegated_identity",
  "invalid_configured_store_map",
  "unsupported_search_location",
  "configured_secret_reference_missing",
  "secret_project_mismatch",
  "dotloop_configuration_incomplete",
]);

/** Closed categories only: never provider bodies, token values, signed assertions or raw messages. */
export function safeProviderFailure(error) {
  const message = error instanceof Error ? error.message.slice(0, 500) : "";
  const extracted = /\bHTTP[ :]*(\d{3})\b/.exec(message)?.[1];
  const status = Number(error?.response?.status ?? error?.status ?? extracted ?? 0);
  const networkCode = error?.cause?.code ?? error?.code;
  const timeout =
    error?.name === "TimeoutError" ||
    error?.name === "AbortError" ||
    /TIMEOUT|ETIMEDOUT/.test(String(networkCode ?? ""));
  const network = timeout || TRANSIENT_NETWORK.has(networkCode);
  const localCode = LOCAL_CODES.has(error?.message) ? error.message : null;
  const kind = KINDS.has(error?.kind) ? error.kind : null;
  const retryable =
    !localCode &&
    !kind &&
    (status === 408 ||
      status === 429 ||
      (status >= 500 && status <= 599) ||
      (network && !status));
  return {
    state: "blocked",
    code:
      localCode ??
      kind ??
      (status === 401
        ? "authentication_refused"
        : status === 403
          ? "permission_denied"
          : status === 400
            ? "provider_request_refused"
            : network
              ? timeout
                ? "network_timeout"
                : "network_unavailable"
              : "provider_read_unavailable"),
    httpStatus: status >= 100 && status <= 599 ? status : null,
    retryable: Boolean(retryable),
    detail:
      status >= 100 && status <= 599
        ? `Safe provider read failed (HTTP ${status}); provider bodies and credentials are suppressed.`
        : network
          ? "The provider read encountered a bounded network failure; credential expiry is not inferred."
          : "Safe provider read did not complete; this is not proof of expired credentials.",
  };
}
