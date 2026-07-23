// S39.2 — the internal-domain allowlist for the transactional (feedback) notice destination. A LEAF
// module (imports only the allowed-domain constant) so both the config-set schema
// (UpdateOwnerTransactionalDestinationInputSchema) AND the send-time re-assert
// (lib/notifications/internal-transactional.ts) share ONE code-enforced rule with no import cycle.
//
// HARD RULE: the transactional lane addresses ONLY the owner-configured INTERNAL staff destination. An
// Admin cannot save an external address, and the executor re-asserts this at send. A tenant, owner-of-
// record, vendor, or any external/free-form address is never a valid destination.

import { ALLOWED_HD_DEFAULT } from "@/lib/constants";

/** The single allowed internal domain for the transactional destination (the managed staff domain). */
export const INTERNAL_TRANSACTIONAL_ALLOWED_DOMAIN = ALLOWED_HD_DEFAULT;

/**
 * True only for an email whose domain is EXACTLY the internal staff domain. Requires exactly one `@`
 * (so `foo@bar@evil.com` and `foo@pmikcmetro.com.evil.com` are rejected) and a non-empty local part;
 * the domain must equal the allowed domain verbatim (a subdomain like `x.pmikcmetro.com` is rejected).
 * Case-insensitive + trim-tolerant. Never a guess: anything not matching is not internal.
 */
export function isInternalTransactionalDestination(email: unknown): boolean {
  if (typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf("@");
  // Exactly one `@`, with a non-empty local part before it.
  if (at <= 0 || at !== normalized.lastIndexOf("@")) return false;
  const domain = normalized.slice(at + 1);
  return domain === INTERNAL_TRANSACTIONAL_ALLOWED_DOMAIN;
}
