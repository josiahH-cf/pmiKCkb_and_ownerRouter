// Resolve the authoritative renewal-notice recipient (owner or tenant) from a live Rentvine lease.
//
// This is the recipient half of the live-renewal-run → real-draft path. It NEVER invents an address:
// when an authoritative email is not present in the read, it returns a `Needs Verification` shaped
// result (`verified:false`, a `missing` entry, no `to`), and the draft step must refuse rather than
// guess. When an email IS present it returns it lowercased plus a source pointer
// (`rentvine:lease:<id>:<field-path>`) that the governed executor stores as `recipient_source_ref`.
//
// Honest coverage note: Rentvine's `/leases/export` row carries the tenant on `lease.tenants[]`, so the
// TENANT channel resolves directly from the live read. The OWNER contact lives on the property/owner
// relationship, which the lease-view flatten drops today — so the OWNER channel resolves only when an
// owner object is actually present, and is otherwise honestly `Needs Verification` until the
// property→owner join lands. To avoid MIS-attribution, a party's email is read only from that party's
// own scoped object (or a lease-level key that explicitly names the party) — never from a generic
// top-level `email` that could belong to the other side.

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

  const hit =
    channel === "tenant"
      ? findEmail(tenantContainers(lease, fieldMap), leaseLabel)
      : findEmail(ownerContainers(lease, fieldMap), leaseLabel);

  if (hit) {
    return {
      channel,
      to: hit.email,
      recipientSourceRef: hit.sourceRef,
      verified: true,
      missing: [],
    };
  }
  return { channel, verified: false, missing: [`${channel} email`] };
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
  const firstTenant = firstElementObject(lease.tenants);
  if (firstTenant) {
    searches.push({
      obj: firstTenant,
      prefix: "tenants[0]",
      keys: fieldMap.scopedEmailKeys,
    });
  }
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
