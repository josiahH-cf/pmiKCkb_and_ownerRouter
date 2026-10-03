"use client";
import { useRenewalSaveFocus } from "./RenewalSaveFocus";
import { AUTOSAVE_IDLE, AutosaveStatus, type AutosaveState } from "./AutosaveStatus";

import { Field } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

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
  const focusAfterSave = useRenewalSaveFocus();
  const [selected, setSelected] = useState<RecordableLeaseTerm>(
    term.term === "month_to_month" ? "month_to_month" : "fixed_term",
  );
  const [anchor, setAnchor] = useState(term.anchorDateIso ?? "");
  const [reason, setReason] = useState("");
  const [saveState, setSaveState] = useState<AutosaveState>(AUTOSAVE_IDLE);
  const sequence = useRef(0);
  const lastAttempt = useRef<{ term: RecordableLeaseTerm; anchor: string } | null>(null);

  if (!canEdit) {
    return (
      <p className="muted">
        Recording the lease term needs Editor access. Ask an Admin to review your role;
        the term above stays visible read-only.
      </p>
    );
  }

  // S155: the term saves when it is chosen. Month-to-month also needs its start date, so that
  // choice saves once the date is entered; an unfinished entry stays as typed.
  async function record(next: { term: RecordableLeaseTerm; anchor: string }) {
    if (next.term === "month_to_month" && next.anchor === "") return;
    lastAttempt.current = next;
    const mine = (sequence.current += 1);
    setSaveState({ phase: "saving" });
    try {
      const response = await fetch("/api/lease-renewal/term-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lease_id: leaseId,
          term: next.term,
          ...(next.term === "month_to_month" ? { anchor_date: next.anchor } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          source_fingerprint: term.sourceFingerprint,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "The lease term could not be saved.");
      }
      // An older response never replaces the state of a newer save.
      if (mine !== sequence.current) return;
      setSaveState({ phase: "saved" });
      if (!focusAfterSave?.()) router.refresh();
    } catch (error) {
      if (mine !== sequence.current) return;
      setSaveState({
        phase: "failed",
        message:
          error instanceof Error ? error.message : "The lease term could not be saved.",
      });
    }
  }

  return (
    <div className="ui-stack-tight">
      <p className="muted">
        {recordedTerm
          ? `Recorded term: ${LEASE_TERM_LABELS[recordedTerm]}. Choose again to correct it.`
          : "No term has been recorded for this lease yet."}
      </p>
      <Field htmlFor={`lease-term-${leaseId}`} label="Lease term">
        <select
          className="ui-input"
          id={`lease-term-${leaseId}`}
          onChange={(event) => {
            const next = event.target.value as RecordableLeaseTerm;
            setSelected(next);
            void record({ term: next, anchor });
          }}
          value={selected}
        >
          <option value="fixed_term">{LEASE_TERM_LABELS.fixed_term}</option>
          <option value="month_to_month">{LEASE_TERM_LABELS.month_to_month}</option>
        </select>
      </Field>
      {selected === "month_to_month" ? (
        <Field
          htmlFor={`lease-term-anchor-${leaseId}`}
          label="Month-to-month since (the annual review is 12 months later)"
        >
          <input
            className="ui-input"
            id={`lease-term-anchor-${leaseId}`}
            onChange={(event) => {
              setAnchor(event.target.value);
              void record({ term: selected, anchor: event.target.value });
            }}
            type="date"
            value={anchor}
          />
        </Field>
      ) : null}
      <Field htmlFor={`lease-term-reason-${leaseId}`} label="Context (optional)">
        <input
          className="ui-input"
          id={`lease-term-reason-${leaseId}`}
          maxLength={2000}
          onBlur={() => {
            if (reason.trim()) void record({ term: selected, anchor });
          }}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </Field>
      <AutosaveStatus
        onRetry={() => {
          if (lastAttempt.current) void record(lastAttempt.current);
        }}
        state={saveState}
        subject="lease term"
      />
    </div>
  );
}
