import { readRenewalSheetGridsWithLinks } from "@/lib/lease-renewal/sheet-links";
import { listRenewalWorkspaces } from "@/lib/firestore/renewal-workspace";
// S110: the Renewals desk orchestration, extracted so exactly one code path produces the desk rows.
//
// The desk page and the assistant both call this. That is the whole point: a parity test can compare
// what the table renders with what the assistant answers, and the two cannot drift because there is
// only one orchestration. It reads live sources and supporting stores read-only; it performs no
// write, no draft, no send, and no provider effect.

import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { listCurrentRenewalPacketSnapshots } from "@/lib/firestore/lease-document-packet-snapshots";
import { listDismissedRenewalFollowUpKeys } from "@/lib/firestore/lease-renewal-follow-up-attention";
import { readNoticeRuleSnapshot } from "@/lib/firestore/lease-renewal-notice-rules";
import { listAllRenewalProgress } from "@/lib/firestore/lease-renewal-progress";
import { listResolutionsForRun } from "@/lib/firestore/lease-renewal-resolutions";
import { listLeaseTermReviews } from "@/lib/firestore/lease-renewal-term-reviews";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import {
  readRenewalAuxiliary,
  renewalAuxiliaryFailures,
  renewalAuxiliaryValue,
} from "@/lib/lease-renewal/auxiliary-read";
import { buildRenewalDeskWindow } from "@/lib/lease-renewal/desk-query";
import { buildLiveRenewalConfig } from "@/lib/lease-renewal/live-config";
import {
  getLiveLeaseSnapshot,
  getLiveLeaseSnapshotAtOrAfter,
  type LiveLeaseSnapshotResult,
} from "@/lib/lease-renewal/live-lease-cache";
import { loadLiveRenewalDesk } from "@/lib/lease-renewal/live-desk";
import { DEFAULT_NOTICE_RULE_SET } from "@/lib/lease-renewal/notice-rules";

/** The desk's own window rule: from the first of the current month, forward this many days. */
export const RENEWAL_DESK_WINDOW_DAYS = 120;

export type RenewalAssistantSource = Awaited<
  ReturnType<typeof runRenewalAssistantSource>
>;

/**
 * Run one desk read. `sourceRefreshAfter` is the S82 post-write freshness floor the page supplies
 * from its cookie; the assistant passes null and reads the current cached snapshot.
 */
export async function runRenewalAssistantSource(
  user: AuthenticatedUser,
  now: Date,
  sourceRefreshAfter: number | null = null,
) {
  // The window opens on the business calendar day (America/Chicago), the same day the assistant's
  // period parser and the workspace reference date read, so the three never disagree at a month end.
  const window = buildRenewalDeskWindow(businessDateIso(now), RENEWAL_DESK_WINDOW_DAYS);
  const liveConfig = buildLiveRenewalConfig();
  // Start this render's fresh Sheet read before waiting for independent supporting stores.
  // Capture rejection immediately; failure remains a primary read_error, never an empty Sheet.
  const sheetRead = liveConfig.ok
    ? readRenewalSheetGridsWithLinks({
        reader: liveConfig.sheetsReader,
        spreadsheetId: liveConfig.spreadsheetId,
        tabTitles: ["Lease Renewal"],
      }).then(
        (value) => value,
        () => null,
      )
    : Promise.resolve(null);
  const leaseRead: Promise<LiveLeaseSnapshotResult | undefined> = (async () => {
    if (!liveConfig.ok) return undefined;
    try {
      return await (sourceRefreshAfter === null
        ? getLiveLeaseSnapshot(liveConfig.rentvineClient, now.getTime())
        : getLiveLeaseSnapshotAtOrAfter(
            liveConfig.rentvineClient,
            now.getTime(),
            sourceRefreshAfter,
          ));
    } catch {
      return undefined;
    }
  })();

  const [
    progressRead,
    manualRead,
    policyRead,
    communicationsRead,
    dismissedRead,
    resolutionsRead,
    termReviewsRead,
    packetRead,
  ] = await Promise.all([
    readRenewalAuxiliary("progress", () => listAllRenewalProgress(user)),
    readRenewalAuxiliary("manual_workspace", () => listRenewalWorkspaces(user)),
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
    // S103: one bulk read of recorded lease term reviews. An unavailable store projects no review,
    // so a lease with absent provider evidence stays visibly unresolved rather than resolved.
    readRenewalAuxiliary("term_reviews", () => listLeaseTermReviews(user)),
    readRenewalAuxiliary("packet", async () => {
      const leaseSnapshotResult = await leaseRead;
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
  const auxiliaryFailures = renewalAuxiliaryFailures([
    manualRead,
    progressRead,
    policyRead,
    communicationsRead,
    dismissedRead,
    resolutionsRead,
    termReviewsRead,
    packetRead,
  ]);

  const leaseSnapshotResult = await leaseRead;
  const preparedSheetRead = await sheetRead;
  const outcome = !liveConfig.ok
    ? ({ status: liveConfig.reason } as const)
    : !leaseSnapshotResult || !preparedSheetRead
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
            dismissedAttentionKeys: renewalAuxiliaryValue(dismissedRead, []),
          },
          renewalAuxiliaryValue(resolutionsRead, []),
          packetRead.status === "available" ? packetRead.value : undefined,
          progressRead.status === "available",
          leaseSnapshotResult,
          renewalAuxiliaryValue(termReviewsRead, new Map()),
          renewalAuxiliaryValue(manualRead, new Map()),
          preparedSheetRead,
        );

  return { outcome, auxiliaryFailures, coverage: window };
}

/** The desk page and the assistant both call this one orchestration. */
export const loadRenewalAssistantSource = runRenewalAssistantSource;
