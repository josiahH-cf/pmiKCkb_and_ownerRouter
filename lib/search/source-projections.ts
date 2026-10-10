// Metadata-only projections from current owning records; no joins by a name or address.
import type { RawLease } from "@/lib/integrations/rentvine/client";
import { leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import { projectRenewalDeskIdentity } from "@/lib/lease-renewal/desk-identity";
import { normalizeRenewalDeskText } from "@/lib/lease-renewal/desk-query";
import {
  createPartyFilterResolver,
  readPartyFilterKeyConfig,
  type PartyFilterKeyConfig,
} from "@/lib/lease-renewal/party-filter-key";
import type { SearchEntity } from "./entity-types";
const positive = (v: unknown) =>
  typeof v === "string" || typeof v === "number"
    ? /^[1-9]\d*$/.test(String(v).trim())
      ? String(v).trim()
      : null
    : null;
const object = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const relatedHref = (type: string, id: string) =>
  `/search/entity?${new URLSearchParams({ type, id })}`;
export function projectLeaseSearchEntities(
  views: readonly RawLease[],
  asOf: string,
  config: PartyFilterKeyConfig = readPartyFilterKeyConfig(),
): SearchEntity[] {
  const identities = views.map((v) => ({
    view: v,
    id: leaseViewId(v),
    identity: projectRenewalDeskIdentity(v),
  }));
  const resolver = createPartyFilterResolver(
    config,
    "renewals",
    identities.flatMap((x) => [
      ...x.identity.owners.map((p) => ({
        partyKind: "owner" as const,
        normalizedLabel: normalizeRenewalDeskText(p.label),
        sourceId: p.contactId?.label ?? "",
      })),
      ...x.identity.tenants.map((p) => ({
        partyKind: "tenant" as const,
        normalizedLabel: normalizeRenewalDeskText(p.label),
        sourceId: p.contactId?.label ?? "",
      })),
    ]),
  );
  const records = new Map<string, SearchEntity>();
  function add(e: SearchEntity) {
    const key = `${e.type}:${e.id}`,
      previous = records.get(key);
    if (!previous) {
      records.set(key, e);
      return;
    }
    previous.fields = [
      ...new Map(
        [...previous.fields, ...e.fields].map((f) => [JSON.stringify(f), f]),
      ).values(),
    ].slice(0, 100);
    previous.relations = [
      ...new Map(
        [...previous.relations, ...e.relations].map((r) => [`${r.type}:${r.id}`, r]),
      ).values(),
    ];
  }
  for (const { view, id, identity } of identities) {
    if (!id || !positive(id)) continue;
    const address =
        identity.address?.label ?? identity.unit?.address?.label ?? `Lease ${id}`,
      leaseRelation = { type: "lease" as const, id, label: address };
    const fields = [
      { label: "Address", value: address },
      { label: "Lease ID", value: id },
    ];
    const relations: SearchEntity["relations"] = [];
    for (const [kind, parties] of [
      ["owner", identity.owners],
      ["resident", identity.tenants],
    ] as const) {
      for (const party of parties) {
        fields.push({
          label: `${kind === "owner" ? "Owner" : "Resident"} name`,
          value: party.label,
        });
        const contactId = positive(party.contactId?.label);
        if (!contactId) continue;
        relations.push({ type: kind, id: contactId, label: party.label });
        const token = resolver.tokenFor(
          kind === "owner" ? "owner" : "tenant",
          normalizeRenewalDeskText(party.label),
          contactId,
        );
        const href = token
          ? `/lease-renewal/live/desk?${new URLSearchParams({ v: "2", scope: "all", [kind === "owner" ? "ownerKey" : "tenantKey"]: token })}`
          : relatedHref(kind, contactId);
        add({
          type: kind,
          id: contactId,
          label: party.label,
          fields: [
            { label: "Name", value: party.label },
            { label: "Contact ID", value: contactId },
            ...(party.email
              ? [{ label: "Business contact", value: party.email.label }]
              : []),
          ],
          relations: [leaseRelation],
          href,
          asOf,
        });
      }
    }
    const property = object(view.property),
      unit = object(view.unit),
      propertyId = positive(
        property.propertyID ?? property.propertyId ?? view.propertyID ?? view.propertyId,
      ),
      unitId = positive(unit.unitID);
    if (propertyId) {
      const label =
        identity.property?.label ?? identity.address?.label ?? `Property ${propertyId}`;
      relations.push({ type: "property", id: propertyId, label });
      add({
        type: "property",
        id: propertyId,
        label,
        fields: [
          { label: "Property name/address", value: label },
          { label: "Property ID", value: propertyId },
        ],
        relations: [leaseRelation],
        href: relatedHref("property", propertyId),
        asOf,
      });
    }
    if (unitId) {
      const label =
        identity.unit?.address?.label ??
        [address, identity.unit?.label?.label].filter(Boolean).join(" ");
      relations.push({ type: "unit", id: unitId, label });
      add({
        type: "unit",
        id: unitId,
        label,
        fields: [
          { label: "Unit address", value: label },
          { label: "Unit ID", value: unitId },
        ],
        relations: [
          leaseRelation,
          ...(propertyId
            ? [
                {
                  type: "property" as const,
                  id: propertyId,
                  label: identity.property?.label ?? `Property ${propertyId}`,
                },
              ]
            : []),
        ],
        href: relatedHref("unit", unitId),
        asOf,
      });
    }
    add({
      type: "lease",
      id,
      label: address,
      fields,
      relations,
      href: `/lease-renewal/live/desk/lease/${encodeURIComponent(id)}`,
      asOf,
    });
  }
  return [...records.values()];
}

export type MaintenanceSearchRecord = Pick<
  import("@/lib/maintenance/ticket-model").MaintenanceTicketRecord,
  "id" | "summary" | "unit" | "property_id" | "status" | "updated_at" | "vendor_id"
>;
export function projectMaintenanceSearchEntities(
  tickets: readonly MaintenanceSearchRecord[],
  asOf: string,
): SearchEntity[] {
  return tickets.map((t) => ({
    type: "ticket",
    id: t.id,
    label: t.summary,
    fields: [
      { label: "Ticket summary", value: t.summary },
      { label: "Ticket ID", value: t.id },
      { label: "Status", value: t.status },
      ...(t.unit ? [{ label: "Unit address", value: t.unit.label }] : []),
    ],
    relations: [
      ...(t.unit
        ? [
            {
              type: "unit" as const,
              id: t.unit.unitId.replace(/^unit:/, ""),
              label: t.unit.label,
            },
          ]
        : []),
      ...(t.property_id
        ? [
            {
              type: "property" as const,
              id: t.property_id,
              label: `Property ${t.property_id}`,
            },
          ]
        : []),
      ...(t.vendor_id
        ? [
            {
              type: "vendor" as const,
              id: t.vendor_id,
              label: `Assigned vendor ${t.vendor_id}`,
            },
          ]
        : []),
    ],
    href: `/maintenance?${new URLSearchParams({ ticket_id: t.id })}`,
    asOf,
  }));
}
