// S120 (R120.3): the lease-side view of the shared renewal resource entries. It reads the one
// existing settings shape the Connections panel edits, shows each entry's current state with a
// context-sensitive setup action, and never repeats the ten global forms inside a lease. A failed
// settings read stays distinct from a confirmed blank, and an unverified value is never a link.
// Server-safe: no state, no fetch.

import Link from "next/link";

import { RenewalSectionHeading } from "@/components/lease-renewal/RenewalSectionHeading";
import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
} from "@/lib/lease-renewal/desk-destinations";
import { resourceEntryHref } from "@/lib/lease-renewal/message-readiness";
import {
  RENEWAL_RESOURCE_FIELDS,
  usableRenewalResourceUrl,
  type RenewalResourceSettings,
} from "@/lib/lease-renewal/resource-locations";
import {
  describeTenantResourceUse,
  isTenantResourceId,
  tenantResourceUse,
} from "@/lib/lease-renewal/tenant-resource-evidence";

export function RenewalResourceLinksSummary({
  canManage,
  settings,
  todayIso,
}: Readonly<{
  /** The page's existing Admin capability check; the summary itself grants nothing. */
  canManage: boolean;
  /** Null means the settings read failed; the saved values are unknown, not blank. */
  settings: RenewalResourceSettings | null;
  /** S265: the page's business date; a tenant entry is read for tenant use on it. */
  todayIso: string;
}>) {
  const admin = canManage;
  return (
    <section
      id="renewal-resource-locations"
      className="panel ui-stack"
      aria-label="Renewal resource links"
      tabIndex={-1}
    >
      <RenewalSectionHeading id="resource-links" as="h3">
        Renewal resource links
      </RenewalSectionHeading>
      {settings === null ? (
        <p role="alert">
          Saved links could not be read. Their values are unknown; nothing here is assumed
          blank.
        </p>
      ) : (
        <p className="muted">
          Shared resources · only staff-verified entries are usable.
        </p>
      )}
      <ul className="ui-rows">
        {RENEWAL_RESOURCE_FIELDS.map((field) => {
          const entry = settings?.entries[field.id];
          // S265: a tenant link is usable only with its current tenant audience check.
          const tenantUse =
            settings !== null && isTenantResourceId(field.id)
              ? tenantResourceUse(field.id, entry, todayIso)
              : null;
          const url = tenantUse
            ? tenantUse.state === "usable"
              ? tenantUse.url
              : null
            : usableRenewalResourceUrl(entry);
          const state =
            settings === null
              ? "Unknown saved state"
              : tenantUse
                ? describeTenantResourceUse(tenantUse)
                : !entry?.url
                  ? "Pending team input"
                  : url
                    ? "Checked by staff"
                    : "Destination needs review";
          return (
            <li key={field.id} id={`renewal-resource-${field.id}`}>
              <strong>{field.label}</strong>: {state}
              {url ? (
                <>
                  {" · "}
                  <a
                    className="text-link"
                    href={url}
                    target={EXTERNAL_LINK_TARGET}
                    rel={EXTERNAL_LINK_REL}
                  >
                    Open checked destination
                  </a>
                </>
              ) : null}
              {" · "}
              <Link className="text-link" href={resourceEntryHref(field.id)}>
                {admin ? "Manage" : "View setting"}
              </Link>
            </li>
          );
        })}
      </ul>
      {admin ? (
        <p>
          <Link className="text-link" href="/connections#renewal-resource-locations">
            Manage shared resource links in Connections
          </Link>
        </p>
      ) : (
        <p className="muted">
          An Admin maintains these shared links in Connections.{" "}
          <RequestAccessLink surface="renewal_resources.manage" />
        </p>
      )}
    </section>
  );
}
