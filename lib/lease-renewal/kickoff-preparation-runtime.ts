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
import { getRenewalWorkingRecord } from "@/lib/firestore/renewal-working-record";
import {
  housingAssistanceVariant,
  workingRenewalTerms,
} from "@/lib/lease-renewal/working-record";
import { effectiveRenewalTerms } from "@/lib/lease-renewal/effective-terms";
import { readRenewalPricingForViews } from "@/lib/lease-renewal/pricing-policy-read";
import { resolveRenewalPricing } from "@/lib/lease-renewal/renewal-pricing-policy";
import { currentRentChoice } from "@/lib/lease-renewal/workspace-state";
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
      const [manual, decision, working] = await Promise.all([
        getRenewalWorkspace(actor, leaseId),
        getRenewalCycleDateDecision(actor, leaseId).catch(() => null),
        // S251: the Housing assistance fact. An unreadable record is not read as "not set":
        // nothing is prepared for the lease until it reads back.
        getRenewalWorkingRecord(actor, leaseId).then(
          (record) => ({ ok: true as const, record }),
          () => ({ ok: false as const }),
        ),
      ]);
      if (!working.ok) return null;
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
      // S250: whether a standing agreement covers the owner step on this read, from the one
      // coverage function over the same lease read and working record. A pricing read that fails
      // cannot confirm it either way, so the automatic start waits.
      const coverage = await readRenewalPricingForViews(actor, [view], new Date(nowMs)).then(
        (pricing) => {
          const facts = pricing.facts[0];
          if (!facts) return { ownerStepCoverage: null, coveredBy: null };
          const authority = resolveRenewalPricing(
            pricing.snapshot,
            {
              ...facts,
              cycleDate:
                facts.cycleDate ??
                (manual && manual.basis.kind !== "lease_bound" ? manual.basis.dateIso : null),
            },
            effectiveRenewalTerms(working.record).complete,
            pricing.today,
            { workingRent: workingRenewalTerms(working.record).rent },
          ).authority;
          return authority.covered
            ? { ownerStepCoverage: "covered" as const, coveredBy: authority.label ?? null }
            : { ownerStepCoverage: null, coveredBy: null };
        },
        () => ({ ownerStepCoverage: "unconfirmed" as const, coveredBy: null }),
      );
      return {
        cycleDateIso:
          target.kind === "target" ? target.cycleDateIso : classification.endDateIso,
        inWorkingBatch: isRenewalTargetForMonth(target, defaultRenewalBatchMonth(today)),
        workRecordCycleId: manual?.cycleId ?? null,
        // S251 ARCH-S251-4: the fact and the rent choice, asked before any billed lookup.
        housingAssistance: housingAssistanceVariant(working.record),
        rentChangeProposed: currentRentChoice(manual) === "propose_change",
        ...coverage,
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
