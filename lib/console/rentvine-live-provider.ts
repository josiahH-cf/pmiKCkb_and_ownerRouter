import { createHash } from "node:crypto";

import type { RentVineClient } from "@/lib/integrations/rentvine/client";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import type {
  ConsoleDataProvider,
  ConsoleOperationalRow,
  ConsoleSourceHealth,
} from "@/lib/console/live-data";

const MAX_ROWS = 30;
const CACHE_MS = 5 * 60 * 1_000;

interface CachedRows {
  expiresAt: number;
  rows: ConsoleOperationalRow[];
}

let cache: CachedRows | null = null;

export function resetRentvineConsoleCacheForTests() {
  cache = null;
}

export function createRentvineConsoleProvider(
  options: {
    client?: Pick<RentVineClient, "listLeasesExport">;
    now?: () => Date;
  } = {},
): ConsoleDataProvider {
  return {
    async load() {
      const now = options.now ?? (() => new Date());
      const observedAt = now().toISOString();
      const client = options.client ?? configuredClient();
      if (!client) {
        return {
          rows: [],
          sourceHealth: unavailableHealth(
            "The Rentvine read connection is not configured for this revision.",
          ),
        };
      }

      if (!options.client && cache && cache.expiresAt > now().getTime()) {
        return { rows: cache.rows, sourceHealth: healthySourceState() };
      }

      try {
        const rawRows = await client.listLeasesExport();
        const rows = rawRows
          .slice(0, MAX_ROWS)
          .map((row) => toConsoleRow(row, observedAt))
          .filter((row): row is ConsoleOperationalRow => row !== null);
        if (!options.client) {
          cache = { expiresAt: now().getTime() + CACHE_MS, rows };
        }
        return { rows, sourceHealth: healthySourceState() };
      } catch {
        return {
          rows: [],
          sourceHealth: unavailableHealth(
            "The Rentvine read failed. Check the connection, then retry.",
          ),
        };
      }
    },
  };
}

function configuredClient() {
  const config = buildLiveRentVineConfig();
  return config.ok ? config.rentvineClient : null;
}

function toConsoleRow(
  row: Record<string, unknown>,
  observedAt: string,
): ConsoleOperationalRow | null {
  const lease = objectValue(row.lease) ?? row;
  const unit = objectValue(row.unit) ?? {};
  const property = objectValue(row.property) ?? {};
  const tenant = firstTenant(lease);
  const propertyLabel =
    unitAddress(unit) ??
    firstString(property, ["name", "propertyName", "address", "address1"]);
  const leaseRef = firstString(lease, ["leaseID", "leaseId", "id"]);
  if (!tenant && !propertyLabel && !leaseRef) return null;

  const rent =
    firstFiniteNumber(unit, ["rent", "currentRent", "rentAmount"]) ??
    firstFiniteNumber(lease, ["rent", "currentRent", "rentAmount"]);
  const leaseEnd = firstString(lease, [
    "endDate",
    "leaseEndDate",
    "leaseTo",
    "expirationDate",
    "dateEnd",
  ]);
  const opaqueKey = createHash("sha256")
    .update(leaseRef ?? `${propertyLabel ?? "unknown"}\u0000${tenant ?? "unknown"}`)
    .digest("hex")
    .slice(0, 24);

  return {
    currentRent: field(
      "Rentvine",
      rent === null ? undefined : formatMoney(rent),
      observedAt,
      rent === null ? "needs_review" : "fresh",
    ),
    leaseEnd: field(
      "Rentvine",
      leaseEnd,
      observedAt,
      leaseEnd ? "fresh" : "needs_review",
    ),
    property: field(
      "Rentvine",
      propertyLabel ?? "Needs review",
      observedAt,
      propertyLabel ? "fresh" : "needs_review",
    ),
    rowKey: `rentvine-${opaqueKey}`,
    spaceId: "lease-renewals",
    tenant: field(
      "Rentvine",
      tenant ?? "Needs review",
      observedAt,
      tenant ? "fresh" : "needs_review",
    ),
    workflow: field("PMI KC workflow", "Lease renewal review", observedAt, "fresh"),
    workflowHref: "/lease-renewal/live",
  };
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstTenant(lease: Record<string, unknown>) {
  const direct = firstString(lease, [
    "tenantName",
    "primaryTenantName",
    "primaryTenant",
    "leaseName",
  ]);
  if (direct) return direct;
  const tenants = Array.isArray(lease.tenants) ? lease.tenants : [];
  const first = objectValue(tenants[0]);
  if (!first) return null;
  const named = firstString(first, ["name", "tenantName", "displayName"]);
  if (named) return named;
  const combined = [
    firstString(first, ["firstName", "first_name"]),
    firstString(first, ["lastName", "last_name"]),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  return combined || null;
}

function unitAddress(unit: Record<string, unknown>) {
  const street = [
    firstString(unit, ["streetNumber"]),
    firstString(unit, ["streetName"]),
    firstString(unit, ["address2"]),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  return street || firstString(unit, ["address", "address1", "addressLine1"]);
}

function firstString(value: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().slice(0, 160);
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return null;
}

function firstFiniteNumber(value: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim()) {
      const parsed = Number(candidate.replace(/[$,\s]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function field<T>(
  source: "Rentvine" | "PMI KC workflow" | "Gmail",
  value: T | null | undefined,
  observedAt: string,
  state: "fresh" | "needs_review",
) {
  return {
    observedAt,
    source,
    state,
    ...(value === null || value === undefined ? {} : { value }),
  };
}

function healthySourceState(): ConsoleSourceHealth[] {
  return [
    {
      guidance: "Live lease facts loaded from the configured Rentvine account.",
      source: "Rentvine",
      state: "fresh",
    },
    {
      guidance: "Open the workflow to review current app state and actions.",
      source: "PMI KC workflow",
      state: "fresh",
    },
    {
      guidance: "Linked Gmail content loads only from an authorized workflow panel.",
      source: "Gmail",
      state: "fresh",
    },
  ];
}

function unavailableHealth(rentvineGuidance: string): ConsoleSourceHealth[] {
  return [
    { guidance: rentvineGuidance, source: "Rentvine", state: "unavailable" },
    {
      guidance: "Open Spaces or Maintenance to work with records already in the app.",
      source: "PMI KC workflow",
      state: "fresh",
    },
    {
      guidance: "Open a linked workflow communication to check Gmail.",
      source: "Gmail",
      state: "fresh",
    },
  ];
}
