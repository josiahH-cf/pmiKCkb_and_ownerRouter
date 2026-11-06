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
import { standingRuleBasis } from "@/lib/lease-renewal/standing-agreement";
import { SourceUpdatePreview } from "./SourceUpdatePreview";

export const FINISH_UP_WORDS = {
  heading: "Source updates from the final terms",
  apply: "Review and apply in Rent and charges",
  each: "Each update is applied on its own: prepare its exact update in Rent and charges, confirm it once, and the provider's receipt is read back.",
  changed:
    "The working renewal terms changed after these previews were assembled. Reload the lease to assemble them from the current terms.",
} as const;

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function Section({
  label,
  section,
  applyTarget,
}: Readonly<{
  label: string;
  section: FinishUpSourceSection;
  applyTarget: string;
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
      {section.state === "ready" ? (
        <p>
          <Button
            onClick={() => focusRenewalDashboardControl(applyTarget)}
            size="compact"
            variant="secondary"
          >
            {FINISH_UP_WORDS.apply}
          </Button>
        </p>
      ) : null}
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
          {preparation.rentvine ? (
            <Section
              applyTarget={preparation.applyTarget}
              label="RentVine"
              section={preparation.rentvine}
            />
          ) : null}
          {preparation.sheet ? (
            <Section
              applyTarget={preparation.applyTarget}
              label="Operating Sheet"
              section={preparation.sheet}
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
