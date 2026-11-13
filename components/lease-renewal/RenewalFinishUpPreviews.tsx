"use client";

// S249 R-S249-14 / BEH-S249-6 / L42: on Finish up, the RentVine and operating Sheet updates the
// final working terms call for, shown as the exact previews their confirmation shows. Showing
// them reads and writes nothing. Each update is applied through its existing control in Rent and
// charges, which prepares the exact update, asks for its own confirmation, claims its one attempt
// and reads the provider's receipt back.

import { Button } from "@/components/ui";
import { formatCalendarDate } from "@/lib/date-display";
import { effectiveRenewalTerms } from "@/lib/lease-renewal/effective-terms";
import type {
  FinishUpPreparation,
  FinishUpSourceSection,
} from "@/lib/lease-renewal/finish-up-preparation";
import { focusRenewalDashboardControl } from "./RenewalDashboardNavigation";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { useRenewalPricingPolicy } from "./RenewalPricingPolicy";
import { WorkingBaseBasisLine } from "./RenewalRentBasis";
import { standingRuleBasis } from "@/lib/lease-renewal/standing-agreement";
import {
  TENANT_ACCEPTANCE_HOLD_WORDS,
  TENANT_RESPONSE_TARGET,
  type TenantAcceptanceHold,
} from "@/lib/lease-renewal/tenant-acceptance-hold";
import { SourceUpdatePreview } from "./SourceUpdatePreview";
import { useLiveAcceptanceHold } from "./useLiveSourceUpdateBasis";
import { requestSourceFormPrefill, type SourceFormPrefill } from "./sourceFormPrefill";
import type { CompleteRenewalTerms } from "@/lib/lease-renewal/working-record";

export const FINISH_UP_WORDS = {
  heading: "Source updates from the final terms",
  apply: "Review and apply in Rent and charges",
  each: "Review and apply opens each update's form in Rent and charges with the new value filled in from the working terms. Prepare its exact update there, confirm it, and the provider's receipt is read back.",
  changed:
    "The working renewal terms changed after these previews were assembled. Reload the lease to assemble them from the current terms.",
} as const;

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * S278 R-S278-2 (BEH-S278-3): the form a preview's action opens, with the previewed new value. The
 * renewal end date fills RentVine's "New end date" and the Sheet's "New value" for Renewal date.
 * The renewal rent is prepared by choosing its charge, so its action opens Rent and charges only.
 */
export function finishUpPrefill(
  key: string,
  terms: CompleteRenewalTerms | null,
): SourceFormPrefill | null {
  if (!terms) return null;
  if (key === "rentvine-dates")
    return { form: "rentvine_end_date", value: terms.endDate };
  if (key === "sheet-renewal_date")
    return { form: "sheet_field", field: "renewal_date", value: terms.endDate };
  return null;
}

/** Open the owning form in Rent and charges, filled with the previewed value when it has one. */
export function openFinishUpPreview(
  applyTarget: string,
  key: string,
  terms: CompleteRenewalTerms | null,
) {
  focusRenewalDashboardControl(applyTarget);
  const prefill = finishUpPrefill(key, terms);
  if (prefill) requestSourceFormPrefill(prefill);
}

function Section({
  label,
  section,
  applyTarget,
  hold,
  terms,
}: Readonly<{
  label: string;
  section: FinishUpSourceSection;
  applyTarget: string;
  /**
   * S264 R-S264-6: every update here carries the accepted renewal, so each waits; the notice
   * above the sections names the exact difference once.
   */
  hold: TenantAcceptanceHold | null;
  /** S278 R-S278-2: the final working terms the previews were assembled from. */
  terms: CompleteRenewalTerms | null;
}>) {
  return (
    <section
      aria-label={`${label} update preview`}
      className="ui-stack-tight renewal-finish-up-source"
      data-renewal-finish-up-source={section.state}
    >
      <h3>{label}</h3>
      {section.state === "unavailable" ? (
        <p className="muted">{section.line}.</p>
      ) : section.state === "current" ? (
        <p>{section.line}.</p>
      ) : (
        section.previews.map((preview) => (
          <div
            className="ui-stack-tight"
            data-renewal-finish-up-preview={preview.key}
            key={preview.key}
          >
            <p>
              <strong>{preview.title}</strong>
            </p>
            <SourceUpdatePreview facts={preview.facts} />
            {!hold ? (
              // S278 R-S278-2: each preview's action opens its owning form with the
              // previewed value filled in; the form's own preview and confirmation follow.
              <p>
                <Button
                  data-renewal-finish-up-apply={preview.key}
                  onClick={() => openFinishUpPreview(applyTarget, preview.key, terms)}
                  size="compact"
                  variant="secondary"
                >
                  {FINISH_UP_WORDS.apply}
                </Button>
              </p>
            ) : null}
          </div>
        ))
      )}
      {section.state !== "unavailable"
        ? section.notes.map((note) => (
            <p className="muted" key={note}>
              {note}.
            </p>
          ))
        : null}
    </section>
  );
}

export function FinishUpSourcePreviews({
  preparation,
}: Readonly<{ preparation: FinishUpPreparation }>) {
  const working = useRenewalWorkingRecord();
  const pricing = useRenewalPricingPolicy();
  // S250 R-S250-8: where the final rent is the standing agreement's rule, the previews name the
  // rule as their basis: the agreement still covers the lease, or the rent was adopted from it.
  const ruleBasis = standingRuleBasis(
    pricing?.view?.authority,
    working?.record?.fields.terms_rent ?? null,
  );
  const live = working
    ? effectiveRenewalTerms(working.record ?? null).complete
    : undefined;
  // S264 R-S264-6: the tenant message's live read first, then this page's read.
  const hold = useLiveAcceptanceHold(preparation.acceptance);
  const terms = preparation.terms;
  // The previews were assembled from the terms this page read; say so when they moved since.
  const changed =
    live !== undefined &&
    (live === null
      ? terms !== null
      : terms === null ||
        Math.abs(live.rent - terms.rent) >= 0.005 ||
        live.effectiveDate !== terms.effectiveDate ||
        live.endDate !== terms.endDate);
  return (
    <section
      aria-label={FINISH_UP_WORDS.heading}
      className="ui-stack-tight renewal-finish-up-previews"
      data-renewal-finish-up-previews={terms ? "assembled" : "waiting"}
    >
      <h3>{FINISH_UP_WORDS.heading}</h3>
      {terms ? (
        <>
          <p data-renewal-field="finish-up-terms">
            Final working terms: {money(terms.rent)} per month from{" "}
            {formatCalendarDate(terms.effectiveDate)} to{" "}
            {formatCalendarDate(terms.endDate)}.
          </p>
          {/* S277 R-S277-2: the final rent's basis, from the one projection. */}
          <WorkingBaseBasisLine amount={terms.rent} field="finish-up-rent-basis" />
          {ruleBasis ? (
            <p className="muted" data-renewal-field="finish-up-rule-basis">
              Basis for the rent: {ruleBasis}
            </p>
          ) : null}
          {changed ? (
            <p className="renewal-notice" role="note">
              {FINISH_UP_WORDS.changed}
            </p>
          ) : null}
          {hold ? (
            <div
              className="renewal-notice ui-stack-tight"
              data-renewal-field="finish-up-acceptance-hold"
              role="note"
            >
              <p>
                {hold.line} {TENANT_ACCEPTANCE_HOLD_WORDS.finishUp}
              </p>
              <p>
                <Button
                  onClick={() => focusRenewalDashboardControl(TENANT_RESPONSE_TARGET)}
                  size="compact"
                  variant="secondary"
                >
                  {TENANT_ACCEPTANCE_HOLD_WORDS.next}
                </Button>
              </p>
            </div>
          ) : null}
          {preparation.rentvine ? (
            <Section
              applyTarget={preparation.applyTarget}
              hold={hold}
              label="RentVine"
              section={preparation.rentvine}
              terms={terms}
            />
          ) : null}
          {preparation.sheet ? (
            <Section
              applyTarget={preparation.applyTarget}
              hold={hold}
              label="Operating Sheet"
              section={preparation.sheet}
              terms={terms}
            />
          ) : null}
          <p className="muted">{FINISH_UP_WORDS.each}</p>
        </>
      ) : (
        <p>
          The RentVine and operating Sheet update previews are assembled once the working
          renewal terms are final. Enter {preparation.termsMissing.join(", ")} in Working
          renewal terms.
        </p>
      )}
    </section>
  );
}
