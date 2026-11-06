// S249: the stored facts batch preparation reads for one lease, in the signed-in staff member's
// session. Reads only; the lookup itself is supplied by the route (the existing market-comps route).

import type { AuthenticatedUser } from "@/lib/auth/session";
import { getRenewalCycleDateDecision } from "@/lib/firestore/renewal-cycle-date-decisions";
import {
  claimKickoffPreparation,
  releaseKickoffPreparation,
  settleKickoffPreparation,
} from "@/lib/firestore/renewal-kickoff-preparations";
import { readKickoffAutomaticStart } from "@/lib/firestore/renewal-kickoff-settings";
import { listMarketObservations } from "@/lib/firestore/renewal-market-observations";
import { getRenewalWorkspace } from "@/lib/firestore/renewal-workspace";
import {
  createRentcastUsageStore,
  rentcastMonthKey,
  rentcastUsedCalls,
} from "@/lib/firestore/rentcast-usage";
import { leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import { readCoherentRenewalDisplaySource } from "@/lib/lease-renewal/admitted-notice-source";
import { RENEWAL_DESK_WINDOW_DAYS } from "@/lib/lease-renewal/assistant-source";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import { classifyRenewalCohort } from "@/lib/lease-renewal/cohort";
import { buildRenewalDeskWindow } from "@/lib/lease-renewal/desk-query";
import type {
  KickoffLookupAnswer,
  KickoffPreparationDeps,
} from "@/lib/lease-renewal/kickoff-preparation-service";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { renewalTargetFor } from "@/lib/lease-renewal/live-desk";
import { marketBasisFromCapturedResult } from "@/lib/lease-renewal/market-observation";
import { projectMoveOutDisposition } from "@/lib/lease-renewal/move-out-disposition";
import { defaultRenewalBatchMonth } from "@/lib/lease-renewal/renewal-batch";
import { isRenewalTargetForMonth } from "@/lib/lease-renewal/renewal-target";
import {
  evaluateRentcastQuota,
  resolveRentcastAllowance,
} from "@/lib/lease-renewal/rentcast-quota";

export function kickoffPreparationDeps(
  actor: AuthenticatedUser,
  lookup: (leaseId: string, cycleId: string | null) => Promise<KickoffLookupAnswer>,
): KickoffPreparationDeps {
  return {
    automaticStartEnabled: async () => (await readKickoffAutomaticStart()).enabled,
    readLease: async (leaseId) => {
      const config = buildLiveRentVineConfig();
      if (!config.ok) return null;
      const nowMs = Date.now();
      const read = await readCoherentRenewalDisplaySource(
        actor,
        config.rentvineClient,
        nowMs,
        { leaseId },
      );
      const views = read.snapshot.views.filter((view) => leaseViewId(view) === leaseId);
      if (views.length !== 1) return null;
      const view = views[0]!;
      const [manual, decision] = await Promise.all([
        getRenewalWorkspace(actor, leaseId),
        getRenewalCycleDateDecision(actor, leaseId).catch(() => null),
      ]);
      const today = businessDateIso(nowMs);
      const classification = classifyRenewalCohort([view], {
        windows: [buildRenewalDeskWindow(today, RENEWAL_DESK_WINDOW_DAYS)],
        referenceDateIso: today,
      }).classifications[0];
      if (!classification) return null;
      const target = renewalTargetFor({
        view,
        classification,
        moveOut: projectMoveOutDisposition({
          lease: view,
          statusTable: read.statusTable,
          freshness: read.currency.state,
          observedAtIso: new Date(nowMs).toISOString(),
        }),
        manual,
        statusTable: read.statusTable,
        appCompletionCurrent: false,
        decision,
      });
      return {
        cycleDateIso:
          target.kind === "target" ? target.cycleDateIso : classification.endDateIso,
        inWorkingBatch: isRenewalTargetForMonth(target, defaultRenewalBatchMonth(today)),
        workRecordCycleId: manual?.cycleId ?? null,
        // S251 supplies the lease fact; until then no lease is held back.
        housingAssistance: null,
      };
    },
    storedComparison: async (leaseId, cycleId) => {
      if (!cycleId) return false;
      const manual = await getRenewalWorkspace(actor, leaseId);
      if (manual?.cycleId === cycleId && manual.preparation?.market.provider) return true;
      const rows = await listMarketObservations(actor, leaseId, cycleId);
      return rows.some((row) =>
        Boolean(marketBasisFromCapturedResult(row.result).provider),
      );
    },
    allowanceReached: async () => {
      const usage = await createRentcastUsageStore(actor).readMonth(
        rentcastMonthKey(Date.now()),
      );
      return evaluateRentcastQuota(rentcastUsedCalls(usage), resolveRentcastAllowance())
        .exhausted;
    },
    claim: (input) => claimKickoffPreparation(input),
    settle: (input) => settleKickoffPreparation(input),
    release: (input) => releaseKickoffPreparation(input),
    lookup,
  };
}
