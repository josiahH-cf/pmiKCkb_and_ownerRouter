/**
 * Typed, privacy-safe state for renewal reads that support only part of the desk/workspace.
 * A failed auxiliary source must never collapse the primary lease read or masquerade as an empty
 * store. Callers choose a fail-closed fallback and surface the symbolic state beside the affected
 * controls; error messages and source values never cross this boundary.
 */

export const RENEWAL_AUXILIARY_READ_KEYS = [
  "progress",
  "packet",
  "notice_policy",
  "communications",
  "dismissed_attention",
  "resolutions",
  "rent_suggestion",
  "comp_screenshot",
  "dispositions",
  "rentvine_proposal",
  "sheet_proposal",
  "sheet_effect_status",
] as const;

export type RenewalAuxiliaryReadKey = (typeof RENEWAL_AUXILIARY_READ_KEYS)[number];
export type RenewalAuxiliaryReadStatus =
  | "available"
  | "unavailable"
  | "forbidden"
  | "failed";

export type RenewalAuxiliaryRead<T> =
  | {
      key: RenewalAuxiliaryReadKey;
      status: "available";
      value: T;
    }
  | {
      key: RenewalAuxiliaryReadKey;
      status: Exclude<RenewalAuxiliaryReadStatus, "available">;
    };

export async function readRenewalAuxiliary<T>(
  key: RenewalAuxiliaryReadKey,
  read: () => Promise<T>,
): Promise<RenewalAuxiliaryRead<T>> {
  try {
    return { key, status: "available", value: await read() };
  } catch (error) {
    return {
      key,
      status: statusFrom(error),
    };
  }
}

export function unavailableRenewalAuxiliary(
  key: RenewalAuxiliaryReadKey,
): RenewalAuxiliaryRead<never> {
  return { key, status: "unavailable" };
}

export function renewalAuxiliaryValue<T>(
  result: RenewalAuxiliaryRead<T>,
  fallback: T,
): T {
  return result.status === "available" ? result.value : fallback;
}

export function renewalAuxiliaryFailures(
  results: readonly RenewalAuxiliaryRead<unknown>[],
): Array<{
  key: RenewalAuxiliaryReadKey;
  status: Exclude<RenewalAuxiliaryReadStatus, "available">;
}> {
  return results.flatMap((result) =>
    result.status === "available" ? [] : [{ key: result.key, status: result.status }],
  );
}

function statusFrom(error: unknown): Exclude<RenewalAuxiliaryReadStatus, "available"> {
  const status =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  if (status === 401 || status === 403) return "forbidden";
  if (status === 404) return "unavailable";
  return "failed";
}
