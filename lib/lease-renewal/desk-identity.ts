import type { RawLease } from "@/lib/integrations/rentvine/client";
import { leaseAddressLabel, leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import type {
  DeskIdentityFact,
  RenewalDeskIdentity,
} from "@/lib/lease-renewal/desk-model";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function presentString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function firstString(
  object: Record<string, unknown>,
  keys: readonly string[],
): { key: string; value: string } | null {
  for (const key of keys) {
    const value = presentString(object[key]);
    if (value) return { key, value };
  }
  return null;
}

function personName(
  object: Record<string, unknown>,
): { path: string; label: string } | null {
  const direct = firstString(object, ["name", "displayName", "companyName"]);
  if (direct) return { path: direct.key, label: direct.value };
  const first = firstString(object, ["firstName", "first_name"]);
  const last = firstString(object, ["lastName", "last_name"]);
  const label = [first?.value, last?.value].filter(Boolean).join(" ");
  if (!label) return null;
  return {
    path: [first?.key, last?.key].filter(Boolean).join("+"),
    label,
  };
}

function sourceRoot(lease: RawLease): string {
  const id = leaseViewId(lease);
  return id ? `rentvine:lease:${id}` : "rentvine:lease";
}

function fact(
  root: string,
  path: string,
  value: { path: string; label: string },
): DeskIdentityFact {
  return {
    label: value.label,
    sourceRef: `${root}:${path}.${value.path}`,
  };
}

function dedupeFacts(facts: readonly DeskIdentityFact[]): DeskIdentityFact[] {
  const seen = new Set<string>();
  return facts.filter((candidate) => {
    const key = candidate.label.trim().toLocaleLowerCase("en-US");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tenantFacts(lease: RawLease, root: string): DeskIdentityFact[] {
  const facts: DeskIdentityFact[] = [];
  if (Array.isArray(lease.tenants)) {
    lease.tenants.forEach((value, index) => {
      const object = asObject(value);
      const name = object ? personName(object) : null;
      if (name) facts.push(fact(root, `tenants[${index}]`, name));
    });
  }
  if (facts.length > 0) return dedupeFacts(facts);

  const nestedTenant = asObject(lease.tenant);
  const nestedName = nestedTenant ? personName(nestedTenant) : null;
  if (nestedName) facts.push(fact(root, "tenant", nestedName));

  if (facts.length === 0) {
    const direct = firstString(lease, [
      "tenantName",
      "primaryTenantName",
      "primaryTenant",
      "leaseName",
    ]);
    if (direct) {
      facts.push({ label: direct.value, sourceRef: `${root}:${direct.key}` });
    }
  }
  return dedupeFacts(facts);
}

function addOwnerArray(
  facts: DeskIdentityFact[],
  root: string,
  value: unknown,
  path: string,
): void {
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    const object = asObject(entry);
    const name = object ? personName(object) : null;
    if (name) facts.push(fact(root, `${path}[${index}]`, name));
  });
}

function addOwnerObject(
  facts: DeskIdentityFact[],
  root: string,
  value: unknown,
  path: string,
): void {
  const object = asObject(value);
  const name = object ? personName(object) : null;
  if (name) facts.push(fact(root, path, name));
}

function ownerFacts(lease: RawLease, root: string): DeskIdentityFact[] {
  const portfolio = asObject(lease.portfolio);
  const property = asObject(lease.property);

  // Use one exact source tier. The measured Production export's portfolio.owners[] roster wins;
  // alternate shapes are fallbacks only when the preceding tier contains no displayable name. This
  // prevents a stale or differently scoped fallback from being appended beside authoritative owners.
  const arrayTiers: readonly (readonly [unknown, string])[] = [
    [portfolio?.owners, "portfolio.owners"],
    [property?.owners, "property.owners"],
    [lease.owners, "owners"],
  ];
  for (const [value, path] of arrayTiers) {
    const facts: DeskIdentityFact[] = [];
    addOwnerArray(facts, root, value, path);
    if (facts.length > 0) return dedupeFacts(facts);
  }

  const objectTiers: readonly (readonly [unknown, string])[] = [
    [portfolio?.owner, "portfolio.owner"],
    [property?.owner, "property.owner"],
    [lease.owner, "owner"],
  ];
  for (const [value, path] of objectTiers) {
    const facts: DeskIdentityFact[] = [];
    addOwnerObject(facts, root, value, path);
    if (facts.length > 0) return facts;
  }

  const direct = firstString(lease, ["ownerName", "primaryOwnerName"]);
  return direct ? [{ label: direct.value, sourceRef: `${root}:${direct.key}` }] : [];
}

function addressFact(lease: RawLease, root: string): DeskIdentityFact | null {
  const property = asObject(lease.property);
  if (property) {
    const label = leaseAddressLabel({ property });
    if (label) return { label, sourceRef: `${root}:property.address` };
  }
  const withoutProperty = { ...lease, property: undefined };
  const label = leaseAddressLabel(withoutProperty);
  return label ? { label, sourceRef: `${root}:lease.address` } : null;
}

function propertyFact(lease: RawLease, root: string): DeskIdentityFact | null {
  const property = asObject(lease.property);
  if (!property) return null;
  const hit = firstString(property, ["name", "propertyName", "displayName"]);
  return hit ? { label: hit.value, sourceRef: `${root}:property.${hit.key}` } : null;
}

/**
 * Exact, provider-free identity projection for one measured export view. Missing names stay absent;
 * an email, neighboring row, address fragment, or lease id is never promoted into a party name.
 */
export function projectRenewalDeskIdentity(lease: RawLease): RenewalDeskIdentity {
  const root = sourceRoot(lease);
  return {
    address: addressFact(lease, root),
    property: propertyFact(lease, root),
    tenants: tenantFacts(lease, root),
    owners: ownerFacts(lease, root),
  };
}
