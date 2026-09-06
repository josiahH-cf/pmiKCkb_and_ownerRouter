// The one minimum age before a claimed, still-running renewal effect may be reconciled. The S97
// and S98 services own the reconcile operations; the S107 continuation reads the same constant so
// the two can never drift apart.
export const RENEWAL_EFFECT_RECONCILE_MIN_AGE_MS = 2 * 60 * 1_000;
