// Shared term values for client filters. Source fingerprinting stays in the server projection.
export const LEASE_TERMS = ["fixed_term", "month_to_month", "needs_review"] as const;
export type LeaseTerm = (typeof LEASE_TERMS)[number];

/** The two terms a person may record. `needs_review` is a projection state, never a decision. */
export const RECORDABLE_LEASE_TERMS = ["fixed_term", "month_to_month"] as const;
export type RecordableLeaseTerm = (typeof RECORDABLE_LEASE_TERMS)[number];
