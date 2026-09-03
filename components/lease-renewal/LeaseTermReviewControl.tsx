"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  LEASE_TERM_LABELS,
  type LeaseTermProjection,
  type RecordableLeaseTerm,
} from "@/lib/lease-renewal/lease-term";

/**
 * S103: record or correct one lease's app-owned term review. It writes only the KB's own record,
 * bound to the exact source fingerprint of the lease facts shown above it. No provider write, no
 * draft, and no send derives from it.
 */
export function LeaseTermReviewControl({
  canEdit,
  leaseId,
  term,
  recordedTerm = null,
}: Readonly<{
  canEdit: boolean;
  leaseId: string;
  term: LeaseTermProjection;
  recordedTerm: RecordableLeaseTerm | null;
}>) {
  const router = useRouter();
  const [selected, setSelected] = useState<RecordableLeaseTerm>(
    term.term === "month_to_month" ? "month_to_month" : "fixed_term",
  );
  const [anchor, setAnchor] = useState(term.anchorDateIso ?? "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");

  if (!canEdit) {
    return (
      <p className="muted">
        Recording the lease term needs Editor access in the Renewals Space. Ask an Admin
        to review your role; the term above stays visible read-only.
      </p>
    );
  }

  const anchorRequired = selected === "month_to_month";
  const ready = reason.trim().length >= 3 && (!anchorRequired || anchor !== "");

  async function record() {
    if (!ready || pending) return;
    setPending(true);
    setStatus("");
    try {
      const response = await fetch("/api/lease-renewal/term-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lease_id: leaseId,
          term: selected,
          ...(anchorRequired ? { anchor_date: anchor } : {}),
          reason: reason.trim(),
          source_fingerprint: term.sourceFingerprint,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "The lease term review could not be recorded.");
      }
      setReason("");
      setStatus(
        `Recorded: this lease is ${LEASE_TERM_LABELS[selected].toLowerCase()}, with audit evidence.`,
      );
      router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The lease term review could not be recorded.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ui-stack-tight">
      <p className="muted">
        {recordedTerm
          ? `Recorded term: ${LEASE_TERM_LABELS[recordedTerm]}. Record it again to correct it.`
          : "No term has been recorded for this lease yet."}
      </p>
      <label className="field-label" htmlFor={`lease-term-${leaseId}`}>
        Lease term
      </label>
      <select
        className="ui-input"
        id={`lease-term-${leaseId}`}
        onChange={(event) => setSelected(event.target.value as RecordableLeaseTerm)}
        value={selected}
      >
        <option value="fixed_term">{LEASE_TERM_LABELS.fixed_term}</option>
        <option value="month_to_month">{LEASE_TERM_LABELS.month_to_month}</option>
      </select>
      {anchorRequired ? (
        <>
          <label className="field-label" htmlFor={`lease-term-anchor-${leaseId}`}>
            Month-to-month since (the annual review is 12 months later)
          </label>
          <input
            className="ui-input"
            id={`lease-term-anchor-${leaseId}`}
            onChange={(event) => setAnchor(event.target.value)}
            type="date"
            value={anchor}
          />
        </>
      ) : null}
      <label className="field-label" htmlFor={`lease-term-reason-${leaseId}`}>
        Reason
      </label>
      <input
        className="ui-input"
        id={`lease-term-reason-${leaseId}`}
        maxLength={2000}
        onChange={(event) => setReason(event.target.value)}
        value={reason}
      />
      <button
        className="secondary-button"
        disabled={!ready || pending}
        onClick={() => void record()}
        type="button"
      >
        {pending ? "Recording…" : "Record lease term"}
      </button>
      {status ? <p role="status">{status}</p> : null}
    </div>
  );
}
