// S166: the signed-in account's remembered worklist view, and how one navigation chooses its view.
//
// The remembered value is only the canonical `renewal-desk-query/v2` string the desk already uses
// for its own URLs ("" for the default view). It is account-owned, never team-wide, and it is a
// view only: it never decides whether a lease can be opened or worked.
//
// Precedence for one navigation:
//   1. A URL that names a view (any desk key, including the explicit default `?v=2`) decides that
//      navigation and opens the table. It is read-only: following a link never changes what is
//      remembered.
//   2. Otherwise the ordinary entry opens the working batch (S246 ARCH-S246-3). The remembered
//      view no longer applies by itself there; the batch offers it as "Open my saved view".
// Pure; no I/O. The store is `lib/firestore/renewal-desk-preferences.ts`.

import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  parseRenewalDeskQueryV2,
  renewalDeskUrlNamesView,
  serializeRenewalDeskQueryV2,
  type RenewalDeskQueryV2State,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  DESK_VIEW_MAX_CODE_UNITS,
  validateDeskView,
} from "@/lib/lease-renewal/desk-view-continuation";
import {
  parseRenewalBatchQuery,
  type RenewalBatchQuery,
} from "@/lib/lease-renewal/renewal-batch";

export const RENEWAL_DESK_PREFERENCE_SCHEMA_VERSION = "renewal-desk-preference/v1";

/**
 * Where this account's worklist view can be remembered: saved for the account, never saved for a
 * verification account, or unavailable where the environment keeps nothing.
 */
export type DeskPreferenceMode = "saved" | "verification" | "unavailable";

type SearchParamRecord = Record<string, string | string[] | undefined>;

/** Desk query keys that carry typed text (a name, an address); never part of a remembered view. */

/**
 * The canonical view to remember for one submitted desk query, "" for the default view, or null
 * when the value is not a version 2 desk query at all. Unknown keys and invalid values fall back
 * per key exactly as they do on the desk, so only what the desk would show is ever stored.
 */
export function canonicalDeskPreferenceView(query: unknown): string | null {
  if (typeof query !== "string" || query === "") return null;
  if (query.length > DESK_VIEW_MAX_CODE_UNITS) return null;
  if (query.startsWith("?") || query.includes("#")) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(query);
  } catch {
    return null;
  }
  if (params.get("v") !== "2") return null;
  // S177: deliberately entered search is part of this private account view. It never becomes
  // an access-return parameter, analytics value, public link or source-upload artifact.
  return serializeRenewalDeskQueryV2(parseRenewalDeskQueryV2(params));
}

/**
 * A stored value as it may be used now: the canonical view, "" for a stored default, or null when
 * it no longer validates (a retired key or value, a damaged document). Null means no preference.
 */
export function revalidateStoredDeskView(stored: unknown): string | null {
  if (stored === "") return "";
  if (typeof stored !== "string") return null;
  const canonical = validateDeskView(stored);
  if (canonical === null) return null;
  // The explicit default continuation is the default view.
  return serializeRenewalDeskQueryV2(
    parseRenewalDeskQueryV2(new URLSearchParams(canonical)),
  );
}

export type RenewalDeskEntrySource = "explicit" | "saved" | "default";

/** S246: what one desk navigation opens. Only the bare route opens the working batch. */
export type RenewalDeskEntrySurface = "batch" | "table";

export interface RenewalDeskEntry {
  /** The working batch for the ordinary entry, the table for every URL that names a view. */
  readonly surface: RenewalDeskEntrySurface;
  /** The table view; the default view while the batch is shown. */
  readonly state: RenewalDeskQueryV2State;
  /**
   * What chose the table view: the URL ("saved" when that URL names exactly the account's
   * remembered view), or the default while the batch is shown.
   */
  readonly source: RenewalDeskEntrySource;
  /** The account's remembered non-default view as it would open now, or null. */
  readonly savedView: string | null;
  /** The batch month and open group the URL names; both null for the plain batch. */
  readonly batch: RenewalBatchQuery;
}

export interface ResolveRenewalDeskEntryInput {
  readonly searchParams: URLSearchParams | SearchParamRecord;
  /** The stored view exactly as read; anything that no longer validates counts as none. */
  readonly storedView: string | null | undefined;
  /** The page's own parser for an explicit URL (it resolves legacy party labels). */
  readonly parseExplicit?: (
    input: URLSearchParams | SearchParamRecord,
  ) => RenewalDeskQueryV2State;
  /**
   * Whether a remembered opaque party token still resolves against a party in the current
   * authorized projection. A token that does not (for example after its key rotated out) is
   * dropped from the restored view and the rest of the view is kept.
   */
  readonly partyTokenResolves?: (partyKind: "owner" | "tenant", token: string) => boolean;
}

function rememberedState(
  input: ResolveRenewalDeskEntryInput,
): RenewalDeskQueryV2State | null {
  const canonical = revalidateStoredDeskView(input.storedView);
  if (canonical === null || canonical === "") return null;
  const parsed = parseRenewalDeskQueryV2(new URLSearchParams(canonical));
  const resolves = input.partyTokenResolves;
  const state: RenewalDeskQueryV2State = resolves
    ? {
        ...parsed,
        ownerKey:
          parsed.ownerKey && resolves("owner", parsed.ownerKey) ? parsed.ownerKey : "",
        tenantKey:
          parsed.tenantKey && resolves("tenant", parsed.tenantKey)
            ? parsed.tenantKey
            : "",
      }
    : parsed;
  return serializeRenewalDeskQueryV2(state) === "" ? null : state;
}

const NO_BATCH_QUERY: RenewalBatchQuery = { month: null, group: null };

/**
 * Choose what one desk navigation opens. Never writes. A URL that names a view always opens the
 * table with exactly that view; the bare route opens the working batch and only offers the
 * remembered view.
 */
export function resolveRenewalDeskEntry(
  input: ResolveRenewalDeskEntryInput,
): RenewalDeskEntry {
  const remembered = rememberedState(input);
  const savedView = remembered ? serializeRenewalDeskQueryV2(remembered) : null;
  if (renewalDeskUrlNamesView(input.searchParams)) {
    const parse = input.parseExplicit ?? parseRenewalDeskQueryV2;
    const state = parse(input.searchParams);
    return {
      surface: "table",
      state,
      source:
        savedView !== null && serializeRenewalDeskQueryV2(state) === savedView
          ? "saved"
          : "explicit",
      savedView,
      batch: NO_BATCH_QUERY,
    };
  }
  return {
    surface: "batch",
    state: { ...DEFAULT_RENEWAL_DESK_QUERY_V2 },
    source: "default",
    savedView,
    batch: parseRenewalBatchQuery(input.searchParams),
  };
}
