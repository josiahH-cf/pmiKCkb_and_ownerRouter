// S106: the pure Dotloop readiness projection.
//
// It answers one question with one exact reason list: can renewal document work reach Dotloop right
// now, and if not, what precisely is missing. It reaches nothing: configuration, the connection
// record, the cached resource observation and the Admin selection are all inputs, so readiness can
// never report `connected` on the strength of configuration alone. Optional webhook availability and
// the absence of any signature API never disable supported packet work, and no readiness state opens
// an Action Registry key.

import { DOTLOOP_OAUTH_ENV } from "@/lib/connections/dotloop-env-names";

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
  "provider_scope_unreported",
  "observation_stale",
  "selected_resource_unavailable",
  "selected_resource_unsupported",
  "transaction_settings",
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
  provider_scope_unreported:
    "Dotloop did not report the granted scopes, so loop write access is not verified.",
  observation_stale:
    "The saved Dotloop resource check is older than this connection or a day old. Refresh it.",
  selected_resource_unavailable:
    "A selected Dotloop profile or template was not found in the latest resource check.",
  selected_resource_unsupported:
    "A selected Dotloop profile or template cannot be used for lease loops.",
  transaction_settings: "Choose the lease transaction type and initial loop status.",
};

/** The exact next step for each reason, so every hold names what to do. */
export const DOTLOOP_READINESS_NEXT_ACTION: Record<DotloopReadinessReason, string> = {
  client_registration: "Release the reviewed Dotloop client configuration.",
  callback_configuration: "Release the reviewed Dotloop callback address.",
  secure_storage: "Release the reviewed connector vault configuration.",
  account_connection: "Refresh resources, or reconnect the company Dotloop account.",
  compatible_profile: "An Admin selects the company profile below.",
  renewal_template: "An Admin selects the renewal template below.",
  loop_write_scope: "Ask Dotloop API Support to grant loop write access, then reconnect.",
  provider_scope_unreported:
    "Reconnect; if Dotloop still reports no scopes, confirm the client's scopes with Dotloop API Support.",
  observation_stale: "An Admin refreshes Dotloop resources.",
  selected_resource_unavailable:
    "An Admin refreshes resources and selects an available one.",
  selected_resource_unsupported:
    "An Admin selects an individual profile and a lease template.",
  transaction_settings: "An Admin saves the transaction type and initial status.",
};

/** The connection lifecycle states readiness distinguishes, mapped from the connector store. */
export type DotloopConnectionStatus =
  | "none"
  | "connecting"
  | "connected"
  | "refresh_needed"
  | "revocation_pending"
  | "revoked";

/** Loop-It renewal work uses an individual profile (official profile types). */
export const DOTLOOP_SUPPORTED_PROFILE_TYPES = ["INDIVIDUAL"] as const;
/** The documented lease transaction types. */
export const DOTLOOP_LEASE_TRANSACTION_TYPES = [
  "LISTING_FOR_LEASE",
  "LEASE_OFFER",
] as const;
/** An observation older than this, or taken for another generation, is stale. */
export const DOTLOOP_OBSERVATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface DotloopProbeResult {
  /** True only when a real profile read answered for this connection. */
  readonly profileOk: boolean;
  /** Provider-reported grants; null when the token response reported none. */
  readonly grantedScopes: readonly string[] | null;
  readonly subscriptionsReadable: boolean;
}

export interface DotloopScopeCoverage {
  readonly reported: boolean;
  readonly accountRead: boolean | null;
  readonly profileRead: boolean | null;
  readonly loopRead: boolean | null;
  readonly loopWrite: boolean | null;
  readonly templateRead: boolean | null;
}

/** Map provider-reported grants onto the operations this application uses (official scopes). */
export function dotloopScopeCoverage(
  granted: readonly string[] | null | undefined,
): DotloopScopeCoverage {
  if (!granted || granted.length === 0) {
    return {
      reported: false,
      accountRead: null,
      profileRead: null,
      loopRead: null,
      loopWrite: null,
      templateRead: null,
    };
  }
  const has = (...names: string[]) => names.some((name) => granted.includes(name));
  return {
    reported: true,
    accountRead: has("account:read", "account:*"),
    profileRead: has("profile:read", "profile:*"),
    loopRead: has("loop:read", "loop:*"),
    loopWrite: has("loop:write", "loop:*"),
    // The documentation accepts template:read or loop:write for template reads.
    templateRead: has("template:read", "template:*", "loop:write", "loop:*"),
  };
}

export type DotloopSelectionStatus =
  | "unselected"
  | "ok"
  | "renamed"
  | "unavailable"
  | "unsupported"
  | "unknown";

export interface DotloopSelectionInput {
  readonly profileId: string | null;
  readonly templateId: string | null;
  readonly profileLabel?: string | null;
  readonly templateLabel?: string | null;
  readonly transactionType?: string | null;
  readonly initialStatus?: string | null;
}

export interface DotloopObservedResources {
  readonly generationId: string;
  readonly observedAt: string;
  readonly accountOk: boolean;
  readonly accountEmail: string | null;
  readonly profiles: readonly { id: string; name: string; type: string | null }[];
  readonly profilesOk: boolean;
  readonly templates: readonly {
    profileId: string;
    ok: boolean;
    templates: readonly { id: string; name: string; transactionType: string | null }[];
  }[];
  readonly subscriptionsReadable: boolean | null;
}

export interface DotloopReadinessInput {
  readonly config: { readonly configured: boolean; readonly missing: readonly string[] };
  readonly vaultCapability: "configured" | "not_configured";
  readonly connection: {
    readonly status: DotloopConnectionStatus;
    readonly generationId?: string | null;
    readonly grantedScopes?: readonly string[] | null;
  };
  /** Null when no probe has run; readiness never assumes a probe it did not observe. */
  readonly probe: DotloopProbeResult | null;
  readonly selection: DotloopSelectionInput;
  /** The cached labeled observation; when present it supersedes `probe`. */
  readonly observation?: DotloopObservedResources | null;
  readonly nowIso?: string;
}

export interface DotloopSelectionDetail {
  readonly profile: DotloopSelectionStatus;
  readonly template: DotloopSelectionStatus;
  readonly profileName: string | null;
  readonly templateName: string | null;
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
  /** When the cached resource observation was taken, and whether it is stale. */
  readonly freshness?: { readonly observedAt: string | null; readonly stale: boolean };
  readonly scopes?: DotloopScopeCoverage;
  readonly selectionDetail?: DotloopSelectionDetail;
  readonly accountEmail?: string | null;
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

export function isSupportedDotloopProfileType(type: string | null): boolean {
  return (DOTLOOP_SUPPORTED_PROFILE_TYPES as readonly string[]).includes(type ?? "");
}

export function isLeaseTransactionType(type: string | null | undefined): boolean {
  return (DOTLOOP_LEASE_TRANSACTION_TYPES as readonly string[]).includes(type ?? "");
}

/** Compare the stored selection with the observation by stable id; names are labels only. */
export function projectDotloopSelection(
  selection: DotloopSelectionInput,
  observation: DotloopObservedResources | null | undefined,
): DotloopSelectionDetail {
  if (!observation) {
    return {
      profile: selection.profileId ? "unknown" : "unselected",
      template: selection.templateId ? "unknown" : "unselected",
      profileName: null,
      templateName: null,
    };
  }
  const profile = selection.profileId
    ? observation.profiles.find((entry) => entry.id === selection.profileId)
    : undefined;
  const templateGroup = selection.profileId
    ? observation.templates.find((entry) => entry.profileId === selection.profileId)
    : undefined;
  const template = selection.templateId
    ? templateGroup?.templates.find((entry) => entry.id === selection.templateId)
    : undefined;
  const profileStatus: DotloopSelectionStatus = !selection.profileId
    ? "unselected"
    : !observation.profilesOk
      ? "unknown"
      : !profile
        ? "unavailable"
        : !isSupportedDotloopProfileType(profile.type)
          ? "unsupported"
          : selection.profileLabel && profile.name !== selection.profileLabel
            ? "renamed"
            : "ok";
  const templateStatus: DotloopSelectionStatus = !selection.templateId
    ? "unselected"
    : !templateGroup || !templateGroup.ok
      ? "unknown"
      : !template
        ? "unavailable"
        : !isLeaseTransactionType(template.transactionType) ||
            (selection.transactionType &&
              template.transactionType !== selection.transactionType)
          ? "unsupported"
          : selection.templateLabel && template.name !== selection.templateLabel
            ? "renamed"
            : "ok";
  return {
    profile: profileStatus,
    template: templateStatus,
    profileName: profile?.name ?? null,
    templateName: template?.name ?? null,
  };
}

/** One deterministic readiness answer over connection, observation, scope and selection facts. */
export function projectDotloopReadiness(input: DotloopReadinessInput): DotloopReadiness {
  const observation = input.observation ?? null;
  const webhooksAvailable = observation
    ? observation.subscriptionsReadable === true
    : input.probe?.subscriptionsReadable === true;
  const grantedScopes =
    input.connection.grantedScopes !== undefined
      ? input.connection.grantedScopes
      : (input.probe?.grantedScopes ?? null);
  const scopes = dotloopScopeCoverage(grantedScopes);
  const now = Date.parse(input.nowIso ?? new Date().toISOString());
  const stale = observation
    ? (input.connection.generationId != null &&
        observation.generationId !== input.connection.generationId) ||
      !Number.isFinite(Date.parse(observation.observedAt)) ||
      now - Date.parse(observation.observedAt) > DOTLOOP_OBSERVATION_MAX_AGE_MS
    : true;
  const selectionDetail = projectDotloopSelection(input.selection, observation);
  const build = (
    state: DotloopReadinessState,
    reasons: readonly DotloopReadinessReason[],
  ): DotloopReadiness => ({
    state,
    reasons,
    webhooksAvailable,
    signatureApiAvailable: false,
    freshness: { observedAt: observation?.observedAt ?? null, stale },
    scopes,
    selectionDetail,
    accountEmail: observation?.accountEmail ?? null,
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

  // Connected, but only a real read for this generation proves the account is reachable.
  const accountOk = observation
    ? !stale && observation.accountOk && observation.profilesOk
    : input.probe?.profileOk === true;
  if (!accountOk) {
    return build(
      "unavailable",
      observation && stale ? ["observation_stale"] : ["account_connection"],
    );
  }

  const missing: DotloopReadinessReason[] = [];
  if (selectionDetail.profile === "unselected" || !input.selection.profileId)
    missing.push("compatible_profile");
  if (selectionDetail.template === "unselected" || !input.selection.templateId)
    missing.push("renewal_template");
  if (
    selectionDetail.profile === "unavailable" ||
    selectionDetail.template === "unavailable" ||
    (observation &&
      (selectionDetail.profile === "unknown" || selectionDetail.template === "unknown") &&
      Boolean(input.selection.profileId && input.selection.templateId))
  )
    missing.push("selected_resource_unavailable");
  if (
    selectionDetail.profile === "unsupported" ||
    selectionDetail.template === "unsupported"
  )
    missing.push("selected_resource_unsupported");
  if (
    observation &&
    input.selection.profileId &&
    input.selection.templateId &&
    (!input.selection.transactionType || !input.selection.initialStatus)
  )
    missing.push("transaction_settings");
  if (!scopes.reported) missing.push("provider_scope_unreported");
  else if (!scopes.loopWrite) missing.push("loop_write_scope");
  if (missing.length > 0) return build("missing_resources", missing);
  return build("connected", []);
}
