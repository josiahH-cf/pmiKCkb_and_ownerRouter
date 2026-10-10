"use client";
import { useRef, useState } from "react";
import { RenewalCopyValue } from "@/components/lease-renewal/RenewalCopyValue";
import { Button } from "@/components/ui";
import { formatUsd } from "@/lib/lease-renewal/owner-draft";
import { renewalCompRecommendation } from "@/lib/lease-renewal/renewal-recommendation";
import { workingRenewalTerms } from "@/lib/lease-renewal/working-record";
import { useRenewalWorkingRecord } from "@/components/lease-renewal/RenewalWorkingRecord";
import { useRenewalManualWorkspace } from "@/components/lease-renewal/RenewalManualWorkspace";
import { useRenewalPricingPolicy } from "@/components/lease-renewal/RenewalPricingPolicy";
export function RenewalRecommendation({
  currentRent,
  fresh = true,
}: Readonly<{ currentRent: number | null; fresh?: boolean }>) {
  const manual = useRenewalManualWorkspace(),
    working = useRenewalWorkingRecord(),
    pricing = useRenewalPricingPolicy();
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  if (!manual || !working) return null;
  const comp = renewalCompRecommendation(manual.state?.preparation ?? null, currentRent),
    proposal = pricing?.view?.proposal,
    selected = workingRenewalTerms(working.record).rent;
  async function adoptProposal(value: number, sourceLabel: string, context: string) {
    if (!working || lock.current) return;
    lock.current = true;
    setPending(true);
    setMessage("");
    try {
      const saved = await working.save("terms_rent", value, {
        origin: "adopted_source",
        sourceLabel,
        context: context.slice(0, 1000),
      });
      setMessage(
        saved
          ? "Working offer saved with its proposal basis."
          : "The offer is not confirmed. Your existing working value is kept; retry the same selection to recover its result.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const disabled =
    !working.canEdit || working.readUnavailable || manual.readUnavailable || pending;
  return (
    <section aria-label="Renewal recommendation" className="panel">
      <h3>Recommendation and working offer</h3>
      <p>
        Current rent used for comparison:{" "}
        <strong>{currentRent === null ? "Unavailable" : formatUsd(currentRent)}</strong>.
        Selected working offer:{" "}
        <strong>
          {selected === null ? (
            "Not entered"
          ) : (
            <RenewalCopyValue label="working renewal rent" value={formatUsd(selected)} />
          )}
        </strong>
        .
      </p>
      {!fresh ? (
        <p role="status">
          Current source freshness is unavailable. Retained comparison evidence remains
          visible; review the current source before selecting it.
        </p>
      ) : null}
      {proposal ? (
        <div>
          <p>{proposal.reason}</p>
          {proposal.amount !== null ? (
            <Button
              disabled={disabled || !fresh}
              onClick={() =>
                void adoptProposal(
                  proposal.amount!,
                  `Pricing policy v${proposal.policyVersion}`,
                  `${proposal.policyId}: ${proposal.reason}`,
                )
              }
            >
              Use policy proposal {formatUsd(proposal.amount)}
            </Button>
          ) : null}
        </div>
      ) : (
        <p>No applicable reusable price proposal is available.</p>
      )}
      <p>{comp.rationale}</p>
      {comp.source ? (
        <p>
          Retained comparison: {comp.source}. Refreshing a lookup does not replace an
          existing working offer or authorized message.
        </p>
      ) : null}
      {comp.limitations.map((l) => (
        <p key={l} role="note">
          {l}
        </p>
      ))}
      {comp.suggestedRent !== null ? (
        <Button
          disabled={disabled || !fresh}
          onClick={() =>
            void adoptProposal(
              comp.suggestedRent!,
              "Comparable-rent recommendation",
              `${comp.observationId ?? "retained-preparation"}: ${comp.source ?? ""}. ${comp.rationale}`,
            )
          }
        >
          Use comparison proposal {formatUsd(comp.suggestedRent)}
        </Button>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
