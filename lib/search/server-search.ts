// S203 request-authenticated search over metadata snapshots from existing source owners.
// Provider reads reuse the established bounded RentVine cache/admission. App-owned metadata is
// reread on each request; an index generation never substitutes for current actor admission.
import { createHash } from "node:crypto";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { EditableLayerError } from "@/lib/firestore/errors";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { readCoherentRenewalDisplaySource } from "@/lib/lease-renewal/admitted-notice-source";
import {
  buildEntityIndex,
  queryEntityIndex,
  entityKey,
  type EntityIndex,
} from "./entity-index";
import { projectLeaseSearchEntities } from "./source-projections";
import type { SearchBatch, SearchEntity } from "./entity-types";
export interface EntitySearchDependencies {
  renewals: () => Promise<SearchBatch>;
  maintenance: () => Promise<SearchBatch>;
  vendors: () => Promise<SearchBatch>;
}
const generations = new Map<string, EntityIndex>();
function assertStaff(a: AuthenticatedUser) {
  if (
    a.hd !== "pmikcmetro.com" ||
    !a.email.toLowerCase().endsWith("@pmikcmetro.com") ||
    !["Editor", "Approver", "Admin"].includes(a.role) ||
    !can(a.role, "read")
  )
    throw new EditableLayerError("Current managed staff read access is required.", 403);
}
export function entitySearchScope(a: AuthenticatedUser) {
  assertStaff(a);
  return createHash("sha256")
    .update(
      JSON.stringify([
        a.uid,
        a.role,
        hasSpaceAccess(a, "renewals"),
        hasSpaceAccess(a, "maintenance"),
      ]),
    )
    .digest("hex");
}
function defaultDependencies(
  actor: AuthenticatedUser,
  now: Date,
): EntitySearchDependencies {
  return {
    renewals: async () => {
      const config = buildLiveRentVineConfig();
      if (!config.ok)
        return {
          source: "renewals",
          status: "unavailable",
          asOf: null,
          note: "Lease, people, property and unit metadata are unavailable until the RentVine read connection is ready.",
          entities: [],
        };
      const read = await readCoherentRenewalDisplaySource(
        actor,
        config.rentvineClient,
        now.getTime(),
      );
      const asOf = new Date(read.snapshot.readAtMs).toISOString(),
        partial = !read.snapshot.complete || read.currency.state !== "fresh";
      return {
        source: "renewals",
        status: partial ? "partial" : "ok",
        asOf,
        note: partial
          ? `Lease metadata is ${read.currency.state}; source completeness is ${read.snapshot.complete ? "complete" : "partial"}.`
          : null,
        entities: projectLeaseSearchEntities(read.snapshot.views, asOf),
      };
    },
    maintenance: async () => ({
      source: "maintenance",
      status: "not_authorized",
      asOf: null,
      note: "Custom maintenance is retired.",
      entities: [],
    }),
    vendors: async () => ({
      source: "vendors",
      status: "not_authorized",
      asOf: null,
      note: "Custom vendor operations are retired.",
      entities: [],
    }),
  };
}
export async function readEntitySearchIndex(
  actor: AuthenticatedUser,
  dependencies?: EntitySearchDependencies,
  now = new Date(),
) {
  const scope = entitySearchScope(actor),
    deps = dependencies ?? defaultDependencies(actor, now),
    sources = ["renewals"] as const;
  const batches = await Promise.all(
    sources.map(async (source) => {
      const space = "renewals";
      if (!hasSpaceAccess(actor, space))
        return {
          source,
          status: "not_authorized" as const,
          asOf: null,
          note: "This source is outside current access.",
          entities: [],
        };
      try {
        return await deps[source]();
      } catch {
        return {
          source,
          status: "unavailable" as const,
          asOf: null,
          note: "Lease and related entity metadata could not be read. Retry this search.",
          entities: [],
        };
      }
    }),
  );
  const index = buildEntityIndex(batches, scope, generations.get(scope));
  generations.delete(scope);
  generations.set(scope, index);
  while (generations.size > 32) generations.delete(generations.keys().next().value!);
  return index;
}
export async function searchEntities(
  actor: AuthenticatedUser,
  query: unknown,
  dependencies?: EntitySearchDependencies,
) {
  return queryEntityIndex(await readEntitySearchIndex(actor, dependencies), query);
}
export async function readSearchEntity(
  actor: AuthenticatedUser,
  type: SearchEntity["type"],
  id: string,
  dependencies?: EntitySearchDependencies,
) {
  const index = await readEntitySearchIndex(actor, dependencies);
  return {
    entity: index.records.find((e) => entityKey(e) === `${type}:${id}`) ?? null,
    index,
  };
}
