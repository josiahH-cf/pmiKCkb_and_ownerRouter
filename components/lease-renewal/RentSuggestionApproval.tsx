"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field, StatusPill } from "@/components/ui";
import { formatUsd } from "@/lib/lease-renewal/owner-draft";

// S29 comp-derived rent-suggestion approval surface (owner decision D-RENT-SUGGEST). It shows the
// server-computed SUGGESTED renewal rent number ALWAYS beside the comps that produced it, the current
// approval state, and a per-number Approve / Return control that is Admin-only. A non-Admin sees the number
// and its comps read-only with no approve affordance. A needs-verification suggestion renders the
// "Needs Verification" text and NO number and NO control. Approving records human authorization to place
// the number in the owner-notice DRAFT only; nothing is sent and no system of record is written.

export interface RentSuggestionCompView {
  rent: number;
  source: string;
  label?: string;
}

export interface RentSuggestionView {
  suggestedRent: number | null;
  status: "suggested" | "needs_verification";
  comps: RentSuggestionCompView[];
  rationale: string;
}

export interface RentSuggestionApprovalStateView {
  state: "Approved" | "Returned for Revision";
  approved_value: number;
}

export interface RentSuggestionData {
  suggestion: RentSuggestionView;
  approval: RentSuggestionApprovalStateView | null;
  canApprove: boolean;
}

export function RentSuggestionApproval({
  leaseId,
  initialData,
}: Readonly<{ leaseId: string; initialData?: RentSuggestionData }>) {
  const router = useRouter();
  const [data, setData] = useState<RentSuggestionData | null>(initialData ?? null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const reasonId = useId();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/lease-renewal/rent-suggestion?lease_id=${encodeURIComponent(leaseId)}`,
      );
      if (response.ok) {
        setData((await response.json()) as RentSuggestionData);
      }
    } catch {
      // Leave the prior state in place; the operator can retry.
    }
  }, [leaseId]);

  // Fetch once on mount when the server did not seed initialData. setData runs only in the async
  // continuation (never synchronously in the effect body), and an `active` guard drops a late response.
  useEffect(() => {
    if (initialData) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(
          `/api/lease-renewal/rent-suggestion?lease_id=${encodeURIComponent(leaseId)}`,
        );
        if (active && response.ok) {
          setData((await response.json()) as RentSuggestionData);
        }
      } catch {
        // Leave the prior state in place; the operator can retry.
      }
    })();
    return () => {
      active = false;
    };
  }, [initialData, leaseId]);

  async function decide(decision: "approve" | "return") {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/lease-renewal/rent-suggestion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lease_id: leaseId, decision, reason: reason.trim() }),
      });
      if (response.ok) {
        setReason("");
        await refresh();
        router.refresh();
      } else {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Could not record the decision.");
      }
    } catch {
      setError("Could not reach the rent-suggestion service.");
    } finally {
      setPending(false);
    }
  }

  if (!data) {
    return <p className="muted">Loading the comp-derived suggestion…</p>;
  }

  const { suggestion, approval, canApprove } = data;

  // A needs-verification suggestion renders the marker and NO number and NO approve control.
  if (suggestion.status !== "suggested" || suggestion.suggestedRent === null) {
    return (
      <div className="ui-stack-tight">
        <div className="ui-spread">
          <strong>Comp-derived suggested rent</strong>
          <StatusPill value="Needs Verification">Needs Verification</StatusPill>
        </div>
        <p className="muted">
          Capture comp data to compute a suggestion. The app never fabricates a number.
        </p>
      </div>
    );
  }

  const stateLabel =
    approval?.state === "Approved"
      ? "Approved"
      : approval?.state === "Returned for Revision"
        ? "Returned for revision"
        : "Awaiting approval";
  const stateValue = approval?.state === "Approved" ? "Low" : "Needs Verification";
  const approvedCurrent =
    approval?.state === "Approved" &&
    approval.approved_value === suggestion.suggestedRent;

  return (
    <div className="ui-stack">
      <div className="ui-spread">
        <strong>Comp-derived suggested rent</strong>
        <StatusPill value={stateValue}>{stateLabel}</StatusPill>
      </div>
      <p>
        <strong>{formatUsd(suggestion.suggestedRent)}</strong>
      </p>
      {/* The number is ALWAYS shown beside the comps that produced it. */}
      <div className="ui-stack-tight">
        <span className="muted">Comparable rents</span>
        <ul className="ui-rows">
          {suggestion.comps.map((comp, index) => (
            <li className="ui-spread" key={`${comp.source}-${index}`}>
              <span>
                {comp.label ? `${comp.label} · ` : ""}
                {comp.source}
              </span>
              <strong>{formatUsd(comp.rent)}</strong>
            </li>
          ))}
        </ul>
        <p className="muted">{suggestion.rationale}</p>
      </div>
      <p className="muted">
        This number enters the owner email only after an Admin approves it, and a person
        still reviews and sends the email.
      </p>
      {canApprove ? (
        <div className="ui-stack">
          <Field htmlFor={reasonId} label="Reason (recorded on the decision)" required>
            <input
              id={reasonId}
              onChange={(event) => setReason(event.target.value)}
              type="text"
              value={reason}
            />
          </Field>
          <div className="ui-row">
            <Button
              disabled={pending || reason.trim() === ""}
              onClick={() => void decide("approve")}
              type="button"
            >
              {pending
                ? "Saving…"
                : approvedCurrent
                  ? "Re-approve this number"
                  : "Approve this number"}
            </Button>
            <Button
              disabled={pending || reason.trim() === ""}
              onClick={() => void decide("return")}
              type="button"
              variant="secondary"
            >
              Return for revision
            </Button>
          </div>
          {error ? <p className="muted">{error}</p> : null}
        </div>
      ) : (
        <p className="muted">Only an Admin can approve this number.</p>
      )}
    </div>
  );
}
