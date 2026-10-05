"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { formatCalendarDate, formatSourceCalendarDate } from "@/lib/date-display";

import { RenewalSectionHelp } from "@/components/lease-renewal/RenewalSectionHelp";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field } from "@/components/ui";
import { useRenewalManualWorkspace } from "./RenewalManualWorkspace";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { effectiveRenewalTerms } from "@/lib/lease-renewal/effective-terms";
import { planRentChargeRequests } from "@/lib/lease-renewal/rent-charge-intent";
import {
  chargeDateIso,
  type RenewalChargeInventory,
} from "@/lib/lease-renewal/writeback/charge-inventory-model";

// S156/S160: the future renewal rent is prepared from the working renewal terms, beside them, by
// the staff member doing the work. No owner-approval, tenant-acceptance or attestation step sits
// in front of the preview; the exact RentVine effect is still confirmed separately, once.
export function RenewalFutureRent({
  initialInventory,
  initialPreviewHash,
}: {
  initialInventory: RenewalChargeInventory | null;
  initialPreviewHash: string | null;
}) {
  const context = useRenewalManualWorkspace(),
    working = useRenewalWorkingRecord(),
    id = useId(),
    router = useRouter();
  const [inventory, setInventory] = useState(initialInventory),
    [operation, setOperation] = useState("update_future"),
    [selected, setSelected] = useState(""),
    [review, setReview] = useState(""),
    [end, setEnd] = useState(""),
    [pending, setPending] = useState(false),
    [notice, setNotice] = useState(""),
    [previewHash, setPreviewHash] = useState(initialPreviewHash);
  const state = context?.state ?? null,
    current = effectiveRenewalTerms(working?.record ?? null, state),
    terms = current.complete,
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
    setNotice("Charge inventory reloaded.");
  }
  async function prepare() {
    if (!context || !terms || !charge) return;
    // S117 (ARCH-S117-1): one typed *future* intent; the mapper cannot emit a Sheet body or a
    // current-base correction.
    const [plan] = planRentChargeRequests(
      {
        scope: "future",
        operation:
          operation === "end_current"
            ? "end_current"
            : operation === "update_future"
              ? "update_future"
              : "create_future",
        chargeId: charge.id,
        terms,
        ...(review.trim() ? { scheduleReview: review.trim() } : {}),
        ...(operation === "end_current" && end ? { currentChargeEndDate: end } : {}),
      },
      {
        leaseId: context.leaseId,
        workspaceContext: null,
        sheetRowAvailable: false,
        priorHashes: { sheet: null, rentvine: previewHash },
        inventory,
      },
    );
    if (!plan || "refusal" in plan)
      throw new Error(plan?.refusal ?? "The schedule could not be prepared.");
    const result = await post(plan.body);
    if (!result.proposal?.preview_hash)
      throw new Error(
        "No current schedule preview was saved. Check the connection and reload.",
      );
    setPreviewHash(result.proposal.preview_hash);
    setNotice(
      "Future schedule preview saved. Confirm this exact RentVine effect below. Current billing and the current Sheet rent are unchanged.",
    );
    router.refresh();
  }
  if (!context) return null;
  return (
    <details>
      <summary>
        Prepare future renewal rent in RentVine{" "}
        <RenewalSectionHelp id="future-rent" inSummary />
      </summary>
      <div className="ui-stack">
        {!terms ? (
          <p>
            <a href="#renewal-working-terms">
              Enter {current.missing.join(", ")} in Working renewal terms
            </a>{" "}
            to prepare this preview. Everything else on this lease stays available.
          </p>
        ) : (
          <>
            <p>
              Working renewal rent: {terms.rent.toFixed(2)} · effective{" "}
              {formatCalendarDate(terms.effectiveDate)} · term end{" "}
              {formatCalendarDate(terms.endDate)}. Current billing and the current Sheet
              rent are unchanged before the effective date.
            </p>
            <Button
              variant="secondary"
              disabled={pending}
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
                }}
              >
                <option value="update_future">
                  Correct the amount of an existing future rent charge
                </option>
                <option value="end_current">
                  Change a dated current rent charge’s end, separately
                </option>
                <option value="create_future">
                  Create the future charge from an existing rent billing schedule
                </option>
              </select>
            </Field>
            <Field htmlFor={`${id}-charge`} label="Rent billing schedule" required>
              <select
                id={`${id}-charge`}
                value={selected}
                onChange={(event) => {
                  setSelected(event.target.value);
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
                      {entry.projection.amount} ·{" "}
                      {formatSourceCalendarDate(entry.projection.startDate)} to{" "}
                      {formatSourceCalendarDate(entry.projection.endDate, "open-ended")}
                    </option>
                  ))}
              </select>
            </Field>
            {operation === "end_current" ? (
              <>
                <Field htmlFor={`${id}-end`} label="Current-charge end date" required>
                  <input
                    id={`${id}-end`}
                    type="date"
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                  />
                </Field>
                <p>
                  An open-ended charge cannot gain an end date through the existing
                  reversible contract. Make that exact change in RentVine, then reload. No
                  date is inferred automatically.
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
              Each charge change needs its own confirmation and readback. Completed
              effects remain recorded if a later effect is unavailable. End-date billing
              boundaries require review.
            </p>
            <ul>
              {inventory?.charges
                .filter((entry) => entry.classification !== "non_rent")
                .map((entry) => (
                  <li key={entry.id}>
                    {entry.accountLabel ?? entry.projection.description} ·{" "}
                    {entry.projection.amount} ·{" "}
                    {formatSourceCalendarDate(entry.projection.startDate)} to{" "}
                    {formatSourceCalendarDate(entry.projection.endDate, "open-ended")}
                    {entry.classification === "unknown"
                      ? ": account classification needs verification"
                      : ""}
                  </li>
                ))}
            </ul>
            <Field htmlFor={`${id}-review`} label="Context for this preview (optional)">
              <input
                id={`${id}-review`}
                maxLength={240}
                value={review}
                onChange={(event) => setReview(event.target.value)}
              />
            </Field>
            <Button
              disabled={
                pending ||
                !charge ||
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
