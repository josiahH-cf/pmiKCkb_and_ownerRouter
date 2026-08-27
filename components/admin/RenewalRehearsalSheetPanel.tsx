"use client";

import { useId, useState } from "react";

import { Button, Field } from "@/components/ui";
import type { RenewalRehearsalSheetAdminConfig } from "@/lib/firestore/renewal-rehearsal-sheet-config";
import { DISCREPANCY_GUIDE } from "@/lib/lease-renewal/discrepancy";

/** Admin-only copy binding. Saving config never invokes the Sheets provider or the proof. */
export function RenewalRehearsalSheetPanel({
  initialConfig,
  unavailableNote,
}: Readonly<{
  initialConfig: RenewalRehearsalSheetAdminConfig;
  unavailableNote?: string;
}>) {
  const fieldId = useId();
  const [config, setConfig] = useState(initialConfig);
  const [spreadsheet, setSpreadsheet] = useState(
    initialConfig.rehearsal.configured ? initialConfig.rehearsal.spreadsheetId : "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    setPending(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/admin/renewal-rehearsal-sheet", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spreadsheet }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        config?: RenewalRehearsalSheetAdminConfig;
        error?: string;
      };
      if (!response.ok || !payload.config) {
        throw new Error(payload.error ?? "Could not save the rehearsal copy.");
      }
      setConfig(payload.config);
      setSpreadsheet(
        payload.config.rehearsal.configured ? payload.config.rehearsal.spreadsheetId : "",
      );
      setSaved(true);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save the rehearsal copy.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="panel" aria-labelledby="renewal-sheet-bindings-title">
      <h2 id="renewal-sheet-bindings-title">Renewal Sheet connections</h2>
      <p className="muted">
        The operating Sheet remains view-only. A separate copy is required for the
        explicit write/read/undo proof.
      </p>
      {unavailableNote ? <p className="status-warning">{unavailableNote}</p> : null}
      <div className="grid two">
        <section>
          <h3>Operating Sheet</h3>
          {config.operating.configured ? (
            <p>
              <a href={config.operating.url} target="_blank" rel="noreferrer noopener">
                Open the operating renewal Sheet (view only)
              </a>
            </p>
          ) : (
            <p className="status-warning">Operating Sheet is not configured.</p>
          )}
          <p className="muted">This Admin control can never run a write test.</p>
        </section>
        <section>
          <h3>Rehearsal copy</h3>
          {config.rehearsal.configured ? (
            <>
              <p>
                <a href={config.rehearsal.url} target="_blank" rel="noreferrer noopener">
                  Open the rehearsal copy
                </a>
              </p>
              <p className="status-success">
                Separate copy configured from {config.rehearsal.source}.
              </p>
            </>
          ) : (
            <p className="status-warning">
              No rehearsal copy is configured. Make a verbatim copy and paste its link
              below.
            </p>
          )}
          <form
            className="ui-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Field
              error={error || undefined}
              hint="Paste a docs.google.com Sheet URL or its spreadsheet ID. The operating Sheet is refused."
              htmlFor={fieldId}
              label="Rehearsal copy link or ID"
              required
            >
              <input
                id={fieldId}
                name="renewal-rehearsal-sheet"
                onChange={(event) => {
                  setSpreadsheet(event.target.value);
                  setSaved(false);
                }}
                value={spreadsheet}
              />
            </Field>
            <Button disabled={pending || !spreadsheet.trim()} type="submit">
              {pending ? "Saving…" : "Save rehearsal copy"}
            </Button>
            {saved ? (
              <span className="muted" role="status">
                Saved. No Sheet contents were read or changed.
              </span>
            ) : null}
          </form>
          <p className="muted">
            The proof is a separate explicit operation. It requires a blank exact cell,
            preview, exact confirmation, one synthetic marker, readback, exact clear, and
            final blank readback.
          </p>
        </section>
      </div>
      <details>
        <summary>How we classify RentVine ↔ Sheet differences</summary>
        <div className="grid two">
          {DISCREPANCY_GUIDE.map((entry) => (
            <section key={entry.category}>
              <h3>{entry.label}</h3>
              <p>{entry.meaning}</p>
              <p className="muted">Example: {entry.syntheticExample}</p>
              <p>
                <strong>Next:</strong> {entry.nextStep}
              </p>
            </section>
          ))}
        </div>
      </details>
    </article>
  );
}
