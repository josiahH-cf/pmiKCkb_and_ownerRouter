"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field } from "@/components/ui";
import { useRenewalManualWorkspace } from "./RenewalManualWorkspace";
import {
  chargeDateIso,
  type RenewalChargeInventory,
} from "@/lib/lease-renewal/writeback/charge-inventory-model";
function usDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${month}/${day}/${year}`;
}
export function RenewalFutureRent({
  initialInventory,
  initialPreviewHash,
}: {
  initialInventory: RenewalChargeInventory | null;
  initialPreviewHash: string | null;
}) {
  const context = useRenewalManualWorkspace(),
    id = useId(),
    router = useRouter();
  const [inventory, setInventory] = useState(initialInventory),
    [operation, setOperation] = useState("update_future"),
    [selected, setSelected] = useState(""),
    [review, setReview] = useState(""),
    [end, setEnd] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [pending, setPending] = useState(false),
    [notice, setNotice] = useState(""),
    [previewHash, setPreviewHash] = useState(initialPreviewHash);
  const state = context?.state,
    terms =
      state?.ownerResponse?.outcome === "approved_terms"
        ? state.ownerResponse.terms
        : null,
    charge = inventory?.charges.find(
      (entry) => entry.id === selected && entry.classification === "rent",
    );
  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/lease-renewal/rentvine-writeback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error ?? "The schedule could not be prepared.");
    return result;
  }
  async function run(work: () => Promise<void>) {
    setPending(true);
    setNotice("");
    try {
      await work();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The schedule response was unavailable.",
      );
    } finally {
      setPending(false);
    }
  }
  async function refresh() {
    if (!context) return;
    const result = await post({ operation: "options", leaseId: context.leaseId });
    if (!result.inventory) throw new Error("The charge inventory is unavailable.");
    setInventory(result.inventory);
    setReviewed(false);
    setNotice("Charge inventory reloaded. Review the schedule before preparing it.");
  }
  async function prepare() {
    if (!state || !terms || !charge || !review.trim() || !reviewed) return;
    const effect =
      operation === "end_current"
        ? {
            kind: "recurring_charge_update",
            chargeId: charge.id,
            changes: { endDate: usDate(end) },
          }
        : operation === "update_future"
          ? {
              kind: "recurring_charge_update",
              chargeId: charge.id,
              changes: { amount: terms.rent.toFixed(2) },
            }
          : {
              kind: "recurring_charge_create",
              create: {
                accountID: charge.accountId,
                amount: terms.rent.toFixed(2),
                description: charge.projection.description,
                dayDue: charge.projection.dayDue,
                frequency: charge.projection.frequency,
                startDate: usDate(terms.effectiveDate),
                endDate: usDate(terms.endDate),
              },
            };
    const result = await post({
      operation: "propose",
      leaseId: state.leaseId,
      businessIntent: "future_rent",
      expectedPriorPreviewHash: previewHash,
      evidenceRef: review,
      renewalContext: {
        cycleId: state.cycleId,
        termsRevision: state.termsRevision,
        scheduleReview: review,
      },
      effects: [effect],
    });
    if (!result.proposal?.preview_hash)
      throw new Error(
        "No current schedule preview was saved. Check the connection and reload.",
      );
    setPreviewHash(result.proposal.preview_hash);
    setReviewed(false);
    setNotice(
      "Future schedule preview saved. An Admin must separately confirm this exact RentVine effect below. Current Sheet rent is unchanged.",
    );
    router.refresh();
  }
  if (!context) return null;
  return (
    <details>
      <summary>Prepare future approved rent in RentVine</summary>
      <div className="ui-stack">
        {!terms ? (
          <p>
            <a href="#renewal-manual-owner_response">
              Record explicit owner approval of the exact amount and dates first.
            </a>
          </p>
        ) : (
          <>
            <p>
              Approved monthly base rent: {terms.rent.toFixed(2)} · effective{" "}
              {terms.effectiveDate} · term end {terms.endDate}. Current Sheet rent is
              unchanged.
            </p>
            <Button
              variant="secondary"
              disabled={pending || context.pending}
              onClick={() => void run(refresh)}
            >
              Reload RentVine billing schedules
            </Button>
            <Field htmlFor={`${id}-operation`} label="Future-rent schedule operation">
              <select
                id={`${id}-operation`}
                value={operation}
                onChange={(event) => {
                  setOperation(event.target.value);
                  setSelected("");
                  setReviewed(false);
                }}
              >
                <option value="update_future">
                  Correct the amount of an existing future rent charge
                </option>
                <option value="end_current">
                  Change a dated current rent charge’s end, separately
                </option>
                <option value="create_future">
                  Create the approved future charge from a reviewed rent billing schedule
                </option>
              </select>
            </Field>
            <Field htmlFor={`${id}-charge`} label="Reviewed rent billing schedule">
              <select
                id={`${id}-charge`}
                value={selected}
                onChange={(event) => {
                  setSelected(event.target.value);
                  setReviewed(false);
                  const charge = inventory?.charges.find(
                    (entry) => entry.id === event.target.value,
                  );
                  setEnd(chargeDateIso(charge?.projection.endDate ?? null) ?? "");
                }}
              >
                <option value="">Choose an observed rent-account charge</option>
                {inventory?.charges
                  .filter(
                    (entry) =>
                      entry.classification === "rent" &&
                      (operation === "end_current"
                        ? entry.current === true
                        : operation === "update_future"
                          ? entry.projection.recurringStatusID === 2 &&
                            chargeDateIso(entry.projection.startDate) ===
                              terms.effectiveDate
                          : true),
                  )
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.accountLabel ?? entry.projection.description}:{" "}
                      {entry.projection.amount} · {entry.projection.startDate} to{" "}
                      {entry.projection.endDate ?? "open-ended"}
                    </option>
                  ))}
              </select>
            </Field>
            {operation === "end_current" ? (
              <>
                <Field htmlFor={`${id}-end`} label="Reviewed current-charge end date">
                  <input
                    id={`${id}-end`}
                    type="date"
                    value={end}
                    onChange={(event) => {
                      setEnd(event.target.value);
                      setReviewed(false);
                    }}
                  />
                </Field>
                <p>
                  An open-ended charge cannot gain an end date through the existing
                  reversible contract. Review that exact change in RentVine, then reload.
                  No date is inferred automatically.
                </p>
              </>
            ) : null}
            {charge ? (
              <p>
                Billing description: {charge.projection.description}. Due on day{" "}
                {charge.projection.dayDue}, every {charge.projection.frequency} month(s).{" "}
                {operation === "create_future"
                  ? "These observed billing settings will carry into this exact new charge preview."
                  : "Untouched billing settings remain as read."}
              </p>
            ) : null}
            <p>
              Review every rent schedule below. Resolve overlaps and check gaps and
              end-date boundaries in the provider; the app does not assume whether an end
              date bills that day. Each end/change and create is separately confirmed,
              receipted and read back. A completed first effect is not undone if a later
              effect is unavailable.
            </p>
            <ul>
              {inventory?.charges
                .filter((entry) => entry.classification !== "non_rent")
                .map((entry) => (
                  <li key={entry.id}>
                    {entry.accountLabel ?? entry.projection.description} ·{" "}
                    {entry.projection.amount} · {entry.projection.startDate} to{" "}
                    {entry.projection.endDate ?? "open-ended"}
                    {entry.classification === "unknown"
                      ? ": account classification needs verification"
                      : ""}
                  </li>
                ))}
            </ul>
            <Field htmlFor={`${id}-review`} label="Schedule review source">
              <input
                id={`${id}-review`}
                maxLength={240}
                value={review}
                onChange={(event) => {
                  setReview(event.target.value);
                  setReviewed(false);
                }}
              />
            </Field>
            <label>
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
              />
              I checked the approved amount, effective dates, all rent schedules, gaps and
              provider end-date boundaries for this one operation.
            </label>
            <Button
              disabled={
                pending ||
                context.pending ||
                !charge ||
                !review.trim() ||
                !reviewed ||
                (operation === "end_current" && (!end || !charge.projection.endDate))
              }
              onClick={() => void run(prepare)}
            >
              Prepare this future-rent preview
            </Button>
          </>
        )}
        {notice ? (
          <p role="status">
            {notice} <a href="#rentvine-updates-title">Review RentVine results</a>
          </p>
        ) : null}
      </div>
    </details>
  );
}
