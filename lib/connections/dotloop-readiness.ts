// S106: the pure Dotloop readiness projection.
//
// It answers one question with one exact reason list: can renewal document work reach Dotloop right
// now, and if not, what precisely is missing. It reaches nothing: connection status, probe results,
// and the selection record are all inputs, so readiness can never report `connected` on the strength
// of configuration alone.

import { DOTLOOP_OAUTH_ENV } from "@/lib/connections/dotloop-oauth";
import { DOTLOOP_SCOPES } from "@/lib/integrations/dotloop/client";

export const DOTLOOP_READINESS_STATES = [
  "disconnected",
  "connecting",
  "connected",
  "refresh_needed",
  "unavailable",
  "missing_resources",
] as const;

export type DotloopReadinessState = (typeof DOTLOOP_READINESS_STATES)[number];

export const DOTLOOP_READINESS_REASONS = [
  "client_registration",
  "callback_configuration",
  "secure_storage",
  "account_connection",
  "compatible_profile",
  "renewal_template",
  "loop_write_scope",
] as const;

export type DotloopReadinessReason = (typeof DOTLOOP_READINESS_REASONS)[number];

export const DOTLOOP_READINESS_REASON_TEXT: Record<DotloopReadinessReason, string> = {
  client_registration:
    "The Dotloop application registration is not configured in approved secret storage.",
  callback_configuration: "The Dotloop authorization callback address is not configured.",
  secure_storage: "Secure credential storage is not configured, so no token can be held.",
  account_connection: "No Dotloop account read succeeded for this connection.",
  compatible_profile: "No Dotloop profile is selected for renewal work.",
  renewal_template: "No Dotloop renewal template is selected.",
  loop_write_scope: "The connection does not carry the loop write scope.",
};

/** The connection lifecycle states readiness distinguishes, mapped from the connector store. */
export type DotloopConnectionStatus =
  | "none"
  | "connecting"
  | "connected"
  | "refresh_needed"
  | "revocation_pending"
  | "revoked";

export interface DotloopProbeResult {
  /** True only when a real profile read answered for this connection. */
  readonly profileOk: boolean;
  readonly grantedScopes: readonly string[];
  readonly subscriptionsReadable: boolean;
}

export interface DotloopReadinessInput {
  readonly config: { readonly configured: boolean; readonly missing: readonly string[] };
  readonly vaultCapability: "configured" | "not_configured";
  readonly connection: { readonly status: DotloopConnectionStatus };
  /** Null when no probe has run; readiness never assumes a probe it did not observe. */
  readonly probe: DotloopProbeResult | null;
  readonly selection: {
    readonly profileId: string | null;
    readonly templateId: string | null;
  };
}

export interface DotloopReadiness {
  readonly state: DotloopReadinessState;
  readonly reasons: readonly DotloopReadinessReason[];
  readonly webhooksAvailable: boolean;
  /**
   * Always false: the official Public API v2 documents no e-signature send or signature-status
   * operation, so the application never claims one. Signature work is a handoff into Dotloop.
   */
  readonly signatureApiAvailable: false;
}

function configurationReasons(
  missing: readonly string[],
): readonly DotloopReadinessReason[] {
  const reasons: DotloopReadinessReason[] = [];
  if (
    missing.includes(DOTLOOP_OAUTH_ENV.clientId) ||
    missing.includes(DOTLOOP_OAUTH_ENV.clientSecret)
  ) {
    reasons.push("client_registration");
  }
  if (missing.includes(DOTLOOP_OAUTH_ENV.redirectUri)) {
    reasons.push("callback_configuration");
  }
  return reasons.length > 0 ? reasons : ["client_registration"];
}

/** One deterministic readiness answer over connection, probe, and selection facts. */
export function projectDotloopReadiness(input: DotloopReadinessInput): DotloopReadiness {
  const webhooksAvailable = input.probe?.subscriptionsReadable === true;
  const build = (
    state: DotloopReadinessState,
    reasons: readonly DotloopReadinessReason[],
  ): DotloopReadiness => ({
    state,
    reasons,
    webhooksAvailable,
    signatureApiAvailable: false,
  });

  if (!input.config.configured) {
    return build("unavailable", configurationReasons(input.config.missing));
  }
  if (input.vaultCapability !== "configured") {
    return build("unavailable", ["secure_storage"]);
  }
  if (input.connection.status === "connecting") return build("connecting", []);
  if (input.connection.status === "refresh_needed") return build("refresh_needed", []);
  if (
    input.connection.status === "none" ||
    input.connection.status === "revoked" ||
    input.connection.status === "revocation_pending"
  ) {
    return build("disconnected", []);
  }

  // Connected, but only a real probe success proves the account is reachable.
  if (!input.probe || !input.probe.profileOk) {
    return build("unavailable", ["account_connection"]);
  }

  const missing: DotloopReadinessReason[] = [];
  if (!input.selection.profileId) missing.push("compatible_profile");
  if (!input.selection.templateId) missing.push("renewal_template");
  if (!input.probe.grantedScopes.includes(loopWriteScope())) {
    missing.push("loop_write_scope");
  }
  if (missing.length > 0) return build("missing_resources", missing);
  return build("connected", []);
}

function loopWriteScope(): string {
  return DOTLOOP_SCOPES[3];
}
