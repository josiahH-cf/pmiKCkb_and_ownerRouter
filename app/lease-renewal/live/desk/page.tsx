import Link from "next/link";
import { cookies } from "next/headers";

import { AppShell } from "@/components/layout/AppShell";
import { RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  deskPreferenceModeFor,
  getRenewalDeskPreference,
} from "@/lib/firestore/renewal-desk-preferences";
import { loadRenewalAssistantSource } from "@/lib/lease-renewal/assistant-source";
import type { LiveDeskStatus } from "@/lib/lease-renewal/live-desk";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import { resolveRenewalDeskEntry } from "@/lib/lease-renewal/desk-preferences";
import { normalizeRenewalDeskText } from "@/lib/lease-renewal/desk-query";
import { parseRenewalDeskQueryV2 } from "@/lib/lease-renewal/desk-query-v2";
import { isOperatingSheetWritebackPaused } from "@/lib/lease-renewal/sheet-writeback-policy";
import {
  createPartyFilterResolver,
  readPartyFilterKeyConfig,
} from "@/lib/lease-renewal/party-filter-key";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import {
  RENEWAL_SOURCE_REFRESH_COOKIE,
  parseRenewalSourceRefreshAfter,
} from "@/lib/lease-renewal/post-write-freshness";

// Renewals-space Editors and up. Reads live RentVine + the renewal sheet on each render, so it is never
// statically cached. It is read-only and draft-only: no send, no sheet write-back. This is the
// canonical Renewal landing and surfaces real leases with their real reconciliation through one
// sortable, filterable table (S82).
//
// S166: this page only reads the signed-in account's remembered worklist view. A URL that names a
// view decides the navigation; the bare route is the ordinary entry and opens the remembered view;
// anything that no longer validates opens the default. Opening the page never changes what is
// remembered, and the remembered view never decides whether a lease can be opened or worked.
export const dynamic = "force-dynamic";

const RENEWALS_SPACE_ID = "renewals";

type DeskSearchParams = Record<string, string | string[] | undefined>;

const PANELS: Record<
  LiveDeskStatus,
  { title: string; body: string; link?: { href: string; label: string } }
> = {
  not_configured: {
    title: "Live sources aren’t connected",
    body: "Connect RentVine and the renewal sheet to run the live desk.",
    link: { href: "/connections", label: "Open Connection Center" },
  },
  account_mismatch: {
    title: "Wrong RentVine account",
    body: "The configured RentVine account isn’t the PMI KC Metro tenant. An admin needs to correct the connection before a live read can run.",
    link: { href: "/connections", label: "Open Connection Center" },
  },
  read_error: {
    title: "Live read didn’t complete",
    body: "The live read couldn’t finish. This is usually a temporary network issue; reload to try again.",
  },
};

/**
 * The account's stored view, or null. The worklist stays usable with its default view when the
 * preference store cannot be read; the failure is logged without any value.
 */
async function storedDeskView(user: AuthenticatedUser): Promise<string | null> {
  try {
    return (await getRenewalDeskPreference(user))?.view ?? null;
  } catch (error) {
    console.error(
      `Renewal desk preference read failed (${error instanceof Error ? error.name : "unknown"}).`,
    );
    return null;
  }
}

export default async function LiveRenewalDeskPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<DeskSearchParams> }>) {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability(renewalRoleCapability("read_workspace"));

  // S110: one orchestration produces these rows, shared with the Dashboard assistant, so the table
  // and the assistant cannot drift. The page supplies the clock and its post-write freshness floor.
  const now = new Date();
  const rawSearchParams = (await searchParams) ?? {};
  const sourceRefreshAfter = parseRenewalSourceRefreshAfter(
    (await cookies()).get(RENEWAL_SOURCE_REFRESH_COOKIE)?.value,
    now.getTime(),
  );
  // The one small preference read runs beside the source load; it never delays or fails it.
  const [{ outcome, auxiliaryFailures }, storedView] = await Promise.all([
    loadRenewalAssistantSource(user, now, sourceRefreshAfter),
    storedDeskView(user),
  ]);

  // S82: opaque owner/tenant filter shortcuts. Missing key configuration fails only these
  // shortcuts closed; the unfiltered table stays usable.
  const partyResolver = createPartyFilterResolver(
    readPartyFilterKeyConfig(),
    RENEWALS_SPACE_ID,
  );
  const partyFilters = {
    available: partyResolver.available,
    tokenFor: partyResolver.tokenFor,
    matches: partyResolver.matches,
  };

  // Legacy `owner`/`tenant` display labels resolve once against the current authorized projection;
  // the label itself never reaches the canonical URL.
  const items = outcome.status === "ok" ? outcome.view.items : [];
  const partyLabels = (item: DeskLeaseRow, kind: "owner" | "tenant") =>
    kind === "owner" ? item.queryKeys.normalizedOwners : item.queryKeys.normalizedTenants;
  const entry = resolveRenewalDeskEntry({
    searchParams: rawSearchParams,
    storedView,
    parseExplicit: (input) =>
      parseRenewalDeskQueryV2(input, {
        resolveLegacyPartyLabel: (kind, label) => {
          if (!partyResolver.available) return null;
          const normalized = normalizeRenewalDeskText(label);
          if (normalized === "") return null;
          const present = items.some((item: DeskLeaseRow) =>
            partyLabels(item, kind).includes(normalized),
          );
          return present ? partyResolver.tokenFor(kind, normalized) : null;
        },
      }),
    // A remembered opaque party token is kept only while it still resolves against a party in
    // the current authorized projection (for example, it stops resolving after its key rotates).
    partyTokenResolves: (kind, token) =>
      items.some((item: DeskLeaseRow) =>
        partyResolver.matches(token, kind, partyLabels(item, kind)),
      ),
  });
  const query = entry.state;
  const viewMemory = {
    source: entry.source,
    savedView: entry.savedView,
    memory: deskPreferenceModeFor(user),
  };

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/lease-renewal">
          ← Renewals
        </Link>
        {outcome.status === "ok" ? (
          <RenewalDesk
            auxiliaryFailures={auxiliaryFailures}
            sheetWritebackPaused={isOperatingSheetWritebackPaused()}
            liveReviewHref="/lease-renewal/live"
            partyFilters={partyFilters}
            query={query}
            role={user.role}
            view={outcome.view}
            viewMemory={viewMemory}
          />
        ) : (
          <LiveDeskPanel status={outcome.status} />
        )}
      </section>
    </AppShell>
  );
}

function LiveDeskPanel({ status }: Readonly<{ status: LiveDeskStatus }>) {
  const panel = PANELS[status];
  return (
    <article className="panel">
      <h1 className="section-title">{panel.title}</h1>
      <p className="muted">{panel.body}</p>
      {panel.link ? (
        <p>
          <Link className="secondary-button" href={panel.link.href}>
            {panel.link.label}
          </Link>
        </p>
      ) : null}
    </article>
  );
}
