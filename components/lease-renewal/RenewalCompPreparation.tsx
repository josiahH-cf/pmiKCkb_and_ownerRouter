"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { renewalCardTitle } from "@/components/lease-renewal/RenewalSectionHeading";
import { useEffect, useState } from "react";
import { RenewalRecommendation } from "@/components/lease-renewal/RenewalRecommendation";
import { Card } from "@/components/ui";
import { OwnerDecisionForm } from "@/components/lease-renewal/RenewalProgressControls";
import { useRenewalManualWorkspace } from "@/components/lease-renewal/RenewalManualWorkspace";
import { useRenewalWorkingRecord } from "@/components/lease-renewal/RenewalWorkingRecord";
import { operationalCurrentRent } from "@/lib/lease-renewal/current-rent";
import type { RenewalMarketObservation } from "@/lib/lease-renewal/market-observation";
import type { MarketSubjectProjection } from "@/lib/lease-renewal/market-subject";
export function RenewalCompPreparation({
  address,
  currentRent,
  compScreenshotExecutable,
  marketSubject = null,
  sourceFresh = true,
  canonicalRecommendation = false,
}: {
  address: string;
  currentRent?: number;
  sourceFresh?: boolean;
  canonicalRecommendation?: boolean;
  compScreenshotExecutable: boolean;
  /** S118: the server-resolved subject behind the starting range and the report links. */
  marketSubject?: MarketSubjectProjection | null;
}) {
  const context = useRenewalManualWorkspace();
  // S261 ARCH-S261-1: the comparison reads the one base decision: the working current rent
  // correction first, else the lease rent this page passed.
  const working = useRenewalWorkingRecord();
  const baseRent =
    operationalCurrentRent({
      working: working?.record ?? null,
      contractualRent: currentRent ?? null,
    }).amount ?? undefined;
  const [observations, setObservations] = useState<RenewalMarketObservation[]>([]),
    [error, setError] = useState("");
  const leaseId = context?.leaseId,
    cycleId = context?.state?.cycleId;
  useEffect(() => {
    if (!leaseId || !cycleId) return;
    const controller = new AbortController();
    void fetch(`/api/lease-renewal/workspace?leaseId=${encodeURIComponent(leaseId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            "Retained comp evidence could not be read. Existing preparation is unchanged.",
          );
        setObservations(
          (body.observations as RenewalMarketObservation[]).filter(
            (value) => value.cycleId === cycleId,
          ),
        );
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Retained comps could not be read.",
          );
      });
    return () => controller.abort();
  }, [leaseId, cycleId]);
  if (!context) return null;
  // S154: comps are available on every lease. With nothing recorded yet, the first retained
  // lookup or saved preparation establishes the work record.
  const { state } = context,
    currentObservations = state
      ? observations.filter((value) => value.cycleId === state.cycleId)
      : [],
    selected =
      currentObservations.find(
        (value) => value.id === state?.preparation?.observationId,
      ) ?? currentObservations.find((value) => value.market.provider);
  return (
    <Card title={renewalCardTitle("market-evidence", "Market evidence")}>
      {error ? <p role="alert">{error}</p> : null}
      {!canonicalRecommendation ? (
        <RenewalRecommendation currentRent={baseRent ?? null} fresh={sourceFresh} />
      ) : null}
      <OwnerDecisionForm
        key={state?.cycleId ?? "unrecorded"}
        leaseId={context.leaseId}
        current={null}
        currentRent={baseRent}
        address={address}
        canonicalRecommendation={canonicalRecommendation}
        compScreenshotExecutable={compScreenshotExecutable}
        marketSubject={marketSubject}
        preparation={{
          cycleId: state?.cycleId ?? null,
          market: state?.preparation?.market,
          source: state?.preparation?.source,
          analysisReference: state?.preparation?.analysisReference,
          initialLookup: selected
            ? { ...selected.result, observationId: selected.id }
            : null,
          onSave: context.record,
          saveState: context.states.preparation,
        }}
      />
    </Card>
  );
}
