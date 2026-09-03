import Link from "next/link";
import { cookies } from "next/headers";

import { AppShell } from "@/components/layout/AppShell";
import { RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { listAllRenewalProgress } from "@/lib/firestore/lease-renewal-progress";
import { readNoticeRuleSnapshot } from "@/lib/firestore/lease-renewal-notice-rules";
import { listResolutionsForRun } from "@/lib/firestore/lease-renewal-resolutions";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { listDismissedRenewalFollowUpKeys } from "@/lib/firestore/lease-renewal-follow-up-attention";
import { listCurrentRenewalPacketSnapshots } from "@/lib/firestore/lease-document-packet-snapshots";
import { loadLiveRenewalDesk, type LiveDeskStatus } from "@/lib/lease-renewal/live-desk";
import { buildLiveRenewalConfig } from "@/lib/lease-renewal/live-config";
import {
  getLiveLeaseSnapshot,
  getLiveLeaseSnapshotAtOrAfter,
  type LiveLeaseSnapshotResult,
} from "@/lib/lease-renewal/live-lease-cache";
import { leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import {
  buildRenewalDeskWindow,
  normalizeRenewalDeskText,
} from "@/lib/lease-renewal/desk-query";
import { parseRenewalDeskQueryV2 } from "@/lib/lease-renewal/desk-query-v2";
import {
  createPartyFilterResolver,
  readPartyFilterKeyConfig,
} from "@/lib/lease-renewal/party-filter-key";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import {
  readRenewalAuxiliary,
  renewalAuxiliaryFailures,
  renewalAuxiliaryValue,
} from "@/lib/lease-renewal/auxiliary-read";
import { DEFAULT_NOTICE_RULE_SET } from "@/lib/lease-renewal/notice-rules";
import {
  RENEWAL_SOURCE_REFRESH_COOKIE,
  parseRenewalSourceRefreshAfter,
} from "@/lib/lease-renewal/post-write-freshness";

// Renewals-space Editors and up. Reads live RentVine + the renewal sheet on each render, so it is never
// statically cached. It is read-only and draft-only: no send, no sheet write-back. This is the
// canonical Renewal landing and surfaces real leases with their real reconciliation through one
// sortable, filterable table (S82).
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 120;
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

export default async function LiveRenewalDeskPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<DeskSearchParams> }>) {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability(renewalRoleCapability("read_workspace"));

  // S78: the pure helper owns the first-of-current-month + 120-day rule. The page supplies the clock;
  // the loader/query projection remains deterministic and provider-effect-free.
  const now = new Date();
  const window = buildRenewalDeskWindow(now.toISOString().slice(0, 10), WINDOW_DAYS);
  const rawSearchParams = (await searchParams) ?? {};
  const liveConfig = buildLiveRenewalConfig();
  const sourceRefreshAfter = parseRenewalSourceRefreshAfter(
    (await cookies()).get(RENEWAL_SOURCE_REFRESH_COOKIE)?.value,
    now.getTime(),
  );
  let leaseSnapshotResult: LiveLeaseSnapshotResult | undefined;
  if (liveConfig.ok) {
    try {
      leaseSnapshotResult =
        sourceRefreshAfter === null
          ? await getLiveLeaseSnapshot(liveConfig.rentvineClient, now.getTime())
          : await getLiveLeaseSnapshotAtOrAfter(
              liveConfig.rentvineClient,
              now.getTime(),
              sourceRefreshAfter,
            );
    } catch {
      leaseSnapshotResult = undefined;
    }
  }

  const [
    progressRead,
    policyRead,
    communicationsRead,
    dismissedRead,
    resolutionsRead,
    packetRead,
  ] = await Promise.all([
    readRenewalAuxiliary("progress", () => listAllRenewalProgress(user)),
    readRenewalAuxiliary("notice_policy", () => readNoticeRuleSnapshot()),
    readRenewalAuxiliary("communications", () =>
      createGmailHubService(user).listCommunications(),
    ),
    readRenewalAuxiliary("dismissed_attention", () =>
      listDismissedRenewalFollowUpKeys(user),
    ),
    // S82: one bulk read of record-specific human resolutions so the table's rent verification
    // reflects exact current decisions. A missing decision store never makes a value look resolved.
    readRenewalAuxiliary("resolutions", () => listResolutionsForRun(user, "live-review")),
    readRenewalAuxiliary("packet", async () => {
      if (!liveConfig.ok || !leaseSnapshotResult) {
        throw new Error("Live renewal sources are unavailable.");
      }
      return listCurrentRenewalPacketSnapshots(
        user,
        leaseSnapshotResult.snapshot.views.flatMap((view) => {
          const leaseId = leaseViewId(view);
          return leaseId ? [leaseId] : [];
        }),
      );
    }),
  ]);
  const progressByLease = renewalAuxiliaryValue(progressRead, new Map());
  const policy = renewalAuxiliaryValue(policyRead, {
    state: "unreadable" as const,
    ruleSet: DEFAULT_NOTICE_RULE_SET,
    version: null,
    updatedAtIso: null,
  });
  const communications = {
    state:
      communicationsRead.status === "available"
        ? ("current" as const)
        : ("unreadable" as const),
    links: renewalAuxiliaryValue(communicationsRead, []),
  };
  const dismissedAttentionKeys = renewalAuxiliaryValue(dismissedRead, []);
  const resolutions = renewalAuxiliaryValue(resolutionsRead, []);
  const packetSnapshotsByLease =
    packetRead.status === "available" ? packetRead.value : undefined;
  const auxiliaryFailures = renewalAuxiliaryFailures([
    progressRead,
    policyRead,
    communicationsRead,
    dismissedRead,
    resolutionsRead,
    packetRead,
  ]);
  const outcome = !liveConfig.ok
    ? ({ status: liveConfig.reason } as const)
    : !leaseSnapshotResult
      ? ({ status: "read_error" } as const)
      : await loadLiveRenewalDesk(
          [window],
          now.toISOString(),
          liveConfig,
          progressByLease,
          {
            communicationState: communications.state,
            links: communications.links,
            policy,
            dismissedAttentionKeys,
          },
          resolutions,
          packetSnapshotsByLease,
          progressRead.status === "available",
          leaseSnapshotResult,
        );

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
  const query = parseRenewalDeskQueryV2(rawSearchParams, {
    resolveLegacyPartyLabel: (kind, label) => {
      if (!partyResolver.available) return null;
      const normalized = normalizeRenewalDeskText(label);
      if (normalized === "") return null;
      const present = items.some((item) =>
        (kind === "owner"
          ? item.queryKeys.normalizedOwners
          : item.queryKeys.normalizedTenants
        ).includes(normalized),
      );
      return present ? partyResolver.tokenFor(kind, normalized) : null;
    },
  });

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/lease-renewal">
          ← Renewals
        </Link>
        {outcome.status === "ok" ? (
          <RenewalDesk
            auxiliaryFailures={auxiliaryFailures}
            liveReviewHref="/lease-renewal/live"
            partyFilters={partyFilters}
            query={query}
            role={user.role}
            view={outcome.view}
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
