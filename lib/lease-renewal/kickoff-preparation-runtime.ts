// S249: read the exact current lease before preparation and save app-owned results
// through the working-record and message-preparation owners.

import { randomUUID } from "node:crypto";
import { readLeaseOutreachEvidence } from "@/lib/firestore/renewal-outreach-records";
import {
  outreachScopeFor,
  projectOutreachEvidence,
} from "@/lib/lease-renewal/outreach-evidence";
import { standingAdoptionSave } from "@/lib/lease-renewal/standing-agreement";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { cycleDispositionHold } from "./cycle-disposition";
import { getRenewalCycleDisposition } from "@/lib/firestore/renewal-cycle-disposition-read";
import { getLeaseTermReview } from "@/lib/firestore/lease-renewal-term-reviews";
import { getRenewalCycleDateDecision } from "@/lib/firestore/renewal-cycle-date-decisions";
import {
  claimKickoffPreparation,
  releaseKickoffPreparation,
  settleKickoffPreparation,
} from "@/lib/firestore/renewal-kickoff-preparations";
import { getRenewalProgress } from "@/lib/firestore/lease-renewal-progress";
import { saveMessagePreparation } from "@/lib/firestore/renewal-message-preparations";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import { listMarketObservations } from "@/lib/firestore/renewal-market-observations";
import {
  ensureRenewalWorkRecord,
  getRenewalWorkspace,
} from "@/lib/firestore/renewal-workspace";
import {
  getRenewalWorkingRecord,
  saveRenewalWorkingField,
} from "@/lib/firestore/renewal-working-record";
import {
  housingAssistanceVariant,
  workingRenewalTerms,
} from "@/lib/lease-renewal/working-record";
import { effectiveRenewalTerms } from "@/lib/lease-renewal/effective-terms";
import {
  currentCycleFieldEmpty,
  storedWorkingRevision,
} from "@/lib/lease-renewal/current-cycle-terms";
import { readRenewalPricingForViews } from "@/lib/lease-renewal/pricing-policy-read";
import { resolveRenewalPricing } from "@/lib/lease-renewal/renewal-pricing-policy";
import {
  currentRentChoice,
  currentStaffActivity,
  workBasisDateIso,
} from "@/lib/lease-renewal/workspace-state";
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
  KickoffLeaseRead,
  KickoffLookupAnswer,
  KickoffPreparationStatus,
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
    readLease: async (leaseId, month) => {
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
      if (
        views.length !== 1 ||
        (month && (!read.snapshot.complete || read.currency.state !== "fresh"))
      )
        return null;
      const view = views[0]!;
      const [manual, decision, disposition, termReview, working, progress] =
        await Promise.all([
          getRenewalWorkspace(actor, leaseId),
          getRenewalCycleDateDecision(actor, leaseId),
          getRenewalCycleDisposition(leaseId).catch(() => undefined),
          getLeaseTermReview(actor, leaseId).catch(() => undefined),
          // S251: the Housing assistance fact. An unreadable record is not read as "not set":
          // nothing is prepared for the lease until it reads back.
          getRenewalWorkingRecord(actor, leaseId).then(
            (record) => ({ ok: true as const, record }),
            () => ({ ok: false as const }),
          ),
          getRenewalProgress(actor, leaseId),
        ]);
      if (!working.ok) return null;
      const today = businessDateIso(nowMs);
      const classification = classifyRenewalCohort([view], {
        windows: [buildRenewalDeskWindow(today, RENEWAL_DESK_WINDOW_DAYS)],
        referenceDateIso: today,
        termReviews: termReview ? new Map([[leaseId, termReview]]) : undefined,
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
        // A completion that needs current-source verification may be inspected on the lease.
        // Monthly preparation holds it until that existing result is resolved.
        appCompletionCurrent: progress?.complete === true,
        decision,
        disposition: {
          saved: disposition,
          verifiedCycle:
            termReview !== undefined &&
            read.snapshot.complete &&
            read.currency.state === "fresh",
        },
      });
      // S250: whether a standing agreement covers the owner step on this read, from the one
      // coverage function over the same lease read and working record. A pricing read that fails
      // cannot confirm it either way, so the automatic start waits.
      const coverage = await readRenewalPricingForViews(
        actor,
        [view],
        new Date(nowMs),
      ).then(
        (pricing) => {
          const facts = pricing.facts[0];
          if (!facts)
            return { ownerStepCoverage: "unconfirmed" as const, coveredBy: null };
          const authority = resolveRenewalPricing(
            pricing.snapshot,
            {
              ...facts,
              cycleDate:
                facts.cycleDate ??
                (manual && manual.basis.kind !== "lease_bound"
                  ? manual.basis.dateIso
                  : null),
            },
            effectiveRenewalTerms(working.record).complete,
            pricing.today,
            { workingRent: workingRenewalTerms(working.record).rent },
          ).authority;
          return authority.covered
            ? {
                ownerStepCoverage: "covered" as const,
                coveredBy: authority.label ?? null,
              }
            : { ownerStepCoverage: null, coveredBy: null };
        },
        () => ({ ownerStepCoverage: "unconfirmed" as const, coveredBy: null }),
      );
      return {
        cycleDateIso:
          target.kind === "target" ? target.cycleDateIso : classification.endDateIso,
        inWorkingBatch:
          !target.statusUnavailable &&
          disposition !== undefined &&
          termReview !== undefined &&
          isRenewalTargetForMonth(target, month ?? defaultRenewalBatchMonth(today)),
        // S262 R-S262-5: empty for the active cycle. An earlier cycle's rent leaves it empty; an
        // unbound value is neither current nor empty, so preparation keeps it for staff to confirm.
        rentField: {
          revision: storedWorkingRevision(working.record, "terms_rent"),
          empty: currentCycleFieldEmpty(working.record, "terms_rent"),
        },
        draftEligible:
          !progress?.ownerDecision &&
          (!manual ||
            (!currentStaffActivity(manual, "owner_outreach") && !manual.ownerResponse)),
        dispositionHold: cycleDispositionHold(target.cycleDisposition),
        dispositionRevision:
          target.cycleDisposition?.state === "unavailable"
            ? undefined
            : target.cycleDisposition?.revision,
        workRecordCycleId: manual?.cycleId ?? null,
        // S251 ARCH-S251-4: the fact and the rent choice, asked before any billed lookup.
        housingAssistance: housingAssistanceVariant(working.record),
        rentChangeProposed: currentRentChoice(manual) === "propose_change",
        ...coverage,
      };
    },
    prepareWorkingResult: (leaseId, lease, status, month) =>
      prepareWorkingResult(actor, leaseId, lease, status, month),
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

async function prepareWorkingResult(
  actor: AuthenticatedUser,
  leaseId: string,
  lease: KickoffLeaseRead,
  status: KickoffPreparationStatus,
  month?: string,
): Promise<string> {
  if (!lease.cycleDateIso || !lease.rentField) return "";
  const cycleDateIso = lease.cycleDateIso;
  // Recheck eligibility and the cycle after an in-flight provider read.
  if (month) {
    const current = await kickoffPreparationDeps(actor, async () => ({
      ok: false,
    })).readLease(leaseId, month);
    if (
      !current?.inWorkingBatch ||
      current.dispositionHold ||
      current.cycleDateIso !== cycleDateIso
    )
      return "The lease or cycle changed. Review its current work before preparing it again.";
  }
  const workspace = await ensureRenewalWorkRecord(
    actor,
    leaseId,
    undefined,
    async () => ({
      kind: "lease_end",
      dateIso: cycleDateIso,
      source: "Verified RentVine renewal cycle",
    }),
  );
  if (
    (lease.workRecordCycleId && workspace.cycleId !== lease.workRecordCycleId) ||
    workBasisDateIso(workspace.basis) !== cycleDateIso
  )
    return "The work record changed. Review the current renewal cycle on the lease.";
  let current = await currentRenewalMessage(actor, leaseId, "owner");
  if (current.workspace?.cycleId !== workspace.cycleId)
    return "The renewal cycle changed.";
  const rent = current.rentToRecommend;
  let rentResult = lease.rentField.empty ? "" : "The existing recommendation was kept.";
  if (
    lease.rentField.empty &&
    rent.value !== null &&
    (rent.origin === "agreement" || rent.origin === "comparison")
  ) {
    const basis = rent.origin === "agreement" ? current.ruleBasis : null;
    // S277 ARCH-S277-1: an agreement amount saves through the one adoption writer, so its stored
    // basis is the same as the staff action's in the Pricing basis owner.
    const adoption = basis
      ? standingAdoptionSave({
          agreementId: basis.agreementId,
          agreementName: lease.coveredBy ?? "verified rule",
          policyId: basis.policyId,
          policyVersion: basis.policyVersion,
          basis: `${rent.basis} Cycle ${cycleDateIso} (${workspace.cycleId}).`,
        })
      : null;
    const saved = await saveRenewalWorkingField(
      actor,
      {
        leaseId,
        field: "terms_rent",
        value: rent.value,
        expectedRevision: lease.rentField.revision,
        operationId: randomUUID(),
        origin: "adopted_source",
        sourceLabel: adoption ? adoption.sourceLabel : "stored market comparison",
        context: adoption
          ? adoption.context
          : JSON.stringify({
              cycleId: workspace.cycleId,
              cycleDateIso,
              basis: rent.basis.slice(0, 430),
            }),
      },
      undefined,
      { cycleId: workspace.cycleId, dateIso: cycleDateIso },
    );
    if (saved.record.fields.terms_rent?.value !== rent.value)
      return "The working rent changed. Review the amount on the lease.";
    rentResult = "Recommendation saved.";
    current = await currentRenewalMessage(actor, leaseId, "owner");
  }
  if (
    !month ||
    !lease.draftEligible ||
    status === "covered" ||
    current.saved ||
    current.workspace?.cycleId !== workspace.cycleId
  )
    return rentResult;
  if (
    currentStaffActivity(current.workspace, "owner_outreach") ||
    current.workspace.ownerResponse
  )
    return rentResult;
  const outreach = projectOutreachEvidence(
    await readLeaseOutreachEvidence(leaseId),
    outreachScopeFor(current.workspace, cycleDateIso),
  );
  if (!outreach.readable)
    return [rentResult, "Owner draft waits for the current outreach read."]
      .filter(Boolean)
      .join(" ");
  if (outreach.owner.state !== "none")
    return [rentResult, "The existing owner outreach was kept."]
      .filter(Boolean)
      .join(" ");
  await saveMessagePreparation(actor, {
    leaseId,
    cycleId: workspace.cycleId,
    channel: "owner",
    expectedRevision: 0,
    operationId: randomUUID(),
    inputs: { ...current.inputs, signature: null },
  });
  const readback = await currentRenewalMessage(actor, leaseId, "owner");
  const draft = readback.outgoingReasons.length
    ? `Owner draft needs a check: ${readback.outgoingReasons.join(" ")}`
    : "Owner draft ready to review in the app.";
  return [rentResult, draft].filter(Boolean).join(" ");
}
