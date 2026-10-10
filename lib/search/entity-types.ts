import { z } from "zod";
export const ENTITY_TYPES = [
  "lease",
  "owner",
  "resident",
  "property",
  "unit",
  "ticket",
  "vendor",
] as const;
export const ENTITY_LABELS: Record<(typeof ENTITY_TYPES)[number], string> = {
  lease: "Lease",
  owner: "Owner",
  resident: "Resident",
  property: "Property",
  unit: "Unit",
  ticket: "Maintenance ticket",
  vendor: "Vendor",
};
const Id = z.string().regex(/^[A-Za-z0-9_:-]{1,160}$/),
  Type = z.enum(ENTITY_TYPES);
export const SearchEntitySchema = z
  .object({
    id: Id,
    type: Type,
    label: z.string().min(1).max(400),
    fields: z
      .array(z.object({ label: z.string().max(80), value: z.string().max(500) }).strict())
      .max(100),
    relations: z
      .array(z.object({ type: Type, id: Id, label: z.string().max(400) }).strict())
      .max(2000),
    href: z
      .string()
      .max(1000)
      .regex(/^\/(?!\/)[^\s]*$/),
    asOf: z.string().datetime().nullable(),
  })
  .strict();
export type SearchEntity = z.infer<typeof SearchEntitySchema>;
export interface SearchBatch {
  source: "renewals" | "maintenance" | "vendors";
  status: "ok" | "partial" | "unavailable" | "not_authorized";
  asOf: string | null;
  note: string | null;
  entities: SearchEntity[];
}
export interface SearchResult {
  entity: SearchEntity;
  match: { field: string; context: string };
}
export interface EntitySearchPage {
  results: SearchResult[];
  nextCursor: string | null;
  limitations: Array<Omit<SearchBatch, "entities">>;
  readAt: string;
}
export const SearchQuerySchema = z
  .object({
    q: z.string().trim().max(160),
    type: z.enum(["all", ...ENTITY_TYPES]).default("all"),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(1200).nullable().default(null),
  })
  .strict();
export function entityOpenHref(entity: Pick<SearchEntity, "type" | "id">) {
  return `/search/open?${new URLSearchParams({ type: entity.type, id: entity.id })}`;
}

export const EntitySearchPageSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            entity: SearchEntitySchema,
            match: z
              .object({ field: z.string().max(300), context: z.string().max(500) })
              .strict(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().max(1200).nullable(),
    limitations: z
      .array(
        z
          .object({
            source: z.enum(["renewals", "maintenance", "vendors"]),
            status: z.enum(["ok", "partial", "unavailable", "not_authorized"]),
            asOf: z.string().datetime().nullable(),
            note: z.string().max(500).nullable(),
          })
          .strict(),
      )
      .max(10),
    readAt: z.string().datetime(),
  })
  .strict();
