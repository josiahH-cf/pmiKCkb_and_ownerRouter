"use client";

import { useState } from "react";

import { Button, Field } from "@/components/ui";
import type { RenewalDiscrepancyDisposition } from "@/lib/firestore/renewal-discrepancy-dispositions";

export function DiscrepancyDispositionPanel({
  leaseId,
  sourceHash,
  ownerUid,
  initialDispositions,
}: Readonly<{
  leaseId: string;
  sourceHash: string;
  ownerUid: string;
  initialDispositions: RenewalDiscrepancyDisposition[];
}>) {
  const [dispositions, setDispositions] = useState(initialDispositions);
  const [sheetRowNumber, setSheetRowNumber] = useState("");
  const [field, setField] = useState("current_rent");
  const [category, setCategory] = useState("conflict");
  const [authoritativeSource, setAuthoritativeSource] = useState("not_determined");
  const [proposedCorrection, setProposedCorrection] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("waiting_on_client");
  const [evidenceRefs, setEvidenceRefs] = useState("");
  const [transactionKey, setTransactionKey] = useState("");
  const [currentRentDefinitionRef, setCurrentRentDefinitionRef] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setPending(true);
    setError("");
    const input = {
      lease_id: leaseId,
      sheet_row_number: Number(sheetRowNumber),
      source_hash: sourceHash,
      field,
      category,
      authoritative_source: authoritativeSource,
      proposed_correction: proposedCorrection,
      reason,
      owner_uid: ownerUid,
      status,
      evidence_refs: evidenceRefs
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
      ...(transactionKey ? { transaction_key: transactionKey } : {}),
      ...(currentRentDefinitionRef.trim()
        ? { current_rent_definition_ref: currentRentDefinitionRef.trim() }
        : {}),
    };
    try {
      const response = await fetch("/api/lease-renewal/discrepancy-dispositions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        disposition?: RenewalDiscrepancyDisposition;
        error?: string;
      };
      if (!response.ok || !payload.disposition) {
        throw new Error(payload.error ?? "Could not record the disposition.");
      }
      setDispositions((current) => [...current, payload.disposition!]);
      setReason("");
      setProposedCorrection("");
      setEvidenceRefs("");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not record the disposition.",
      );
    } finally {
      setPending(false);
    }
  }

  const requiresContract = status === "approved" || status === "completed";

  return (
    <article className="panel ui-stack" aria-labelledby="discrepancy-disposition-title">
      <div>
        <h2 id="discrepancy-disposition-title">Discrepancy disposition</h2>
        <p className="muted">
          Record which source should win and why. This is an audited decision record only;
          it cannot write RentVine or the operating Sheet.
        </p>
      </div>
      <form
        className="ui-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid two">
          <Field label="Exact Sheet row" htmlFor="disposition-sheet-row" required>
            <input
              id="disposition-sheet-row"
              min={1}
              onChange={(event) => setSheetRowNumber(event.target.value)}
              type="number"
              value={sheetRowNumber}
            />
          </Field>
          <Field label="Field" htmlFor="disposition-field" required>
            <input
              id="disposition-field"
              maxLength={100}
              onChange={(event) => setField(event.target.value)}
              value={field}
            />
          </Field>
          <Field label="Difference type" htmlFor="disposition-category">
            <select
              id="disposition-category"
              onChange={(event) => setCategory(event.target.value)}
              value={category}
            >
              <option value="conflict">Sources disagree</option>
              <option value="rentvine_only">RentVine only</option>
              <option value="sheet_only">Sheet only</option>
              <option value="missing">Missing in both</option>
              <option value="intentional_semantic_difference">
                Different on purpose
              </option>
              <option value="stale_snapshot">Read may be stale or expired</option>
              <option value="identity_ambiguous">Lease match unclear</option>
            </select>
          </Field>
          <Field label="Authoritative source" htmlFor="disposition-source">
            <select
              id="disposition-source"
              onChange={(event) => setAuthoritativeSource(event.target.value)}
              value={authoritativeSource}
            >
              <option value="not_determined">Not determined</option>
              <option value="rentvine">RentVine</option>
              <option value="operating_sheet">Operating Sheet</option>
              <option value="client_decision">Client decision</option>
            </select>
          </Field>
          <Field label="Status" htmlFor="disposition-status">
            <select
              id="disposition-status"
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              <option value="waiting_on_client">Waiting on client</option>
              <option value="proposed">Proposed</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </Field>
          {requiresContract ? (
            <Field label="Approved transaction" htmlFor="disposition-transaction">
              <select
                id="disposition-transaction"
                onChange={(event) => setTransactionKey(event.target.value)}
                value={transactionKey}
              >
                <option value="">Select one</option>
                <option value="rentvine.lease.renewal_dates.update">
                  RentVine renewal dates update
                </option>
                <option value="rentvine.lease.recurring_charge.update">
                  RentVine recurring charge update
                </option>
                <option value="rentvine.lease.recurring_charge.create">
                  RentVine recurring charge create
                </option>
                <option value="google_sheets.renewal_checklist.row_append">
                  Operating-Sheet row append
                </option>
                <option value="google_sheets.renewal_checklist.field_update">
                  Operating-Sheet field update
                </option>
              </select>
            </Field>
          ) : null}
        </div>
        <Field label="Proposed correction" htmlFor="disposition-correction" required>
          <textarea
            id="disposition-correction"
            maxLength={2000}
            onChange={(event) => setProposedCorrection(event.target.value)}
            rows={3}
            value={proposedCorrection}
          />
        </Field>
        <Field label="Reason" htmlFor="disposition-reason" required>
          <textarea
            id="disposition-reason"
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            value={reason}
          />
        </Field>
        <Field label="Evidence references (one per line)" htmlFor="disposition-evidence">
          <textarea
            id="disposition-evidence"
            onChange={(event) => setEvidenceRefs(event.target.value)}
            rows={2}
            value={evidenceRefs}
          />
        </Field>
        {field === "current_rent" ? (
          <Field
            label="Client-approved current-rent definition reference"
            htmlFor="disposition-rent-definition"
          >
            <input
              id="disposition-rent-definition"
              onChange={(event) => setCurrentRentDefinitionRef(event.target.value)}
              value={currentRentDefinitionRef}
            />
          </Field>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <Button
          disabled={
            pending ||
            !Number.isInteger(Number(sheetRowNumber)) ||
            Number(sheetRowNumber) < 1 ||
            !proposedCorrection.trim() ||
            reason.trim().length < 3
          }
          type="submit"
        >
          {pending ? "Recording…" : "Record disposition"}
        </Button>
      </form>
      {dispositions.length ? (
        <div className="ui-stack">
          <h3>Audit history</h3>
          <ul className="ui-rows">
            {dispositions.map((item) => (
              <li className="ui-stack-tight" key={item.versionId}>
                <strong>
                  {item.field} · {item.status} · version {item.version}
                </strong>
                <span>
                  Source: {item.authoritativeSource}; owner: {item.ownerUid}
                </span>
                <span className="muted">{item.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted">No disposition has been recorded for this lease.</p>
      )}
    </article>
  );
}
