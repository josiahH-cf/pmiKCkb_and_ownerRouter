import { createHash } from "node:crypto";

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
import { buildOperatingSheetDestination } from "@/lib/lease-renewal/desk-destinations";
import {
  buildDeskReturnHref,
  validateDeskView,
} from "@/lib/lease-renewal/desk-view-continuation";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
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

// Renewals-space Editors and up. One live lease's renewal workspace, read-only / draft-only. The email step
// renders the gated live composer; there is no sample email button and no sheet write-back here.
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

  const [progressRead, packetRead, policyRead, communicationsRead, dismissedRead] =
    await Promise.all([
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
    ]);
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
  // S60 (AC-S60-10): the approval re-verify recomputes against the AUTHORITATIVE current rent from
  // the shared live read (a coalesced cache read the workspace loader reuses). Null when the live
  // source is unavailable, which leaves the recompute visibly unclamped rather than guessed.
  const liveConfig = buildLiveRenewalConfig();
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
  // S29: the exact Admin-approved comp-derived rent number (or null). It flows into the owner-draft preview
  // only when an Approved record still matches the current recompute; it is never the raw computed value.
  const [suggestionRead, compScreenshotRead, resolutionsRead] = await Promise.all([
    readRenewalAuxiliary("rent_suggestion", () =>
      getApprovedRentSuggestion(
        user,
        leaseId,
        authoritativeCurrentRent,
        authoritativePortfolioId,
      ),
    ),
    readRenewalAuxiliary("comp_screenshot", () => getRenewalCompScreenshotActionView()),
    readRenewalAuxiliary("resolutions", () => listResolutionsForRun(user, "live-review")),
  ]);
  const approvedSuggestion = renewalAuxiliaryValue(suggestionRead, null);
  const compScreenshotExecutable =
    compScreenshotRead.status === "available"
      ? compScreenshotRead.value.executable
      : false;
  // An unavailable resolution store deliberately projects no resolution while also surfacing the
  // failed state below. It can only keep an item blocked; it can never turn a value verified.
  const resolutions = renewalAuxiliaryValue(resolutionsRead, []);
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
  );
  const [dispositionsRead, writebackProposalRead] = await Promise.all([
    readRenewalAuxiliary("dispositions", () =>
      listRenewalDiscrepancyDispositions(user, leaseId),
    ),
    readRenewalAuxiliary("rentvine_proposal", () =>
      getRenewalWritebackProposal(user, leaseId),
    ),
  ]);
  const dispositions = renewalAuxiliaryValue(dispositionsRead, []);
  const writebackProposal = renewalAuxiliaryValue(writebackProposalRead, null);
  const operatingSheetId = liveOperatingSheetId();
  const sheetWorkspaceContext = mintSheetWorkspaceContext(user.uid, leaseId);
  const sheetProposalRead = operatingSheetId
    ? await readRenewalAuxiliary("sheet_proposal", () =>
        getSheetWritebackProposal(user, operatingSheetId, OPERATING_SHEET_TAB, {
          kind: "lease_workspace",
          leaseId,
        }),
      )
    : unavailableRenewalAuxiliary("sheet_proposal");
  const sheetProposal = renewalAuxiliaryValue(sheetProposalRead, null);
  const sheetEffectsRead = sheetProposal
    ? await readRenewalAuxiliary<SheetWritebackEffectStatus[]>(
        "sheet_effect_status",
        () =>
          loadSheetWritebackEffectStatuses(
            sheetProposal,
            new FirestoreExternalExecutionStore(getAdminFirestore()),
          ),
      )
    : null;
  const sheetEffects = sheetEffectsRead
    ? renewalAuxiliaryValue(sheetEffectsRead, null)
    : null;
  const auxiliaryFailures = renewalAuxiliaryFailures([
    progressRead,
    packetRead,
    policyRead,
    communicationsRead,
    dismissedRead,
    suggestionRead,
    compScreenshotRead,
    resolutionsRead,
    dispositionsRead,
    writebackProposalRead,
    sheetProposalRead,
    ...(sheetEffectsRead ? [sheetEffectsRead] : []),
  ]);

  return (
    <AppShell user={user}>
      <section className="content">
        <Link
          className="back-link renewal-workspace-link"
          href={buildDeskReturnHref(deskView)}
        >
          ← Back to renewals
        </Link>
        {outcome.status === "ok" ? (
          <RenewalWorkspace
            auxiliaryFailures={auxiliaryFailures}
            compScreenshotExecutable={compScreenshotExecutable}
            deskView={deskView}
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
              sheetProposalRead.status === "available" ? (
                <OperatingSheetPanel
                  hasSheetRow={
                    outcome.workspace.dataCheck?.some((item) =>
                      item.candidates.some((candidate) =>
                        /sheet/i.test(candidate.sourceSystem),
                      ),
                    ) ?? false
                  }
                  initialProposal={
                    sheetProposal ? clientSheetWritebackProposal(sheetProposal) : null
                  }
                  initialEffects={sheetEffects}
                  role={user.role}
                  workspaceContext={sheetWorkspaceContext}
                />
              ) : (
                <RenewalAuxiliaryNotice compact failures={[sheetProposalRead]} />
              )
            }
            rentvineUpdatesPanel={
              writebackProposalRead.status === "available" ? (
                <RentvineUpdatesPanel
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
            sheetDestination={buildOperatingSheetDestination(
              process.env.RENEWAL_SHEET_ID,
            )}
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
