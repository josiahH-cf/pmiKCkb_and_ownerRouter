"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { DataTableFrame } from "@/components/ui/DataTableFrame";

import { useState } from "react";

import { Button, ConfirmationDialog, Field } from "@/components/ui";
import { formatCalendarDate } from "@/lib/date-display";
import {
  formatPreapprovalAmount,
  type MaintenancePropertyPreapproval,
} from "@/lib/maintenance/property-preapproval";
import type {
  PreapprovalImportAction,
  PreapprovalImportPlan,
  PreapprovalImportSkipReason,
} from "@/lib/maintenance/rentvine-preapproval-import";

const SKIP_TEXT: Readonly<Record<PreapprovalImportSkipReason, string>> = {
  invalid_amount: "RentVine's maintenance limit is not a plain dollar amount.",
  above_app_limit: "RentVine's maintenance limit is above the app's preapproval limit.",
  duplicate_property: "RentVine lists this property more than once.",
  invalid_property: "RentVine's property identifier is not an exact number.",
};

const ACTION_TEXT: Readonly<Record<PreapprovalImportAction, string>> = {
  add: "Add",
  update: "Change amount",
  unchanged: "Already matches",
};

function todayIsoDate(): string {
  const now = new Date();
  return [
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * S108 amendment (owner decision 2026-10-01, B-MNT1): preview RentVine's per-property maintenance
 * limits and record them as preapprovals in one confirmed step. The preview is read-only. The
 * confirmation sends only the preview's hash and the effective date; the server re-reads RentVine and
 * records nothing unless the plan is still exactly the one shown here.
 */
export function MaintenancePreapprovalImport({
  onRecorded,
}: Readonly<{
  onRecorded: (records: readonly MaintenancePropertyPreapproval[]) => void;
}>) {
  const [plan, setPlan] = useState<PreapprovalImportPlan | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(todayIsoDate);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function preview() {
    setPending(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch(
        "/api/maintenance/property-preapprovals/rentvine-import",
        {
          headers: { accept: "application/json" },
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        plan?: PreapprovalImportPlan;
      };
      if (!response.ok || !payload.plan) {
        throw new Error(
          payload.error ?? "The RentVine preview is unavailable right now.",
        );
      }
      setPlan(payload.plan);
    } catch (caught) {
      setPlan(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "The RentVine preview is unavailable right now.",
      );
    } finally {
      setPending(false);
    }
  }

  async function record() {
    if (!plan) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        "/api/maintenance/property-preapprovals/rentvine-import",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            plan_hash: plan.planHash,
            effective_from: effectiveFrom,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        recorded?: number;
        preapprovals?: MaintenancePropertyPreapproval[];
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "The preapprovals could not be recorded.");
      }
      const records = payload.preapprovals ?? [];
      onRecorded(records);
      setStatus(
        `Recorded ${records.length} ${records.length === 1 ? "preapproval" : "preapprovals"} from RentVine.`,
      );
      setConfirming(false);
      setPlan(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The preapprovals could not be recorded.",
      );
    } finally {
      setPending(false);
    }
  }

  const changes = plan ? plan.rows.filter((row) => row.action !== "unchanged") : [];
  const added = changes.filter((row) => row.action === "add").length;
  const unchanged = plan ? plan.rows.length - changes.length : 0;
  const withNotes = changes.filter((row) => row.maintenanceNotes).length;

  return (
    <section aria-labelledby="preapproval-import-heading" className="ui-rows">
      <h3 id="preapproval-import-heading">Import from RentVine</h3>
      <p className="muted">
        RentVine keeps a maintenance limit on some properties. Preview those limits, then
        record them here as preapprovals in one confirmed step. A property without a
        RentVine limit keeps its current preapproval.
      </p>
      <div>
        <Button disabled={pending} onClick={() => void preview()} variant="secondary">
          {plan ? "Preview again" : "Preview RentVine maintenance limits"}
        </Button>
      </div>
      {plan ? (
        <>
          <p role="status">
            Read {plan.propertiesRead} RentVine properties: {added} to add,{" "}
            {changes.length - added} to change, {unchanged} already{" "}
            {unchanged === 1 ? "matches" : "match"}.
          </p>
          {plan.rows.length > 0 ? (
            <DataTableFrame
              surface="maintenance-import"
              label="Maintenance preapproval preview"
            >
              <table>
                <caption className="sr-only">
                  RentVine maintenance limits with each property&apos;s current
                  preapproval and the change this import records.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Property</th>
                    <th scope="col">RentVine limit</th>
                    <th scope="col">Recorded now</th>
                    <th scope="col">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((row) => (
                    <tr key={row.propertyKey}>
                      <th scope="row">
                        {row.label}
                        <span className="muted">
                          {" "}
                          (RentVine property {row.propertyKey})
                        </span>
                        {row.maintenanceNotes ? (
                          <span className="muted">
                            <br />
                            RentVine maintenance notes: {row.maintenanceNotes}
                          </span>
                        ) : null}
                      </th>
                      <td>{formatPreapprovalAmount(row.amountCents)}</td>
                      <td>
                        {row.currentAmountCents === null
                          ? "None"
                          : formatPreapprovalAmount(row.currentAmountCents)}
                      </td>
                      <td>{ACTION_TEXT[row.action]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableFrame>
          ) : (
            <p className="muted">No RentVine property carries a maintenance limit.</p>
          )}
          {plan.skipped.length > 0 ? (
            <div>
              <p>Left for manual review:</p>
              <ul>
                {plan.skipped.map((skip) => (
                  <li key={`${skip.propertyKey}-${skip.reason}`}>
                    {skip.label}: {SKIP_TEXT[skip.reason]}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {changes.length > 0 ? (
            <>
              <Field
                hint={effectiveFrom ? formatCalendarDate(effectiveFrom) : "MM/DD/YYYY"}
                htmlFor="preapproval-import-effective"
                label="Effective from"
              >
                <input
                  id="preapproval-import-effective"
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                  type="date"
                  value={effectiveFrom}
                />
              </Field>
              <div>
                <Button
                  disabled={pending || !effectiveFrom}
                  onClick={() => setConfirming(true)}
                >
                  Review the import
                </Button>
              </div>
            </>
          ) : null}
        </>
      ) : null}
      <ConfirmationDialog
        busy={pending}
        busyLabel="Recording"
        confirmLabel="Record these preapprovals"
        description={
          <>
            Record {changes.length}{" "}
            {changes.length === 1 ? "preapproval" : "preapprovals"} from RentVine,
            effective {effectiveFrom ? formatCalendarDate(effectiveFrom) : ""}. Work at or
            under each amount then proceeds without asking the owner again.
            {withNotes > 0
              ? ` ${withNotes} of these properties have RentVine maintenance notes shown in the preview.`
              : ""}
          </>
        }
        error={error || null}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void record()}
        open={confirming}
        title="Record these preapprovals"
      />
      {error && !confirming ? <p role="alert">{error}</p> : null}
      {status ? <p className="muted">{status}</p> : null}
    </section>
  );
}
