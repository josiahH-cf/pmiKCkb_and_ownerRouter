// S106 (AC-S106-9): the labeled, cached observation of the company Dotloop connection's resources.
//
// Ordinary page renders read this record instead of repeating the account, profile, template and
// subscription reads. An Admin's explicit refresh, and the callback's post-consent verification,
// replace it. Each observation names the connection generation it was taken for, when, and by
// whom, so a stale or other-generation observation is visible as such and never qualifies a newer
// connection. Server-only collection (the rules' catch-all denies browsers). It holds provider
// identifiers, names and types only: no token, credential, customer value or document content.
// Provider-derived content here is operational, never an AI input (S182).

import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firestore/admin";
import type {
  DotloopAccount,
  DotloopClientErrorKind,
  DotloopLoopTemplate,
  DotloopProfile,
} from "@/lib/integrations/dotloop/client";

export const DOTLOOP_CONNECTION_OBSERVATIONS_COLLECTION =
  "dotloop_connection_observations";
export const DOTLOOP_CONNECTION_OBSERVATION_DOC_ID = "current";

/** Explicit refresh reads at most this many profiles' templates; a larger account is truncated. */
export const DOTLOOP_OBSERVED_PROFILE_LIMIT = 10;

export type DotloopReadFailure = DotloopClientErrorKind | "unknown";

export interface DotloopTemplateObservation {
  readonly profileId: string;
  readonly templates: readonly DotloopLoopTemplate[];
  readonly error: DotloopReadFailure | null;
}

export interface DotloopResourceObservation {
  readonly generationId: string;
  readonly observedAt: string;
  readonly observedByUid: string;
  readonly account: DotloopAccount | null;
  readonly accountError: DotloopReadFailure | null;
  readonly profiles: readonly DotloopProfile[];
  readonly profilesError: DotloopReadFailure | null;
  readonly profilesTruncated: boolean;
  readonly templates: readonly DotloopTemplateObservation[];
  /** Null when the optional subscription probe was not read. */
  readonly subscriptionsReadable: boolean | null;
}

export interface DotloopObservationStore {
  read(): Promise<DotloopResourceObservation | null>;
  write(observation: DotloopResourceObservation): Promise<void>;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function flag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function failure(value: unknown): DotloopReadFailure | null {
  return typeof value === "string" && value !== "" ? (value as DotloopReadFailure) : null;
}

/** Parse a stored record defensively; a malformed record reads as absent, never as connected. */
export function readStoredDotloopObservation(
  raw: Record<string, unknown> | undefined,
): DotloopResourceObservation | null {
  if (!raw) return null;
  const generationId = text(raw.generation_id);
  const observedAt = text(raw.observed_at);
  const observedByUid = text(raw.observed_by_uid);
  if (
    !generationId ||
    !observedAt ||
    !observedByUid ||
    !Number.isFinite(Date.parse(observedAt))
  )
    return null;
  const account =
    raw.account && typeof raw.account === "object"
      ? (raw.account as Record<string, unknown>)
      : null;
  const profiles = Array.isArray(raw.profiles) ? raw.profiles : [];
  const templates = Array.isArray(raw.templates) ? raw.templates : [];
  return {
    generationId,
    observedAt,
    observedByUid,
    account:
      account && text(account.id)
        ? {
            id: String(account.id),
            name: text(account.name),
            email: text(account.email),
            defaultProfileId: text(account.default_profile_id),
          }
        : null,
    accountError: failure(raw.account_error),
    profiles: profiles.flatMap((entry) => {
      const record =
        entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
      const id = text(record?.id);
      if (!record || !id) return [];
      return [
        {
          id,
          name: text(record.name) ?? "",
          type: text(record.type),
          isDefault: flag(record.is_default),
          requiresTemplate: flag(record.requires_template),
        },
      ];
    }),
    profilesError: failure(raw.profiles_error),
    profilesTruncated: raw.profiles_truncated === true,
    templates: templates.flatMap((entry) => {
      const record =
        entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
      const profileId = text(record?.profile_id);
      if (!record || !profileId) return [];
      const list = Array.isArray(record.templates) ? record.templates : [];
      return [
        {
          profileId,
          error: failure(record.error),
          templates: list.flatMap((item) => {
            const template =
              item && typeof item === "object" ? (item as Record<string, unknown>) : null;
            const id = text(template?.id);
            if (!template || !id) return [];
            return [
              {
                id,
                name: text(template.name) ?? "",
                transactionType: text(template.transaction_type),
                shared: flag(template.shared),
                global: flag(template.global),
              },
            ];
          }),
        },
      ];
    }),
    subscriptionsReadable: flag(raw.subscriptions_readable),
  };
}

export function toStoredDotloopObservation(
  observation: DotloopResourceObservation,
): Record<string, unknown> {
  return {
    generation_id: observation.generationId,
    observed_at: observation.observedAt,
    observed_by_uid: observation.observedByUid,
    account: observation.account
      ? {
          id: observation.account.id,
          name: observation.account.name,
          email: observation.account.email,
          default_profile_id: observation.account.defaultProfileId,
        }
      : null,
    account_error: observation.accountError,
    profiles: observation.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      type: profile.type,
      is_default: profile.isDefault,
      requires_template: profile.requiresTemplate,
    })),
    profiles_error: observation.profilesError,
    profiles_truncated: observation.profilesTruncated,
    templates: observation.templates.map((entry) => ({
      profile_id: entry.profileId,
      error: entry.error,
      templates: entry.templates.map((template) => ({
        id: template.id,
        name: template.name,
        transaction_type: template.transactionType,
        shared: template.shared,
        global: template.global,
      })),
    })),
    subscriptions_readable: observation.subscriptionsReadable,
  };
}

export class FirestoreDotloopObservationStore implements DotloopObservationStore {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async read(): Promise<DotloopResourceObservation | null> {
    const snapshot = await this.ref().get();
    return snapshot.exists ? readStoredDotloopObservation(snapshot.data()) : null;
  }

  async write(observation: DotloopResourceObservation): Promise<void> {
    await this.ref().set({
      ...toStoredDotloopObservation(observation),
      recorded_at: FieldValue.serverTimestamp(),
    });
  }

  private ref() {
    return this.db
      .collection(DOTLOOP_CONNECTION_OBSERVATIONS_COLLECTION)
      .doc(DOTLOOP_CONNECTION_OBSERVATION_DOC_ID);
  }
}
