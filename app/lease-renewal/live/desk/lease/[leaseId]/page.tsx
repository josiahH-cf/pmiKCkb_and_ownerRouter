import { getRenewalCycleDisposition } from "@/lib/firestore/renewal-cycle-disposition-read";
import { leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import type {
  RemainingDifferencesInputs,
  SourceUpdateTermsBasisInputs,
} from "@/components/lease-renewal/useLiveSourceUpdateBasis";
import { getPacketInputs } from "@/lib/firestore/lease-packet-inputs";
import { readChargePolicy } from "@/lib/firestore/lease-charge-policy";
import { packetEconomics } from "@/lib/lease-documents/owner-approval-binding";
import { readAcceptedTenantOffer } from "@/lib/firestore/renewal-offer-answers";
import { offerChargeSource } from "@/lib/lease-renewal/offer-snapshot";
import { readTenantAcceptanceCheck } from "@/lib/lease-renewal/tenant-offer-composition";
import { offerPacketComparisons } from "@/lib/lease-renewal/offer-packet-parity";
import { ownerRosterFingerprint } from "@/lib/firestore/renewal-workspace";
import { projectRenewalDeskIdentity } from "@/lib/lease-renewal/desk-identity";
import { listLeaseOwnerReplies } from "@/lib/gmail-hub/sequence-store";
import { listOwnerAnswerChoices } from "@/lib/gmail-hub/owner-answer-choices";
import { readLeaseOutreachEvidence } from "@/lib/firestore/renewal-outreach-records";
import { UNREADABLE_OUTREACH_EVIDENCE_INPUT } from "@/lib/lease-renewal/outreach-evidence";
import { withLeaseCurrentMessageBases } from "@/lib/lease-renewal/unsent-message-read";
import { readKickoffSupport } from "@/lib/lease-renewal/kickoff-support";
import {
  UNREAD_KICKOFF_SUPPORT,
  currentRentChargeAmounts,
} from "@/lib/lease-renewal/kickoff-facts";
import type { OwnerApprovalChoices } from "@/lib/lease-renewal/owner-approval-evidence";
import { readRenewalPricingForViews } from "@/lib/lease-renewal/pricing-policy-read";
import { RenewalDeskReturnLink } from "@/components/lease-renewal/RenewalDeskReturnLink";
import { withRenewalNoticeAdmission } from "@/lib/firestore/renewal-notice-safety";
import { renewalNoticeObserver } from "@/lib/lease-renewal/notice-read";
import { RenewalCorrections } from "@/components/lease-renewal/RenewalCorrections";
import { getRenewalWorkspace } from "@/lib/firestore/renewal-workspace";
import {
  getRenewalWorkStatus,
  listRenewalWorkStatusActivity,
} from "@/lib/firestore/renewal-work-status";
import { getRenewalWorkingRecord } from "@/lib/firestore/renewal-working-record";
import { listRenewalStatusNotes } from "@/lib/firestore/renewal-status-notes";
import { sheetRowBindingsFromWorkingRecords } from "@/lib/lease-renewal/sheet-lookup";
import { createHash } from "node:crypto";
import { getRenewalResourceLocations } from "@/lib/firestore/renewal-resource-locations";
import { RenewalResourceLinksSummary } from "@/components/lease-renewal/RenewalResourceLinksSummary";
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
import { isOperatingSheetWritebackPaused } from "@/lib/lease-renewal/sheet-writeback-policy";
import { getSheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/proposal-store";
import { mintSheetWorkspaceContext } from "@/lib/lease-renewal/sheet-writeback/workspace-context";
import {
  OPERATING_SHEET_TAB,
  liveOperatingSheetId,
} from "@/lib/lease-renewal/sheet-writeback/live";
import { loadWorkspaceAttemptState } from "@/lib/lease-renewal/execution/workspace-continuation";
import { projectRentChargeOutcomes } from "@/lib/lease-renewal/rent-charge-outcomes";
import { projectCurrentBaseReadback } from "@/lib/lease-renewal/writeback/current-base-readback";
import { futureRentTermsCurrent } from "@/lib/lease-renewal/writeback/future-rent-intent";
import { effectiveRenewalTerms } from "@/lib/lease-renewal/effective-terms";
import { assembleFinishUpPreparation } from "@/lib/lease-renewal/finish-up-preparation";
import { loadSheetWritebackEffectStatuses } from "@/lib/lease-renewal/sheet-writeback/status";
import { FirestoreExternalExecutionStore } from "@/lib/firestore/external-action-executions";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { clientRenewalWritebackProposal } from "@/lib/lease-renewal/writeback/client-projection";
import { getRenewalWritebackProposal } from "@/lib/lease-renewal/writeback/proposal-store";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { getRenewalProgress } from "@/lib/firestore/lease-renewal-progress";
import { readNoticeRuleSnapshot } from "@/lib/firestore/lease-renewal-notice-rules";
import { readMoveOutTimingBasisSnapshot } from "@/lib/firestore/lease-renewal-move-out-timing-basis";
import { readPolicyMaterialSnapshot } from "@/lib/firestore/lease-renewal-policy-material";
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
import {
  projectMarketSubject,
  type MarketSubjectProjection,
} from "@/lib/lease-renewal/market-subject";
import { canonicalJson } from "@/lib/execution/preview-hash";
import { type AttemptedLiveLeaseSnapshotResult } from "@/lib/lease-renewal/live-lease-cache";
import { readCoherentRenewalDisplaySource } from "@/lib/lease-renewal/admitted-notice-source";
import type { LeaseStatusTableRead } from "@/lib/lease-renewal/move-out-disposition";
import {
  loadLiveRenewalLeaseWorkspace,
  type LiveDeskStatus,
} from "@/lib/lease-renewal/live-desk";
import { resolveFreshOperatingSheetLeaseContext } from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
import { audienceEmailRoster } from "@/lib/lease-renewal/sheet-writeback/audience-emails";
import {
  operatingSheetLookupCurrent,
  sheetFieldCells,
} from "@/lib/lease-renewal/sheet-writeback/lookup-target";
import { buildOperatingSheetCellDestination } from "@/lib/lease-renewal/desk-destinations";
import { validateDeskContinuation } from "@/lib/lease-renewal/desk-view-continuation";
import { getRenewalCycleDateDecision } from "@/lib/firestore/renewal-cycle-date-decisions";
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
import { withReadDeadline } from "@/lib/observability/read-lifetime";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import { readArtifactIntakeManifest } from "@/lib/firestore/lease-artifact-intake";
import { readFamilyUseRecord } from "@/lib/firestore/lease-artifact-family-use";
import { resolveFamilyUse } from "@/lib/lease-documents/family-use";
import {
  projectLeasePacketReadiness,
  projectPacketContextReadiness,
  projectPacketLead,
  safePacketReadFailure,
} from "@/lib/lease-documents/lease-packet-readiness";
import { PacketNextStep } from "@/components/lease-renewal/PacketNextStep";
import { resolveDisplayedPacketInput } from "@/lib/lease-documents/live-input";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { LeasePacketReadiness } from "@/components/lease-renewal/LeasePacketReadiness";
import { ReturnedDocumentsPanel } from "@/components/lease-renewal/ReturnedDocumentsPanel";
import { resolveReturnedState } from "@/lib/lease-documents/returned-state-service";
import { readSelectionFreshness } from "@/lib/lease-documents/packet-selection-freshness-read";
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
  // S247: a view chosen by hand lasts for the visit through this key; Guided view otherwise.
  const viewParam = Array.isArray(search.view) ? search.view[0] : search.view;
  const rawDeskView = Array.isArray(search.deskView)
    ? search.deskView[0]
    : search.deskView;
  // S82: an invalid/oversized/noncanonical continuation falls back to the default desk; it can never
  // become an open redirect or partially restore a different view. S246: the continuation is a
  // table view or the working batch (its month and open group) the lease was opened from.
  const deskView = validateDeskContinuation(rawDeskView);

  const liveConfig = buildLiveRenewalConfig();
  if (liveConfig.ok)
    liveConfig.rentvineClient = withRenewalNoticeAdmission(
      user,
      liveConfig.rentvineClient,
    );
  const operatingSheetId = liveOperatingSheetId();
  const sheetWorkspaceContext = mintSheetWorkspaceContext(user.uid, leaseId);
  // Start the complete fresh field rebuild now, but await it only after the independent
  // dashboard projection. Preview/confirmation never reuse this display read.
  const sheetFieldsReadPromise = liveConfig.ok
    ? readRenewalAuxiliary("sheet_fields", () =>
        resolveFreshOperatingSheetLeaseContext(leaseId),
      )
    : Promise.resolve(unavailableRenewalAuxiliary("sheet_fields"));
  // S157: the lease-bound working record. Its own read, so a failure affects only working values.
  const workingRecordReadPromise = readRenewalAuxiliary("working_record", () =>
    getRenewalWorkingRecord(user, leaseId),
  );
  // S246 R-S246-5: this lease's keep-working choice, so the lease page carries the same renewal
  // target verdict as the desk. It is independent of every other read, so it starts here with the
  // same bounded wait as the page's other optional reads; an unreadable or late choice counts as
  // none and never holds the page.
  const cycleDateDecisionPromise = withReadDeadline(() =>
    getRenewalCycleDateDecision(user, leaseId),
  ).catch(() => null);
  // S248: this lease's linked renewal messages, outreach records and Gmail drafts, read-only and
  // with the same bounded wait.
  const outreachEvidencePromise = withReadDeadline(() =>
    readLeaseOutreachEvidence(leaseId),
  )
    // S273 R-S273-2: for a scheduled or held message, the lease's current values, so the step
    // shows it out of date on this read, before any worker run. A late or failed read adds nothing.
    .then((evidence) => withLeaseCurrentMessageBases(user, leaseId, evidence))
    .catch(() => null);
  // S249: the same preparation read the desk makes, for this one lease, with the same wait.
  const kickoffSupportPromise = withReadDeadline(() =>
    readKickoffSupport(user, [leaseId]),
  ).catch(() => UNREAD_KICKOFF_SUPPORT);
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
    // S119: the saved staff work status and its history. An unavailable read renders as
    // unavailable, never as Not recorded, and disables saving until it is re-read.
    readRenewalAuxiliary("work_status", async () => {
      // S164: the notes ride on the same read; a failed notes read leaves the control to read
      // them itself, and never hides the status.
      const [record, history, notes] = await Promise.all([
        getRenewalWorkStatus(user, leaseId),
        listRenewalWorkStatusActivity(user, leaseId),
        listRenewalStatusNotes(user, leaseId).catch(() => undefined),
      ]);
      return { record, history, notes };
    }),
    // S125: the reviewed notice timing basis (this read never throws).
    readMoveOutTimingBasisSnapshot(),
    // S131: the policy material snapshot (this read never throws).
    readPolicyMaterialSnapshot("rhino"),
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
  // S118: the comparison subject (address, unit attributes, contractual base rent) resolved once
  // from the same live view the lookup would use; an unresolved subject keeps its exact cause.
  let marketSubject: MarketSubjectProjection = projectMarketSubject(null, leaseId);
  let leaseSnapshotAttempt: AttemptedLiveLeaseSnapshotResult | undefined;
  let preparedNoticeStatusTable: LeaseStatusTableRead | undefined;
  if (liveConfig.ok) {
    try {
      const leaseSnapshotResult = await readCoherentRenewalDisplaySource(
        user,
        liveConfig.rentvineClient,
        readTimestampMs,
        { sourceRefreshAfter, leaseId },
      );
      preparedNoticeStatusTable = leaseSnapshotResult.statusTable;
      leaseSnapshotAttempt = { status: "available", value: leaseSnapshotResult };
      const { snapshot } = leaseSnapshotResult;
      const views = snapshot.views;
      const view = findLeaseViewById(views, leaseId);
      authoritativeCurrentRent = view ? (leaseCurrentRent(view) ?? null) : null;
      authoritativePortfolioId = view ? (leasePortfolioId(view) ?? null) : null;
      marketSubject = projectMarketSubject(view, leaseId);
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
    workStatusRead,
    timingBasis,
    policyMaterial,
  ] = await supportingReads;
  const progress = renewalAuxiliaryValue(progressRead, null);
  const packetSnapshot = packetRead.status === "available" ? packetRead.value : undefined;
  // S235 R-S235-1 / R-S235-8: read-only per-family readiness. The manifest and family-use reads
  // report unreadable instead of throwing; the current packet read keeps its safe failure reason.
  const [artifactManifest, familyUseRead, currentPacketRead] = await Promise.all([
    readArtifactIntakeManifest(),
    readFamilyUseRecord(),
    leaseSnapshotAttempt?.status === "available"
      ? resolveDisplayedPacketInput(
          user,
          leaseId,
          leaseId,
          readTimestamp,
          leaseSnapshotAttempt.value.snapshot.views,
        ).then(
          (resolved) => ({ state: "read" as const, input: resolved.input }),
          (error: unknown) => ({
            state: "failed" as const,
            reason: safePacketReadFailure(error),
          }),
        )
      : Promise.resolve({
          state: "failed" as const,
          reason: "The current lease source was not available for this render.",
        }),
  ]);
  const currentFamilyUse = resolveFamilyUse(familyUseRead.record, readTimestamp);
  // This display-only evaluation uses current private facts and this render's already-read source,
  // evaluated exactly as an effect would evaluate it: the resolved catalog is not reshaped here. It
  // neither saves a packet nor weakens the independent fresh-source admission of an effect.
  const currentPacketEvaluation =
    currentPacketRead.state === "read"
      ? evaluateRenewalPacket(currentPacketRead.input)
      : null;
  // S237 R-S237-1 / S264 R-S264-6: the packet inputs and the published charge policy, read once
  // for the terms basis below and for the accepted offer's packet parity.
  const [basisInputs, basisPolicy] = await Promise.all([
    getPacketInputs(user, leaseId).then(
      (record) => ({ readable: true as const, record }),
      () => ({ readable: false as const, record: null }),
    ),
    readChargePolicy(),
  ]);
  const basisEconomics =
    basisInputs.readable && basisPolicy.readable
      ? packetEconomics(leaseId, basisInputs.record, basisPolicy.record)
      : null;
  // S264 R-S264-6: a form whose packet carries a shared charge is compared with the exact offer
  // the tenant's recorded acceptance answers; a difference holds that form alone.
  const acceptedOffer = await readAcceptedTenantOffer(
    getAdminFirestore(),
    renewalAuxiliaryValue(manualRead, null),
  ).catch(() => null);
  const offerComparisons = offerPacketComparisons({
    manifest: artifactManifest,
    economics: basisEconomics?.calculated ?? null,
    accepted: acceptedOffer?.snapshot ?? null,
  });
  const packetFamilyRows = projectLeasePacketReadiness({
    manifest: artifactManifest,
    evaluation: currentPacketEvaluation,
    familyUse: {
      readable: familyUseRead.readable,
      families: currentFamilyUse,
    },
    offerComparisons,
  });
  const packetContextReadiness = projectPacketContextReadiness({
    evaluation: currentPacketEvaluation,
    observedAt: currentPacketRead.state === "read" ? readTimestamp : null,
    savedSnapshot: packetSnapshot ?? null,
    readFailure: currentPacketRead.state === "failed" ? currentPacketRead.reason : null,
  });
  // S236: returned documents and who still must sign, from staff records. A failed read shows as
  // unreadable, never as nothing recorded.
  const returnedStateView = await resolveReturnedState(user, leaseId)
    .then(({ view }) => view)
    .catch(() => null);
  // S268 R-S268-1 / R-S268-3: what Documents and signatures leads with, from the reads above.
  const packetLead = projectPacketLead({
    rows: packetFamilyRows,
    context: packetContextReadiness,
    returned: returnedStateView,
  });
  // S235 R-S235-6: the saved Dotloop selection and its last observation (this read never throws).
  const selectionFreshness = await readSelectionFreshness(user, readTimestamp);
  // S234 R-S234-1: an approval names an owner of record from this source read, or a named
  // representative, and may cite a reply from this lease's own owner thread. The server checks
  // both again when the approval is recorded; an unreadable roster records nothing.
  const ownerViews =
    leaseSnapshotAttempt?.status === "available"
      ? leaseSnapshotAttempt.value.snapshot.views.filter(
          (v) => leaseViewId(v) === leaseId,
        )
      : [];
  const ownerParties =
    ownerViews.length === 1 ? projectRenewalDeskIdentity(ownerViews[0]).owners : null;
  const ownerRoster = ownerParties
    ? ownerParties.map(({ label, sourceRef }) => ({ label, sourceRef }))
    : null;
  // S285 R-S285-4 / R-S285-5 (ARCH-S285-3): the replies, each with the one roster owner it came
  // from when that is certain, and the term the cycle's latest confirmed owner message stated. The
  // match is made here on the server; only the roster entry reaches the page, never an address.
  const ownerAnswerChoices = await listOwnerAnswerChoices({
    leaseId,
    cycleId: renewalAuxiliaryValue(manualRead, null)?.cycleId ?? null,
    roster: ownerParties
      ? ownerParties.map(({ label, sourceRef, email }) => ({
          label,
          sourceRef,
          email: email?.label ?? null,
        }))
      : null,
  }).catch(async () => ({
    replies: await listLeaseOwnerReplies(leaseId).catch(() => []),
    ownerMessageTerm: null,
  }));
  const ownerApprovalChoices: OwnerApprovalChoices = {
    roster: ownerRoster,
    replies: ownerAnswerChoices.replies,
    // PR #162 review: an owner choice is sent back with the roster it was made from.
    rosterFingerprint: ownerRoster ? ownerRosterFingerprint(ownerRoster) : null,
    ownerMessageTerm: ownerAnswerChoices.ownerMessageTerm,
  };
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
  const workingRecordRead = await workingRecordReadPromise;
  const cycleDateDecision = await cycleDateDecisionPromise;
  const pricingRead = await readRenewalAuxiliary("pricing_policy", async () => {
    if (leaseSnapshotAttempt?.status !== "available")
      throw new Error("Source unavailable");
    return readRenewalPricingForViews(
      user,
      leaseSnapshotAttempt.value.snapshot.views.filter((v) => leaseViewId(v) === leaseId),
      new Date(readTimestamp),
    );
  });
  const cycleDispositionRead = getRenewalCycleDisposition(leaseId).catch(() => undefined);
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
    {
      available: workStatusRead.status === "available",
      record: workStatusRead.status === "available" ? workStatusRead.value.record : null,
      cyclesAvailable: manualRead.status === "available",
    },
    timingBasis,
    renewalNoticeObserver(user),
    preparedNoticeStatusTable,
    sheetRowBindingsFromWorkingRecords(
      [renewalAuxiliaryValue(workingRecordRead, null)].filter(
        (record): record is NonNullable<typeof record> => record !== null,
      ),
    ),
    renewalAuxiliaryValue(workingRecordRead, null),
    pricingRead.status === "available" ? pricingRead.value : undefined,
    cycleDateDecision,
    // S248: unreadable evidence derives nothing; the stage then reads the staff record alone.
    (await outreachEvidencePromise) ?? UNREADABLE_OUTREACH_EVIDENCE_INPUT,
    {
      support: await kickoffSupportPromise,
      rentCharges: currentRentChargeAmounts(
        renewalAuxiliaryValue(chargeInventoryRead, null),
      ),
    },
    {
      saved: await cycleDispositionRead,
      workspaceAvailable: manualRead.status === "available",
    },
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
        loadWorkspaceAttemptState({
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
  const attemptState = renewalAuxiliaryValue(attemptSummaryRead, null);
  const attemptSummary = attemptState?.summary ?? null;
  const attempts = attemptState?.attempts ?? [];
  const manualState = renewalAuxiliaryValue(manualRead, null);
  const chargeInventory = renewalAuxiliaryValue(chargeInventoryRead, null);
  // S264 R-S264-6: whether the tenant's recorded acceptance covers the current offer's charges,
  // composed from this render's RentVine charge read and the app's records (no further provider
  // read). Null unless the work record holds a current acceptance; never throws.
  const tenantAcceptance =
    manualRead.status === "available"
      ? await readTenantAcceptanceCheck({
          actor: user,
          leaseId,
          db: getAdminFirestore(),
          workspace: manualState,
          working: renewalAuxiliaryValue(workingRecordRead, null),
          ...(chargeInventory ? { source: offerChargeSource(chargeInventory) } : {}),
        }).catch(() => null)
      : null;
  // S237 R-S237-1: the terms basis beside every RentVine and Sheet preview, recomputed on each
  // render: Working terms, the recorded approval's coverage and the executed documents. It is shown
  // only; no effect, hash or admission reads it.
  const currentEconomicsHash = basisEconomics?.hash ?? null;
  // PR #163 review: the panels recompute the basis from the live Working and staff records; these
  // server reads are what it is computed from and its fallback.
  const sourceUpdateTermsBasisInputs: SourceUpdateTermsBasisInputs = {
    working: renewalAuxiliaryValue(workingRecordRead, null),
    workspace: manualState,
    economicsHash: currentEconomicsHash,
    returned: returnedStateView
      ? {
          unavailable: returnedStateView.unavailable,
          signaturesComplete: returnedStateView.signaturesComplete,
          overall: returnedStateView.overall,
          packetTermsCurrent: returnedStateView.packetTermsCurrent,
          packetTermsBasis: returnedStateView.packetTermsBasis,
        }
      : null,
  };
  // S117 (R117.4): the refreshed base rent is compared with a succeeded current-base charge
  // update; the charge amount and lease total are never substituted for it.
  const currentBaseReadback = projectCurrentBaseReadback({
    proposal: writebackProposal,
    attempts,
    currentRent: outcome.status === "ok" ? outcome.workspace.summary.currentRent : null,
  });
  const rentChargeStatus = projectRentChargeOutcomes({
    manualState,
    rentvineProposal: writebackProposal,
    attempts,
    sheetProposal,
    sheetEffects,
    currentBaseReadback,
    nowMs: readTimestampMs,
  });
  const futureReady =
    writebackProposal?.businessIntent === "future_rent" && writebackProposal.renewalTerms
      ? futureRentTermsCurrent(
          effectiveRenewalTerms(renewalAuxiliaryValue(workingRecordRead, null)),
          writebackProposal.renewalTerms,
        )
      : null;
  const sourceUpdateIdentity =
    outcome.status === "ok"
      ? { addressLabel: outcome.workspace.summary.addressLabel, leaseId }
      : null;
  const sheetFieldsRead =
    outcome.status === "ok"
      ? preparedSheetFieldsRead
      : unavailableRenewalAuxiliary("sheet_fields");
  const sheetFields = renewalAuxiliaryValue(sheetFieldsRead, null);
  // S249 R-S249-14 / L42: Finish up's RentVine and Sheet update previews, assembled from the final
  // working terms and the reads above. Assembly only: nothing is saved or written here; each
  // update is applied through its existing control with its own confirmation.
  const finishUpPreparation =
    outcome.status === "ok"
      ? assembleFinishUpPreparation({
          leaseId,
          terms: effectiveRenewalTerms(renewalAuxiliaryValue(workingRecordRead, null)),
          inventory: chargeInventory,
          sheet: sheetFieldsRead.status === "available" ? sheetFields : null,
          identity: sourceUpdateIdentity,
          readAtIso: readTimestamp,
          acceptance: tenantAcceptance,
        })
      : null;
  // S237 R-S237-5: what still differs, from this render's own RentVine and Sheet reads.
  const datesIntent = writebackProposal?.effects
    .flatMap((entry) =>
      entry.effect.kind === "renewal_dates_update" ? [entry.effect.after] : [],
    )
    .map((after) => after.increaseEligibilityDate)
    .find((value) => value !== undefined);
  const remainingDifferencesInputs: RemainingDifferencesInputs = {
    working: renewalAuxiliaryValue(workingRecordRead, null),
    workspace: manualState,
    ...(datesIntent !== undefined ? { increaseEligibilityIntent: datesIntent } : {}),
    rentvine: chargeInventory
      ? { inventory: chargeInventory, readAt: readTimestamp }
      : null,
    sheet: sheetFields?.row
      ? { values: sheetFields.row.fieldValues ?? {}, readAt: readTimestamp }
      : null,
  };
  const sheetDestination = buildOperatingSheetCellDestination({
    spreadsheetId: process.env.RENEWAL_SHEET_ID,
    tabId: sheetFields?.tabId,
    rowNumber: sheetFields?.row?.rowNumber,
  });
  const auxiliaryFailures = renewalAuxiliaryFailures([
    manualRead,
    workingRecordRead,
    pricingRead,
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
    workStatusRead,
    ...(sheetEffectsRead ? [sheetEffectsRead] : []),
  ]);

  return (
    <AppShell user={user}>
      <section className="content content--workspace" role="main">
        <RenewalDeskReturnLink deskView={deskView} />
        {outcome.status === "ok" ? (
          <RenewalWorkspace
            actorUid={user.uid}
            attemptSummary={attemptSummary}
            auxiliaryFailures={auxiliaryFailures}
            finishUpPreparation={finishUpPreparation}
            tenantAcceptance={tenantAcceptance}
            sheetWritebackPaused={isOperatingSheetWritebackPaused()}
            policyMaterial={policyMaterial}
            policySheetValue={sheetFields?.row?.fieldValues?.rhino_renewed ?? null}
            policyTodayIso={businessDateIso(readTimestamp)}
            chargeInventory={chargeInventory}
            rentChargeStatus={rentChargeStatus}
            marketSubject={marketSubject}
            manualState={manualRead.status === "available" ? manualRead.value : undefined}
            manualReadUnavailable={manualRead.status !== "available"}
            workingRecord={renewalAuxiliaryValue(workingRecordRead, null)}
            workingRecordUnavailable={workingRecordRead.status !== "available"}
            workStatus={{
              available: workStatusRead.status === "available",
              record:
                workStatusRead.status === "available"
                  ? workStatusRead.value.record
                  : null,
              history:
                workStatusRead.status === "available" ? workStatusRead.value.history : [],
              notes:
                workStatusRead.status === "available"
                  ? workStatusRead.value.notes
                  : undefined,
              currentCycleId:
                manualRead.status === "available"
                  ? (manualRead.value?.cycleId ?? null)
                  : undefined,
            }}
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
                inventory={chargeInventory}
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
                  termsBasisInputs={sourceUpdateTermsBasisInputs}
                  association={
                    sheetFields?.association ?? {
                      kind: "ambiguous",
                      reason: "metadata_incomplete",
                    }
                  }
                  audienceEmails={
                    sheetFields?.row
                      ? {
                          owner: audienceEmailRoster(sheetFields, "owner"),
                          tenant: audienceEmailRoster(sheetFields, "tenant"),
                        }
                      : null
                  }
                  fieldCells={sheetFieldCells(sheetFields)}
                  identity={sourceUpdateIdentity}
                  initialFieldValues={sheetFields?.row?.fieldValues}
                  initialProposal={
                    sheetProposal ? clientSheetWritebackProposal(sheetProposal) : null
                  }
                  initialEffects={sheetEffects}
                  role={user.role}
                  tenantAcceptance={tenantAcceptance}
                  workspaceContext={sheetWorkspaceContext}
                  writebackPaused={isOperatingSheetWritebackPaused()}
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
              <RenewalResourceLinksSummary
                canManage={hasRenewalRoleAuthority(
                  "manage_renewal_configuration",
                  user.role,
                )}
                settings={renewalAuxiliaryValue(resourceLocationsRead, null)}
                todayIso={businessDateIso(readTimestamp)}
              />
            }
            packetReadinessPanel={
              <LeasePacketReadiness
                context={packetContextReadiness}
                rows={packetFamilyRows}
                selection={selectionFreshness}
              />
            }
            packetLeadPanel={
              <PacketNextStep
                canEditInputs={hasRenewalRoleAuthority("save_packet_inputs", user.role)}
                lead={packetLead}
                leaseId={leaseId}
              />
            }
            packetShownState={returnedStateView?.packetState ?? null}
            ownerApprovalChoices={{
              ...ownerApprovalChoices,
              // S234 R-S234-3: the coverage line also checks the charges the approval covers.
              economicsHash: currentEconomicsHash,
            }}
            returnedDocumentsPanel={
              <ReturnedDocumentsPanel
                canRecord={hasRenewalRoleAuthority("record_returned_state", user.role)}
                initialView={returnedStateView}
              />
            }
            rentvineUpdatesPanel={
              writebackProposalRead.status === "available" ? (
                <RentvineUpdatesPanel
                  key={writebackProposal?.previewHash ?? "no-rentvine-preview"}
                  termsBasisInputs={sourceUpdateTermsBasisInputs}
                  remainingDifferencesInputs={remainingDifferencesInputs}
                  currentBaseReadback={currentBaseReadback}
                  futureRentExecutionReady={futureReady}
                  identity={sourceUpdateIdentity}
                  initialInventory={chargeInventory}
                  initialProposal={
                    writebackProposal
                      ? clientRenewalWritebackProposal(writebackProposal)
                      : null
                  }
                  leaseId={leaseId}
                  role={user.role}
                  tenantAcceptance={tenantAcceptance}
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
            viewParam={viewParam}
            sheetDestination={sheetDestination}
            sheetLookup={{
              workspaceContext: sheetWorkspaceContext,
              current: operatingSheetLookupCurrent(sheetFields, OPERATING_SHEET_TAB),
            }}
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
