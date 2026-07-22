// Resolve the authoritative renewal-notice recipient (owner or tenant) from a live Rentvine lease.
//
// This is the recipient half of the live-renewal-run → real-draft path. It NEVER invents an address:
// when an authoritative email is not present in the read, it returns a `Needs Verification` shaped
// result (`verified:false`, a `missing` entry, no `to`), and the draft step must refuse rather than
// guess. When an email IS present it returns it lowercased plus a source pointer
// (`rentvine:lease:<id>:<field-path>`) that the governed executor stores as `recipient_source_ref`.
//
// Honest coverage note: Rentvine's `/leases/export` row carries the tenant on `lease.tenants[]` and the
// authoritative property OWNER on `portfolio.owners[]` (both preserved on the flattened lease view by
// leaseViewsFromExport), so BOTH channels resolve directly from the live read — the owner email was
// confirmed present + email-shaped on 25/25 leases (Slice 1, 2026-07-22,
// docs/products/rentvine-live-field-map-2026-07-22.md). When no authoritative email is present the
// channel stays honestly `Needs Verification` rather than guessing. To avoid MIS-attribution, a party's
// email is read only from that party's own scoped object (or a lease-level key that explicitly names the
// party) — never from a generic top-level `email` that could belong to the other side.

import type { RawLease } from "@/lib/integrations/rentvine/client";

export type RenewalRecipientChannel = "owner" | "tenant";

export interface RenewalRecipientFieldMap {
  /** Email keys read INSIDE a party-scoped object (tenants[0], owner, property.owner, …). */
  scopedEmailKeys: string[];
  /** Lease-top-level keys that explicitly name the TENANT (never a generic `email`). */
  tenantLeaseKeys: string[];
  /** Lease-top-level keys that explicitly name the OWNER (never a generic `email`). */
  ownerLeaseKeys: string[];
}

export const DEFAULT_RENEWAL_RECIPIENT_FIELD_MAP: RenewalRecipientFieldMap = {
  scopedEmailKeys: ["email", "emailAddress", "email_address", "primaryEmail"],
  tenantLeaseKeys: ["tenantEmail", "primaryTenantEmail", "tenant_email"],
  ownerLeaseKeys: ["ownerEmail", "primaryOwnerEmail", "owner_email"],
};

export interface RenewalRecipientResolution {
  channel: RenewalRecipientChannel;
  /** The authoritative recipient email, trimmed + lowercased. Present ONLY when verified. */
  to?: string;
  /** Authoritative source pointer, e.g. `rentvine:lease:123:tenants[0].email`. Present with `to`. */
  recipientSourceRef?: string;
  /**
   * Additional authoritative CO-TENANT emails to Cc (F-LEASE-6 default: address ALL tenants on the lease
   * when the single intended recipient is unconfirmed). Only populated for the TENANT channel, only from
   * the live lease's own tenant objects (never invented), distinct from `to`. Empty for a single-tenant
   * lease and for the owner channel.
   */
  cc?: string[];
  /** Authoritative source pointers for each `cc` entry, index-aligned with `cc`. */
  ccSourceRefs?: string[];
  verified: boolean;
  /** Non-empty when no authoritative email was found. The caller MUST NOT invent a recipient. */
  missing: string[];
}

/**
 * Resolve the recipient for one renewal channel from a single Rentvine lease view. Pure and
 * deterministic: same lease + channel always yields the same result.
 */
export function resolveRenewalRecipient(input: {
  lease: RawLease;
  channel: RenewalRecipientChannel;
  fieldMap?: RenewalRecipientFieldMap;
}): RenewalRecipientResolution {
  const { lease, channel } = input;
  const fieldMap = input.fieldMap ?? DEFAULT_RENEWAL_RECIPIENT_FIELD_MAP;
  const leaseLabel = leaseLabelFor(lease);

  if (channel === "tenant") {
    // F-LEASE-6 default (interim, pending Dan's confirmation of tenant primacy): address ALL tenants on the
    // lease. The FIRST authoritative tenant email is the primary `to`; every OTHER distinct tenant email is
    // an authoritative Cc. All come from the lease's own tenant objects — never invented.
    const hits = collectEmails(tenantContainers(lease, fieldMap), leaseLabel);
    if (hits.length === 0) {
      return { channel, verified: false, missing: ["tenant email"] };
    }
    const [primary, ...rest] = hits;
    return {
      channel,
      to: primary.email,
      recipientSourceRef: primary.sourceRef,
      ...(rest.length
        ? {
            cc: rest.map((hit) => hit.email),
            ccSourceRefs: rest.map((hit) => hit.sourceRef),
          }
        : {}),
      verified: true,
      missing: [],
    };
  }

  const hit = findEmail(ownerContainers(lease, fieldMap), leaseLabel);
  if (hit) {
    return {
      channel,
      to: hit.email,
      recipientSourceRef: hit.sourceRef,
      verified: true,
      missing: [],
    };
  }
  return { channel, verified: false, missing: ["owner email"] };
}

interface EmailSearch {
  /** The object to read keys from. */
  obj: Record<string, unknown>;
  /** Dotted path prefix for the source ref, e.g. "tenants[0]" or "" for the lease top level. */
  prefix: string;
  keys: string[];
}

function tenantContainers(
  lease: RawLease,
  fieldMap: RenewalRecipientFieldMap,
): EmailSearch[] {
  const searches: EmailSearch[] = [];
  // EVERY element of lease.tenants[] (not just [0]) so co-tenants can be addressed (F-LEASE-6). Each
  // carries its own index in the source ref, keeping every resolved email individually attributable.
  const tenants = Array.isArray(lease.tenants) ? lease.tenants : [];
  tenants.forEach((element, index) => {
    const obj = asObject(element);
    if (obj) {
      searches.push({
        obj,
        prefix: `tenants[${index}]`,
        keys: fieldMap.scopedEmailKeys,
      });
    }
  });
  const tenant = asObject(lease.tenant);
  if (tenant)
    searches.push({ obj: tenant, prefix: "tenant", keys: fieldMap.scopedEmailKeys });
  // Lease-level ONLY via keys that name the tenant, never a generic `email`.
  searches.push({ obj: lease, prefix: "", keys: fieldMap.tenantLeaseKeys });
  return searches;
}

function ownerContainers(
  lease: RawLease,
  fieldMap: RenewalRecipientFieldMap,
): EmailSearch[] {
  const searches: EmailSearch[] = [];
  const owner = asObject(lease.owner);
  if (owner)
    searches.push({ obj: owner, prefix: "owner", keys: fieldMap.scopedEmailKeys });
  const firstOwner = firstElementObject(lease.owners);
  if (firstOwner) {
    searches.push({
      obj: firstOwner,
      prefix: "owners[0]",
      keys: fieldMap.scopedEmailKeys,
    });
  }
  const property = asObject(lease.property);
  const propertyOwner = property && asObject(property.owner);
  if (propertyOwner) {
    searches.push({
      obj: propertyOwner,
      prefix: "property.owner",
      keys: fieldMap.scopedEmailKeys,
    });
  }
  const portfolio = asObject(lease.portfolio);
  const portfolioOwner = portfolio && asObject(portfolio.owner);
  if (portfolioOwner) {
    searches.push({
      obj: portfolioOwner,
      prefix: "portfolio.owner",
      keys: fieldMap.scopedEmailKeys,
    });
  }
  // Owner ARRAYS on the portfolio/property appends. The live RentVine `/leases/export` row carries the
  // authoritative owner on `portfolio.owners[]` (a plural array, NOT the singular `.owner` above) —
  // confirmed 2026-07-22, present + email-shaped on 25/25 leases (Slice 1,
  // docs/products/rentvine-live-field-map-2026-07-22.md). Each element is scoped to its own index so
  // every resolved email stays individually attributable via its source ref.
  for (const [containerKey, container] of [
    ["portfolio", portfolio],
    ["property", property],
  ] as const) {
    const owners = container?.owners;
    if (Array.isArray(owners)) {
      owners.forEach((element, index) => {
        const obj = asObject(element);
        if (obj) {
          searches.push({
            obj,
            prefix: `${containerKey}.owners[${index}]`,
            keys: fieldMap.scopedEmailKeys,
          });
        }
      });
    }
  }
  // Lease-level ONLY via keys that name the owner, never a generic `email`.
  searches.push({ obj: lease, prefix: "", keys: fieldMap.ownerLeaseKeys });
  return searches;
}

function findEmail(
  searches: EmailSearch[],
  leaseLabel: string,
): { email: string; sourceRef: string } | null {
  for (const search of searches) {
    for (const key of search.keys) {
      const email = normalizeEmail(search.obj[key]);
      if (email) {
        const path = search.prefix ? `${search.prefix}.${key}` : key;
        return { email, sourceRef: `rentvine:${leaseLabel}:${path}` };
      }
    }
  }
  return null;
}

// Every DISTINCT authoritative email across the search containers, in container order (one email per
// container, its first matching key — mirroring findEmail). Deduplicated by email so the same person listed
// twice is addressed once. Order fixes the primary `to` (first) vs the Cc list (the rest).
function collectEmails(
  searches: EmailSearch[],
  leaseLabel: string,
): { email: string; sourceRef: string }[] {
  const seen = new Set<string>();
  const hits: { email: string; sourceRef: string }[] = [];
  for (const search of searches) {
    for (const key of search.keys) {
      const email = normalizeEmail(search.obj[key]);
      if (email) {
        if (!seen.has(email)) {
          seen.add(email);
          const path = search.prefix ? `${search.prefix}.${key}` : key;
          hits.push({ email, sourceRef: `rentvine:${leaseLabel}:${path}` });
        }
        break;
      }
    }
  }
  return hits;
}

function leaseLabelFor(lease: RawLease): string {
  for (const key of ["leaseID", "leaseId", "id"]) {
    const value = lease[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return `lease:${String(value).trim()}`;
    }
  }
  return "lease";
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) ? trimmed : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstElementObject(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) ? asObject(value[0]) : null;
}
