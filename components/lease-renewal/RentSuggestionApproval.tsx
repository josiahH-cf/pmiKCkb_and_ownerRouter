"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOperation } from "@/components/hooks/useOperation";
import { BusyIndicator } from "@/components/ui/BusyIndicator";

import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { useRenewalSaveFocus } from "@/components/lease-renewal/RenewalSaveFocus";
import { Button, Field, StatusPill } from "@/components/ui";
import { formatUsd } from "@/lib/lease-renewal/owner-draft";

// S29 comp-derived rent-suggestion approval surface (owner decision D-RENT-SUGGEST). It shows the
// server-computed SUGGESTED renewal rent number ALWAYS beside the comps that produced it, the current
// approval state, and a per-number Approve / Return control. S156/S167: the staff member doing the
// work (Editor) records the decision alone; the server says who may, and a read-only caller sees the
// number and its comps with no approve affordance. A needs-verification suggestion renders the
// "Needs Verification" text and NO number and NO control. Approving records the decision to place
// the number in the owner-notice DRAFT only; nothing is sent and no system of record is written.

export interface RentSuggestionCompView {
  rent: number;
  source: string;
  label?: string;
}

export interface RentSuggestionView {
  suggestedRent: number | null;
  status: "suggested" | "needs_verification";
  /** S62: how the number was derived; an owner-policy rule names itself in the rationale. */
  method?: "comp_median" | "owner_policy_percent";
  comps: RentSuggestionCompView[];
  rationale: string;
  /** S62 (AC-S62-6): when a rule proposes the number, the comp median stays visible beside it. */
  context?: { compMedian: number | null };
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
  return (
    <OwnedRentSuggestionApproval
      key={leaseId}
      leaseId={leaseId}
      initialData={initialData}
    />
  );
}

function OwnedRentSuggestionApproval({
  leaseId,
  initialData,
}: Readonly<{ leaseId: string; initialData?: RentSuggestionData }>) {
  const router = useRouter();
  const focusAfterSave = useRenewalSaveFocus();
  const [data, setData] = useState<RentSuggestionData | null>(initialData ?? null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const dispatched = useRef(false);
  const live = useRef(true);
  const read = useOperation(`rent-suggestion-read:${leaseId}`);
  const decisionOperation = useOperation(`rent-suggestion-decision:${leaseId}`);
  const readController = read.controller;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const reasonId = useId();

  const refresh = useCallback(async () => {
    setReadError("");
    const result = await readController.run(
      "Loading current rent suggestion",
      async (signal) => {
        const response = await fetch(
          `/api/lease-renewal/rent-suggestion?lease_id=${encodeURIComponent(leaseId)}`,
          { signal, cache: "no-store" },
        );
        if (!response.ok)
          return {
            current: null,
            denied: response.status === 401 || response.status === 403,
          };
        const current = (await response.json()) as RentSuggestionData;
        if (
          !current?.suggestion ||
          !Array.isArray(current.suggestion.comps) ||
          typeof current.suggestion.rationale !== "string" ||
          typeof current.canApprove !== "boolean"
        )
          throw new Error("Invalid suggestion read");
        return { current, denied: false };
      },
    );
    if (!live.current || result.outcome === "superseded") return null;
    if (result.outcome === "succeeded" && result.value.current) {
      setData(result.value.current);
      return result.value.current;
    }
    if (result.outcome === "succeeded" && result.value.denied) {
      setData(null);
      setReadError(
        "Access to this rent suggestion is unavailable. Check your access before retrying.",
      );
    } else
      setReadError(
        "The current rent suggestion is unavailable. Retry the read when ready.",
      );
    return null;
  }, [leaseId, readController]);

  // The owning controller retires both headers and body reads when this record leaves.
  useEffect(() => {
    if (initialData) return;
    queueMicrotask(() => {
      if (live.current) void refresh();
    });
  }, [initialData, refresh]);

  async function decide(decision: "approve" | "return") {
    if (dispatched.current || uncertain) return;
    dispatched.current = true;
    setPending(true);
    setError("");
    try {
      const result = await decisionOperation.controller.run(
        "Saving rent decision",
        async (signal) => {
          const response = await fetch("/api/lease-renewal/rent-suggestion", {
            method: "POST",
            signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ lease_id: leaseId, decision, reason: reason.trim() }),
          });
          return {
            ok: response.ok,
            status: response.status,
            payload: (await response.json()) as {
              approval?: RentSuggestionApprovalStateView;
              error?: string;
            },
          };
        },
        { kind: "effect" },
      );
      if (!live.current) return;
      if (result.outcome !== "succeeded") {
        setUncertain(true);
        setError(
          "The decision is not confirmed. Check the current suggestion, then reload and review the workspace before making another decision.",
        );
        return;
      }
      const { ok, status, payload: saved } = result.value;
      if (ok) {
        const current = await refresh();
        if (!live.current) return;
        const expectedState =
          decision === "approve" ? "Approved" : "Returned for Revision";
        const readBack =
          saved.approval?.state === expectedState &&
          current?.approval?.state === expectedState &&
          current.approval.approved_value === saved.approval.approved_value;
        if (readBack) {
          setReason("");
          if (!focusAfterSave?.()) router.refresh();
        } else {
          setUncertain(true);
          setError(
            "The decision response arrived, but its current readback is not confirmed. Check the current suggestion before reviewing another decision.",
          );
          // Preserve the owning workspace's freshness recovery without clearing this component's
          // reason or uncertainty fence. A refresh is a read, not another decision attempt.
          router.refresh();
        }
      } else {
        if (status >= 500) setUncertain(true);
        setError(
          saved.error ??
            (status >= 500
              ? "The decision is not confirmed. Check its current state before reviewing another decision."
              : "Could not record the decision."),
        );
      }
    } catch {
      if (live.current) {
        setUncertain(true);
        setError(
          "The decision is not confirmed. Check the current suggestion before reviewing another decision.",
        );
      }
    } finally {
      if (live.current) setPending(false);
      dispatched.current = false;
    }
  }

  if (!data) {
    return (
      <div className="ui-stack-tight" aria-busy={read.snapshot.phase === "pending"}>
        {readError ? (
          <>
            <p role="alert">{readError}</p>
            <Button
              variant="secondary"
              disabled={read.snapshot.phase === "pending"}
              onClick={() => void refresh()}
            >
              Retry current suggestion
            </Button>
          </>
        ) : (
          <BusyIndicator label="Loading the comp-derived suggestion…" />
        )}
      </div>
    );
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
        <p className="muted">No comp-derived suggestion available.</p>
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
      {read.snapshot.phase === "pending" ? (
        <BusyIndicator label="Checking current suggestion…" />
      ) : null}
      {readError ? <p role="alert">{readError}</p> : null}
      {readError || uncertain ? (
        <Button
          variant="secondary"
          disabled={read.snapshot.phase === "pending"}
          onClick={() => void refresh()}
        >
          Check current suggestion
        </Button>
      ) : null}
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
        {/* S62 precedence (AC-S62-6): a rule-proposed number never hides the comp median. */}
        {suggestion.method === "owner_policy_percent" &&
        suggestion.context?.compMedian != null ? (
          <p className="muted">
            For comparison, the comp median for this lease is{" "}
            {formatUsd(suggestion.context.compMedian)}. The owner-policy number above is
            the proposal; both are shown so nothing is hidden.
          </p>
        ) : null}
      </div>
      <p className="muted">
        This number enters the owner email once you approve it here, and a person still
        reviews and sends the email.
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
              disabled={pending || uncertain || reason.trim() === ""}
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
              disabled={pending || uncertain || reason.trim() === ""}
              onClick={() => void decide("return")}
              type="button"
              variant="secondary"
            >
              Return for revision
            </Button>
          </div>
          {error ? <p role="alert">{error}</p> : null}
        </div>
      ) : (
        <p className="muted">
          Editor access is required to approve this number.{" "}
          <RequestAccessLink surface="renewals.manage" />
        </p>
      )}
    </div>
  );
}
