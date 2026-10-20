// S106 (AC-S106-6): the Admin resource picker's server contract. A selection is accepted only
// when it names stable ids present in the current generation's fresh observation: an individual
// profile, one of that profile's lease templates, the template's own transaction type and a
// documented initial status for it. Names are labels only; renames never change the selection.

import { isApprovedIntegrationAccount } from "./provider-identity";
import {
  DOTLOOP_OBSERVATION_MAX_AGE_MS,
  isLeaseTransactionType,
  isSupportedDotloopProfileType,
} from "@/lib/connections/dotloop-readiness";
import type { DotloopResourceObservation } from "@/lib/firestore/dotloop-connection-observations";
import { DOTLOOP_LEASE_STATUSES } from "@/lib/firestore/dotloop-renewal-settings";

export interface DotloopPickerProfile {
  readonly id: string;
  readonly name: string;
  readonly type: string | null;
  readonly supported: boolean;
}

export interface DotloopPickerTemplate {
  readonly id: string;
  readonly name: string;
  readonly transactionType: string | null;
  readonly supported: boolean;
  readonly statuses: readonly string[];
}

export interface DotloopPickerView {
  readonly observedAt: string;
  readonly stale: boolean;
  readonly accountEmail: string | null;
  readonly profiles: readonly DotloopPickerProfile[];
  readonly templatesByProfile: Readonly<Record<string, readonly DotloopPickerTemplate[]>>;
  readonly profilesTruncated: boolean;
  readonly resourceReadFailed?: boolean;
  /** Missing means not observed; null is a successful read, including a truly empty list. */
  readonly templateReadErrors?: Readonly<Record<string, string | null>>;
}

export function observationIsFresh(
  observation: DotloopResourceObservation | null,
  generationId: string | null,
  nowIso: string,
): boolean {
  if (!observation || !generationId || observation.generationId !== generationId)
    return false;
  const observed = Date.parse(observation.observedAt);
  const now = Date.parse(nowIso);
  return (
    Number.isFinite(observed) &&
    Number.isFinite(now) &&
    now >= observed &&
    now - observed <= DOTLOOP_OBSERVATION_MAX_AGE_MS
  );
}

/** The picker's view of one observation: only ids, names and supportability, never tokens. */
export function projectDotloopPicker(
  observation: DotloopResourceObservation,
  generationId: string | null,
  nowIso: string,
): DotloopPickerView {
  const templatesByProfile: Record<string, DotloopPickerTemplate[]> = {};
  const resourceReadFailed = Boolean(
    observation.accountError ||
    !observation.account ||
    !isApprovedIntegrationAccount(observation.account.email) ||
    observation.profilesError,
  );
  const templateReadErrors: Record<string, string | null> = {};
  for (const entry of observation.templates) {
    templateReadErrors[entry.profileId] = entry.error;
    const supportedProfile = observation.profiles.some(
      (profile) =>
        profile.id === entry.profileId && isSupportedDotloopProfileType(profile.type),
    );
    templatesByProfile[entry.profileId] = entry.templates.map((template) => ({
      id: template.id,
      name: template.name,
      transactionType: template.transactionType,
      supported:
        !resourceReadFailed &&
        !entry.error &&
        supportedProfile &&
        isLeaseTransactionType(template.transactionType),
      statuses:
        !resourceReadFailed &&
        !entry.error &&
        supportedProfile &&
        isLeaseTransactionType(template.transactionType)
          ? DOTLOOP_LEASE_STATUSES[
              template.transactionType as keyof typeof DOTLOOP_LEASE_STATUSES
            ]
          : [],
    }));
  }
  return {
    observedAt: observation.observedAt,
    stale: !observationIsFresh(observation, generationId, nowIso),
    accountEmail: observation.account?.email ?? null,
    profiles: observation.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      type: profile.type,
      supported: isSupportedDotloopProfileType(profile.type),
    })),
    templatesByProfile,
    profilesTruncated: observation.profilesTruncated,
    resourceReadFailed,
    templateReadErrors,
  };
}

export type DotloopSelectionCheck =
  | {
      ok: true;
      profileLabel: string;
      templateLabel: string;
      transactionType: keyof typeof DOTLOOP_LEASE_STATUSES;
      initialStatus: string;
    }
  | { ok: false; reason: string };

/** Verify one requested selection against the current generation's fresh observation. */
export function checkDotloopSelection(input: {
  observation: DotloopResourceObservation | null;
  generationId: string | null;
  nowIso: string;
  profileId: string;
  templateId: string;
  transactionType: string | undefined;
  initialStatus: string | undefined;
}): DotloopSelectionCheck {
  if (!input.generationId)
    return { ok: false, reason: "Connect Dotloop before choosing renewal resources." };
  if (
    !observationIsFresh(input.observation, input.generationId, input.nowIso) ||
    !input.observation
  )
    return {
      ok: false,
      reason: "Refresh Dotloop resources for this connection before choosing them.",
    };
  const observation = input.observation;
  if (observation.accountError || !observation.account || observation.profilesError)
    return {
      ok: false,
      reason:
        "The account or profile read failed. Refresh Dotloop resources before saving a selection.",
    };
  if (!isApprovedIntegrationAccount(observation.account.email))
    return {
      ok: false,
      reason:
        "Connect integrations@pmikcmetro.com and refresh its resources before saving a selection.",
    };
  const profile = observation.profiles.find((entry) => entry.id === input.profileId);
  if (!profile)
    return {
      ok: false,
      reason: "That Dotloop profile is not available to this connection.",
    };
  if (!isSupportedDotloopProfileType(profile.type))
    return {
      ok: false,
      reason:
        "Choose an individual Dotloop profile; this profile type cannot create lease loops.",
    };
  const group = observation.templates.find(
    (entry) => entry.profileId === input.profileId,
  );
  if (!group || group.error)
    return {
      ok: false,
      reason:
        "That profile's templates were not read. Refresh Dotloop resources and try again.",
    };
  const template = group.templates.find((entry) => entry.id === input.templateId);
  if (!template)
    return {
      ok: false,
      reason: "That template is not available to the selected profile.",
    };
  if (!isLeaseTransactionType(template.transactionType))
    return {
      ok: false,
      reason: "Choose a lease template (listing for lease or lease offer).",
    };
  const transactionType = template.transactionType as keyof typeof DOTLOOP_LEASE_STATUSES;
  if (input.transactionType !== transactionType)
    return {
      ok: false,
      reason: "The transaction type must match the selected template's transaction type.",
    };
  if (
    !input.initialStatus ||
    !DOTLOOP_LEASE_STATUSES[transactionType].includes(input.initialStatus)
  )
    return {
      ok: false,
      reason: "Choose a documented initial status for this transaction type.",
    };
  return {
    ok: true,
    profileLabel: profile.name || profile.id,
    templateLabel: template.name || template.id,
    transactionType,
    initialStatus: input.initialStatus,
  };
}
