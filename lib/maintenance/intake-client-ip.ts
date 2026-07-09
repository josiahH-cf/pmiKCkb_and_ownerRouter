// Client-IP derivation for the public tokenized maintenance intake (A5). PURE (node:crypto only).
//
// X-Forwarded-For is client-controlled: a caller can prepend as many fake hops as they like. Only the
// RIGHTMOST hop is trustworthy — on Cloud Run / a single reverse proxy it is the address the proxy
// itself observed, which the client cannot forge. So we take the rightmost non-empty entry, never the
// leftmost (the usual "real client IP" that XFF-spoofers control). The IP is then salted-hashed so the
// stored rate-counter key is opaque (no raw reporter IP is persisted). It is a SECONDARY signal only —
// the authoritative control is the per-property global daily cap in the writer.

import { createHash } from "node:crypto";

/** Rightmost X-Forwarded-For hop (proxy-observed, least forgeable), or null if none present. */
export function extractClientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      return hops[hops.length - 1];
    }
  }
  const real = headers.get("x-real-ip")?.trim();
  return real && real.length > 0 ? real : null;
}

/**
 * Salted SHA-256 of the client IP, truncated — a stable opaque key for the rate counter. Returns null
 * when there is no IP or no configured salt (hashing without a salt would leak to a rainbow table, and
 * an unsalted key is worthless), so the caller falls back to the per-property global cap alone.
 */
export function hashClientIp(ip: string | null, salt: string | undefined): string | null {
  const trimmedSalt = salt?.trim();
  if (!ip || !trimmedSalt) return null;
  return createHash("sha256").update(`${trimmedSalt}|${ip}`).digest("hex").slice(0, 32);
}
