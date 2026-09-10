"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { OwnerDecisionForm } from "@/components/lease-renewal/RenewalProgressControls";
import { useRenewalManualWorkspace } from "@/components/lease-renewal/RenewalManualWorkspace";
import type { RenewalMarketObservation } from "@/lib/lease-renewal/market-observation";
export function RenewalCompPreparation({
  address,
  currentRent,
  compScreenshotExecutable,
}: {
  address: string;
  currentRent?: number;
  compScreenshotExecutable: boolean;
}) {
  const context = useRenewalManualWorkspace();
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
  if (!context.state)
    return (
      <Card title="Market evidence">
        <p>
          Select the reviewed cycle above to retain comps before owner outreach. Opening
          this section makes no paid lookup.
        </p>
      </Card>
    );
  const { state } = context,
    currentObservations = observations.filter((value) => value.cycleId === state.cycleId),
    selected =
      currentObservations.find(
        (value) => value.id === state.preparation?.observationId,
      ) ?? currentObservations.find((value) => value.market.provider);
  return (
    <Card title="Market evidence">
      <p>
        Look up comps deliberately, review their source, and save preparation before
        requesting owner approval. A lookup does not set the renewal rent.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <OwnerDecisionForm
        key={state.cycleId}
        leaseId={context.leaseId}
        current={null}
        currentRent={currentRent}
        address={address}
        compScreenshotExecutable={compScreenshotExecutable}
        preparation={{
          cycleId: state.cycleId,
          market: state.preparation?.market,
          source: state.preparation?.source,
          analysisReference: state.preparation?.analysisReference,
          initialLookup: selected
            ? { ...selected.result, observationId: selected.id }
            : null,
          onSave: context.record,
        }}
      />
    </Card>
  );
}
