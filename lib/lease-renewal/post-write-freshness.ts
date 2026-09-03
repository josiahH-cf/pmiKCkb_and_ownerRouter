/**
 * Short-lived browser barrier used after a confirmed RentVine write. It carries only a millisecond
 * timestamp: no lease id, actor, source value, or receipt enters the cookie.
 */
export const RENEWAL_SOURCE_REFRESH_COOKIE = "pmi_renewal_source_refresh_after";
export const RENEWAL_SOURCE_REFRESH_COOKIE_MAX_AGE_SECONDS = 5 * 60;

const CLOCK_SKEW_ALLOWANCE_MS = 60_000;

/**
 * Accept only a recent, bounded timestamp. A malformed or user-forged future value must not turn
 * every workspace navigation into an unbounded provider refresh.
 */
export function parseRenewalSourceRefreshAfter(
  value: string | undefined,
  nowMs: number,
): number | null {
  if (!value || !/^\d{13}$/.test(value) || !Number.isFinite(nowMs)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return null;
  const oldestAllowed = nowMs - RENEWAL_SOURCE_REFRESH_COOKIE_MAX_AGE_SECONDS * 1_000;
  if (parsed < oldestAllowed || parsed > nowMs + CLOCK_SKEW_ALLOWANCE_MS) return null;
  return parsed;
}
