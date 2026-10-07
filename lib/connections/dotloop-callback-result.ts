// S106: the safe, code-free outcome names the Dotloop callback returns to the Connections screen.
// Client-safe. The final application URL carries only one of these names, never a code or token.

export const DOTLOOP_CALLBACK_RESULTS = [
  "connected",
  "connected_unverified",
  "invalid_state",
  "denied",
  "exchange_failed",
  "storage_unavailable",
  "not_configured",
  "refused",
  "cleanup_needed",
  "sign_in_required",
  "not_permitted",
  "failed",
] as const;

export type DotloopCallbackResult = (typeof DOTLOOP_CALLBACK_RESULTS)[number];

export const DOTLOOP_CALLBACK_QUERY = "dotloop";

export function dotloopCallbackResultPath(result: DotloopCallbackResult): string {
  return `/connections?${DOTLOOP_CALLBACK_QUERY}=${result}#connector-dotloop`;
}

export function readDotloopCallbackResult(value: unknown): DotloopCallbackResult | null {
  return typeof value === "string" &&
    (DOTLOOP_CALLBACK_RESULTS as readonly string[]).includes(value)
    ? (value as DotloopCallbackResult)
    : null;
}

/** Operator feedback for each outcome. Only `connected` reports a usable connection. */
export const DOTLOOP_CALLBACK_FEEDBACK: Record<
  DotloopCallbackResult,
  { tone: "success" | "caution" | "error"; message: string }
> = {
  connected: {
    tone: "success",
    message:
      "Dotloop is connected and its account check passed. Review the account and select the renewal resources below.",
  },
  connected_unverified: {
    tone: "caution",
    message:
      "Dotloop authorized the app, but the account check did not complete. Refresh resources to verify the connection.",
  },
  invalid_state: {
    tone: "error",
    message:
      "That authorization was not started here by you, or it expired or was already used. Nothing was connected. Start again with Connect.",
  },
  denied: {
    tone: "caution",
    message: "Dotloop authorization was declined. Nothing was connected.",
  },
  exchange_failed: {
    tone: "error",
    message:
      "Dotloop did not accept the authorization. Nothing was connected. Start again with Connect.",
  },
  storage_unavailable: {
    tone: "error",
    message:
      "Secure credential storage is unavailable, so the authorization could not be kept. Nothing was connected.",
  },
  not_configured: {
    tone: "error",
    message:
      "The Dotloop application configuration is incomplete. Nothing was connected.",
  },
  refused: {
    tone: "caution",
    message:
      "A Dotloop connection already exists or is being disconnected. The new authorization was discarded.",
  },
  cleanup_needed: {
    tone: "error",
    message:
      "The new authorization was discarded, but removing its stored credential needs recovery. Ask an Admin to review secure storage.",
  },
  sign_in_required: {
    tone: "error",
    message: "Sign in to the app first, then start the Dotloop connection again.",
  },
  not_permitted: {
    tone: "error",
    message: "Only an Admin can connect Dotloop. Nothing was connected.",
  },
  failed: {
    tone: "error",
    message:
      "The Dotloop connection could not be completed. Nothing was claimed connected.",
  },
};
