// Resolve the LIVE owner contact for the MAINTENANCE owner-notice via a proven read-only RentVine
// property → portfolio → contact join.
//
// S61 correction (2026-08-06): the former claim here that "/leases/export carries NO owner email"
// was measured FALSE on the full portfolio — `portfolio.owners[].email` is present on 305/305
// export rows — so the RENEWAL owner channel now resolves directly from the export view through
// `resolveRenewalRecipient` (with the S61 all-owners fan-out), and the lease-keyed
// `resolveLiveOwnerEmail` entry this module used to export is DELETED. What remains is the
// maintenance path, which starts from a unit's propertyId with no export row in hand:
//   getProperty(propertyID) -> portfolioID
//   getPortfolio(portfolioID) -> contacts[] ({ contactID, percentOwned, ... })
//   getContact(contactID) -> email (+ optional display name)
// On THIS path the portfolio `contacts[]` genuinely carry `percentOwned`, so the owner is the
// contact holding the strictly-greatest positive share, and an equal-top tie refuses (null) rather
// than guessing — the rule stays here because its ordering key actually exists here, unlike the
// export path (`F-OWNER-PERCENT-OWNED-ABSENT`). Any missing hop, invalid email, ambiguous owner, or
// thrown read collapses to null so the caller blocks honestly.
//
// Reads only (getProperty/getPortfolio/getContact are GET-only on the client). No send-capable
// import, no write path, no logging of any email/name — only ids flow through the request paths.

import type {
  RawContact,
  RawLease,
  RawPortfolio,
  RawProperty,
} from "@/lib/integrations/rentvine/client";

/** The minimal read-only surface the lease-keyed resolver needs. RentVineClient satisfies it structurally. */
export interface LiveOwnerRecipientClient {
  getLease(leaseId: string | number): Promise<RawLease>;
  getProperty(propertyId: string | number): Promise<RawProperty>;
  getPortfolio(portfolioId: string | number): Promise<RawPortfolio>;
  getContact(contactId: string | number): Promise<RawContact>;
}

/** The property-anchored tail's surface: the lease hop is not needed when the propertyId is already known. */
export type PropertyOwnerClient = Pick<
  LiveOwnerRecipientClient,
  "getProperty" | "getPortfolio" | "getContact"
>;

export interface OwnerContact {
  /** The authoritative owner email, trimmed + lowercased. */
  email: string;
  /** The portfolio the owning contact was resolved through (for the caller's source ref). */
  portfolioId: string | number;
  /** The resolved owning contact id (for the caller's source ref). */
  contactId: string | number;
  /** A display name for the owner, if the contact record carried one (never invented). */
  name?: string;
}

// Same validation the recipient resolver uses, so a live owner email is held to one bar everywhere.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Resolve the owning contact from a KNOWN RentVine property id through the property -> portfolio ->
 * contact join. Returns the email plus the portfolio/contact ids (so the caller can compose its own
 * authoritative source ref) and an optional display name, or null when any hop is missing, the top
 * ownership is a tie, or the contact carries no valid email. Never throws and never guesses.
 */
export async function resolveOwnerContactFromPropertyId(
  client: PropertyOwnerClient,
  propertyId: string | number,
): Promise<OwnerContact | null> {
  try {
    const property = await client.getProperty(propertyId);
    const portfolioId = readId(property, ["portfolioID", "portfolioId"]);
    if (portfolioId === null) return null;

    const portfolio = await client.getPortfolio(portfolioId);
    const contactId = pickOwnerContactId(portfolio.contacts);
    if (contactId === null) return null;

    const contact = await client.getContact(contactId);
    const email = normalizeEmail(contact.email);
    if (email === null) return null;

    const name = ownerDisplayName(contact);
    return { email, portfolioId, contactId, ...(name ? { name } : {}) };
  } catch {
    // Any thrown hop (network, auth, unexpected shape) collapses to an honest block — never a guess.
    return null;
  }
}

/** Compose a display name from a contact record's common name fields; undefined when none is present. */
function ownerDisplayName(contact: RawContact): string | undefined {
  const obj = contact as Record<string, unknown>;
  const direct = firstString(obj, ["name", "displayName", "companyName"]);
  if (direct) return direct;
  const first = firstString(obj, ["firstName"]);
  const last = firstString(obj, ["lastName"]);
  const composed = [first, last].filter(Boolean).join(" ").trim();
  return composed === "" ? undefined : composed;
}

function firstString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

/**
 * The owner contact = the one with the strictly-greatest positive `percentOwned`. A tie at the top is
 * ambiguous ownership and returns null (never guess which co-owner is "the" owner). Contacts with a
 * non-positive / non-numeric `percentOwned`, or no usable id, are ignored.
 */
function pickOwnerContactId(contacts: unknown): string | number | null {
  if (!Array.isArray(contacts)) return null;
  let best: { id: string | number; pct: number } | null = null;
  let tiedAtTop = false;
  for (const entry of contacts) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const pct = Number(obj.percentOwned);
    if (!Number.isFinite(pct) || pct <= 0) continue;
    const id = readId(obj, ["contactID", "contactId", "id"]);
    if (id === null) continue;
    if (best === null || pct > best.pct) {
      best = { id, pct };
      tiedAtTop = false;
    } else if (pct === best.pct) {
      tiedAtTop = true;
    }
  }
  if (best === null || tiedAtTop) return null;
  return best.id;
}

/** First present id (number or non-empty string) across the candidate keys; null if none. */
function readId(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

/** Trim + lowercase and validate against the shared email regex; null when missing or invalid. */
function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return EMAIL_RE.test(trimmed) ? trimmed : null;
}
