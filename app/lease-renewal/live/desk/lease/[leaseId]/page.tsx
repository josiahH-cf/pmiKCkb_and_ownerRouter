import { RenewalDeskReturnLink } from "@/components/lease-renewal/RenewalDeskReturnLink";
import { RenewalCorrections } from "@/components/lease-renewal/RenewalCorrections";
import { getRenewalWorkspace } from "@/lib/firestore/renewal-workspace";
import { createHash } from "node:crypto";
import { getRenewalResourceLocations } from "@/lib/firestore/renewal-resource-locations";
import { RenewalResourceLocations } from "@/components/lease-renewal/RenewalResourceLocations";
import { loadRenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory";

import Link from "next/link";
import { cookies } from "next/headers";

import { AppShell } from "@/components/layout/AppShell";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { DiscrepancyDispositionPanel } from "@/components/lease-renewal/DiscrepancyDispositionPanel";
import { RentvineUpdatesPanel } from "@/components/lease-renewal/RentvineUpdatesPanel";
import {
  OperatingSheetPanel,
  type SheetWritebackEffectStatus,
} from "@/components/lease-renewal/OperatingSheetPanel";
import { RenewalAuxiliaryNotice } from "@/components/lease-renewal/RenewalAuxiliaryNotice";
import { clientSheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/client-projection";
import { getSheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/proposal-store";
import { mintSheetWorkspaceContext } from "@/lib/lease-renewal/sheet-writeback/workspace-context";
import {
  OPERATING_SHEET_TAB,
  liveOperatingSheetId,
} from "@/lib/lease-renewal/sheet-writeback/live";
import { projectWorkspaceAttemptSummary } from "@/lib/lease-renewal/execution/workspace-continuation";
import { loadSheetWritebackEffectStatuses } from "@/lib/lease-renewal/sheet-writeback/status";
import { FirestoreExternalExecutionStore } from "@/lib/firestore/external-action-executions";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { clientRenewalWritebackProposal } from "@/lib/lease-renewal/writeback/client-projection";
import { getRenewalWritebackProposal } from "@/lib/lease-renewal/writeback/proposal-store";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { getRenewalProgress } from "@/lib/firestore/lease-renewal-progress";
import { readNoticeRuleSnapshot } from "@/lib/firestore/lease-renewal-notice-rules";
import { getCurrentPacketSnapshot } from "@/lib/firestore/lease-document-packet-snapshots";
import { getApprovedRentSuggestion } from "@/lib/firestore/lease-renewal-rent-suggestion-approvals";
import { listRenewalDiscrepancyDispositions } from "@/lib/firestore/renewal-discrepancy-dispositions";
import { listResolutionsForRun } from "@/lib/firestore/lease-renewal-resolutions";
import { getLeaseTermReview } from "@/lib/firestore/lease-renewal-term-reviews";
import { LeaseTermReviewControl } from "@/components/lease-renewal/LeaseTermReviewControl";
import { getRenewalCompScreenshotActionView } from "@/lib/lease-renewal/comp-screenshot-action";
import {
  findLeaseViewById,
  leaseCurrentRent,
  leasePortfolioId,
} from "@/lib/integrations/rentvine/lease-mapper";
import { buildLiveRenewalConfig } from "@/lib/lease-renewal/live-config";
import { canonicalJson } from "@/lib/execution/preview-hash";
import {
  getLiveLeaseSnapshot,
  getLiveLeaseSnapshotAtOrAfter,
  type AttemptedLiveLeaseSnapshotResult,
} from "@/lib/lease-renewal/live-lease-cache";
import {
  loadLiveRenewalLeaseWorkspace,
  type LiveDeskStatus,
} from "@/lib/lease-renewal/live-desk";
import { resolveFreshOperatingSheetLeaseContext } from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
import { buildOperatingSheetCellDestination } from "@/lib/lease-renewal/desk-destinations";
import { validateDeskView } from "@/lib/lease-renewal/desk-view-continuation";
import {
  hasRenewalRoleAuthority,
  renewalRoleCapability,
} from "@/lib/lease-renewal/role-action-governance";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { listDismissedRenewalFollowUpKeys } from "@/lib/firestore/lease-renewal-follow-up-attention";
import {
  readRenewalAuxiliary,
  renewalAuxiliaryFailures,
  renewalAuxiliaryValue,
  unavailableRenewalAuxiliary,
} from "@/lib/lease-renewal/auxiliary-read";
import { DEFAULT_NOTICE_RULE_SET } from "@/lib/lease-renewal/notice-rules";
import { buildLiveRenewalReviewItemHref } from "@/lib/lease-renewal/live-review-destination";
import {
  RENEWAL_SOURCE_REFRESH_COOKIE,
  parseRenewalSourceRefreshAfter,
} from "@/lib/lease-renewal/post-write-freshness";

interface LiveLeaseWorkspacePageProps {
  params: Promise<{ leaseId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// One live lease dashboard; each app record, exact source update and unsent draft retains its own authority.
export const dynamic = "force-dynamic";

const PANELS: Record<
  LiveDeskStatus,
  { title: string; body: string; link?: { href: string; label: string } }
> = {
  not_configured: {
    title: "Live sources aren’t connected",
    body: "Connect RentVine and the renewal sheet to open a live lease.",
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

export default async function LiveRenewalLeaseWorkspacePage({
  params,
  searchParams,
}: LiveLeaseWorkspacePageProps) {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability(renewalRoleCapability("read_workspace"));
  const { leaseId } = await params;
  const search = (await searchParams) ?? {};
  const stepParam = Array.isArray(search.step) ? search.step[0] : search.step;
  const rawDeskView = Array.isArray(search.deskView)
    ? search.deskView[0]
    : search.deskView;
  // S82: an invalid/oversized/noncanonical continuation falls back to the default desk; it can never
  // become an open redirect or partially restore a different view.
  const deskView = validateDeskView(rawDeskView);

  const liveConfig = buildLiveRenewalConfig();
  const operatingSheetId = liveOperatingSheetId();
  const sheetWorkspaceContext = mintSheetWorkspaceContext(user.uid, leaseId);
  // Start the complete fresh field rebuild now, but await it only after the independent
  // dashboard projection. Preview/confirmation never reuse this display read.
  const sheetFieldsReadPromise = liveConfig.ok
    ? readRenewalAuxiliary("sheet_fields", () =>
        resolveFreshOperatingSheetLeaseContext(leaseId),
      )
    : Promise.resolve(unavailableRenewalAuxiliary("sheet_fields"));
  // Independent genuine reads start after both access guards, alongside the lease snapshot.
  // Every result retains its typed failure; there is no cache or provider effect on navigation.
  const supportingReads = Promise.all([
    readRenewalAuxiliary("progress", () => getRenewalProgress(user, leaseId)),
    readRenewalAuxiliary("packet", () =>
      getCurrentPacketSnapshot(user, leaseId, leaseId),
    ),
    readRenewalAuxiliary("notice_policy", () => readNoticeRuleSnapshot()),
    readRenewalAuxiliary("communications", () =>
      createGmailHubService(user).listCommunications(),
    ),
    readRenewalAuxiliary("dismissed_attention", () =>
      listDismissedRenewalFollowUpKeys(user),
    ),
    readRenewalAuxiliary("manual_workspace", () => getRenewalWorkspace(user, leaseId)),
    readRenewalAuxiliary("comp_screenshot", () => getRenewalCompScreenshotActionView()),
    readRenewalAuxiliary("resolutions", () => listResolutionsForRun(user, "live-review")),
    readRenewalAuxiliary("term_reviews", () => getLeaseTermReview(user, leaseId)),
    readRenewalAuxiliary("dispositions", () =>
      listRenewalDiscrepancyDispositions(user, leaseId),
    ),
    readRenewalAuxiliary("rentvine_proposal", () =>
      getRenewalWritebackProposal(user, leaseId),
    ),
    liveConfig.ok
      ? readRenewalAuxiliary("recurring_charges", () =>
          loadRenewalChargeInventory(liveConfig.rentvineClient, leaseId),
        )
      : Promise.resolve(unavailableRenewalAuxiliary("recurring_charges")),
    readRenewalAuxiliary("resource_locations", () => getRenewalResourceLocations(user)),
    operatingSheetId
      ? readRenewalAuxiliary("sheet_proposal", () =>
          getSheetWritebackProposal(user, operatingSheetId, OPERATING_SHEET_TAB, {
            kind: "lease_workspace",
            leaseId,
          }),
        )
      : Promise.resolve(unavailableRenewalAuxiliary("sheet_proposal")),
  ]);
  // The current source attempt and post-write freshness floor remain authoritative for
  // rent-suggestion verification and the workspace projection, including a typed failed attempt.
  const readTimestamp = new Date().toISOString();
  const readTimestampMs = Date.parse(readTimestamp);
  const sourceRefreshAfter = parseRenewalSourceRefreshAfter(
    (await cookies()).get(RENEWAL_SOURCE_REFRESH_COOKIE)?.value,
    readTimestampMs,
  );
  let authoritativeCurrentRent: number | null = null;
  let authoritativePortfolioId: string | null = null;
  let leaseSnapshotAttempt: AttemptedLiveLeaseSnapshotResult | undefined;
  if (liveConfig.ok) {
    try {
      const leaseSnapshotResult =
        sourceRefreshAfter === null
          ? await getLiveLeaseSnapshot(liveConfig.rentvineClient, readTimestampMs)
          : await getLiveLeaseSnapshotAtOrAfter(
              liveConfig.rentvineClient,
              readTimestampMs,
              sourceRefreshAfter,
            );
      leaseSnapshotAttempt = { status: "available", value: leaseSnapshotResult };
      const { snapshot } = leaseSnapshotResult;
      const views = snapshot.views;
      const view = findLeaseViewById(views, leaseId);
      authoritativeCurrentRent = view ? (leaseCurrentRent(view) ?? null) : null;
      authoritativePortfolioId = view ? (leasePortfolioId(view) ?? null) : null;
    } catch {
      authoritativeCurrentRent = null;
      leaseSnapshotAttempt = { status: "unavailable" };
    }
  }
  const [
    progressRead,
    packetRead,
    policyRead,
    communicationsRead,
    dismissedRead,
    manualRead,
    compScreenshotRead,
    resolutionsRead,
    termReviewRead,
    dispositionsRead,
    writebackProposalRead,
    chargeInventoryRead,
    resourceLocationsRead,
    sheetProposalRead,
  ] = await supportingReads;
  const progress = renewalAuxiliaryValue(progressRead, null);
  const packetSnapshot = packetRead.status === "available" ? packetRead.value : undefined;
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
  // Only an approval verified against this exact authoritative rent and portfolio is projected.
  const suggestionRead = await readRenewalAuxiliary("rent_suggestion", () =>
    getApprovedRentSuggestion(
      user,
      leaseId,
      authoritativeCurrentRent,
      authoritativePortfolioId,
    ),
  );
  const approvedSuggestion = renewalAuxiliaryValue(suggestionRead, null);
  const compScreenshotExecutable =
    compScreenshotRead.status === "available"
      ? compScreenshotRead.value.executable
      : false;
  const resolutions = renewalAuxiliaryValue(resolutionsRead, []);
  const termReview = renewalAuxiliaryValue(termReviewRead, null);
  const outcome = await loadLiveRenewalLeaseWorkspace(
    leaseId,
    readTimestamp,
    liveConfig,
    progress,
    approvedSuggestion,
    resolutions,
    packetSnapshot,
    {
      communicationState: communications.state,
      links: communications.links,
      policy,
      dismissedAttentionKeys,
    },
    sourceRefreshAfter,
    leaseSnapshotAttempt,
    termReview,
    renewalAuxiliaryValue(manualRead, null),
  );
  const dispositions = renewalAuxiliaryValue(dispositionsRead, []);
  const writebackProposal = renewalAuxiliaryValue(writebackProposalRead, null);
  const sheetProposal = renewalAuxiliaryValue(sheetProposalRead, null);
  // These reads depend on the heads above, but do not depend on each other. Page loading never
  // reconciles an attempt or changes a receipt; corrections keep their separate confirmation.
  const [sheetEffectsRead, attemptSummaryRead, preparedSheetFieldsRead] =
    await Promise.all([
      sheetProposal
        ? readRenewalAuxiliary<SheetWritebackEffectStatus[]>("sheet_effect_status", () =>
            loadSheetWritebackEffectStatuses(
              sheetProposal,
              new FirestoreExternalExecutionStore(getAdminFirestore()),
            ),
          )
        : Promise.resolve(null),
      readRenewalAuxiliary("attempt_summary", () =>
        projectWorkspaceAttemptSummary({
          leaseId,
          rentvineProposal: writebackProposal,
          sheetProposal,
          store: new FirestoreExternalExecutionStore(getAdminFirestore()),
        }),
      ),
      sheetFieldsReadPromise,
    ]);
  const sheetEffects = sheetEffectsRead
    ? renewalAuxiliaryValue(sheetEffectsRead, null)
    : null;
  const attemptSummary = renewalAuxiliaryValue(attemptSummaryRead, null);
  const sheetFieldsRead =
    outcome.status === "ok"
      ? preparedSheetFieldsRead
      : unavailableRenewalAuxiliary("sheet_fields");
  const sheetFields = renewalAuxiliaryValue(sheetFieldsRead, null);
  const sheetDestination = buildOperatingSheetCellDestination({
    spreadsheetId: process.env.RENEWAL_SHEET_ID,
    tabId: sheetFields?.tabId,
    rowNumber: sheetFields?.row?.rowNumber,
  });
  const auxiliaryFailures = renewalAuxiliaryFailures([
    manualRead,
    progressRead,
    packetRead,
    policyRead,
    communicationsRead,
    dismissedRead,
    suggestionRead,
    compScreenshotRead,
    resolutionsRead,
    termReviewRead,
    dispositionsRead,
    writebackProposalRead,
    chargeInventoryRead,
    resourceLocationsRead,
    sheetProposalRead,
    sheetFieldsRead,
    attemptSummaryRead,
    ...(sheetEffectsRead ? [sheetEffectsRead] : []),
  ]);

  return (
    <AppShell user={user}>
      <section className="content">
        <RenewalDeskReturnLink deskView={deskView} />
        {outcome.status === "ok" ? (
          <RenewalWorkspace
            attemptSummary={attemptSummary}
            auxiliaryFailures={auxiliaryFailures}
            manualState={manualRead.status === "available" ? manualRead.value : undefined}
            manualReadUnavailable={manualRead.status !== "available"}
            manualCycleBasis={
              outcome.workspace.summary.endDateIso
                ? {
                    kind: "lease_end",
                    dateIso: outcome.workspace.summary.endDateIso,
                    source: "RentVine lease end",
                  }
                : null
            }
            compScreenshotExecutable={compScreenshotExecutable}
            deskView={deskView}
            correctionPanel={
              <RenewalCorrections
                dispositions={dispositions}
                leaseId={leaseId}
                role={user.role}
                dataCheck={outcome.workspace.dataCheck}
                sheetValues={sheetFields?.row?.fieldValues ?? null}
                workspaceContext={sheetWorkspaceContext}
                inventory={renewalAuxiliaryValue(chargeInventoryRead, null)}
                sheetPreviewHash={sheetProposal?.previewHash ?? null}
                rentvinePreviewHash={writebackProposal?.previewHash ?? null}
                reviewHref={(() => {
                  const key = outcome.workspace.dataCheck.find(
                    (entry) => entry.fieldKey === "current_rent",
                  )?.sourceTriggerKey;
                  return key ? buildLiveRenewalReviewItemHref(key) : null;
                })()}
              />
            }
            discrepancyPanel={
              dispositionsRead.status === "available" ? (
                <DiscrepancyDispositionPanel
                  initialDispositions={dispositions}
                  leaseId={leaseId}
                  ownerUid={user.uid}
                  sourceHash={createHash("sha256")
                    .update(
                      canonicalJson({
                        lease_id: leaseId,
                        read_at:
                          outcome.workspace.dataCurrency?.readAtIso ?? readTimestamp,
                        data_check: outcome.workspace.dataCheck,
                      }),
                    )
                    .digest("hex")}
                />
              ) : (
                <RenewalAuxiliaryNotice compact failures={[dispositionsRead]} />
              )
            }
            packetSnapshot={packetSnapshot ?? null}
            operatingSheetPanel={
              sheetProposalRead.status === "available" &&
              sheetFieldsRead.status === "available" ? (
                <OperatingSheetPanel
                  key={sheetProposal?.previewHash ?? "no-sheet-preview"}
                  hasSheetRow={
                    sheetFields?.row !== null && sheetFields?.row !== undefined
                  }
                  initialFieldValues={sheetFields?.row?.fieldValues}
                  initialProposal={
                    sheetProposal ? clientSheetWritebackProposal(sheetProposal) : null
                  }
                  initialEffects={sheetEffects}
                  role={user.role}
                  workspaceContext={sheetWorkspaceContext}
                />
              ) : (
                <RenewalAuxiliaryNotice
                  compact
                  failures={renewalAuxiliaryFailures([
                    sheetProposalRead,
                    sheetFieldsRead,
                  ])}
                />
              )
            }
            resourceLocationsPanel={
              <RenewalResourceLocations
                role={user.role}
                initialSettings={renewalAuxiliaryValue(resourceLocationsRead, null)}
              />
            }
            rentvineUpdatesPanel={
              writebackProposalRead.status === "available" ? (
                <RentvineUpdatesPanel
                  key={writebackProposal?.previewHash ?? "no-rentvine-preview"}
                  initialInventory={renewalAuxiliaryValue(chargeInventoryRead, null)}
                  initialProposal={
                    writebackProposal
                      ? clientRenewalWritebackProposal(writebackProposal)
                      : null
                  }
                  leaseId={leaseId}
                  role={user.role}
                />
              ) : (
                <RenewalAuxiliaryNotice compact failures={[writebackProposalRead]} />
              )
            }
            role={user.role}
            resolutionDestinations={outcome.workspace.dataCheck.flatMap((item) => {
              const href = item.sourceTriggerKey
                ? buildLiveRenewalReviewItemHref(item.sourceTriggerKey)
                : null;
              return href && item.agreement !== "agree"
                ? [{ fieldKey: item.fieldKey, href }]
                : [];
            })}
            selectedStepId={stepParam}
            sheetDestination={sheetDestination}
            sheetFieldDestinations={Object.fromEntries(
              [...(sheetFields?.columns ?? [])].flatMap(([field, columnIndex]) => {
                const destination = buildOperatingSheetCellDestination({
                  spreadsheetId: process.env.RENEWAL_SHEET_ID,
                  tabId: sheetFields?.tabId,
                  rowNumber: sheetFields?.row?.rowNumber,
                  columnIndex,
                });
                return destination ? [[field, destination.href]] : [];
              }),
            )}
            termReviewPanel={
              termReviewRead.status === "available" ? (
                <LeaseTermReviewControl
                  canEdit={hasRenewalRoleAuthority("record_term_review", user.role)}
                  leaseId={leaseId}
                  recordedTerm={termReview?.term ?? null}
                  term={outcome.workspace.summary.leaseTerm}
                />
              ) : (
                <RenewalAuxiliaryNotice compact failures={[termReviewRead]} />
              )
            }
            workspace={outcome.workspace}
          />
        ) : outcome.status === "not_found" ? (
          <article className="panel">
            <p className="muted">This live renewal is unavailable.</p>
          </article>
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
          <Link
            className="secondary-button renewal-workspace-link"
            href={panel.link.href}
          >
            {panel.link.label}
          </Link>
        </p>
      ) : null}
    </article>
  );
}
