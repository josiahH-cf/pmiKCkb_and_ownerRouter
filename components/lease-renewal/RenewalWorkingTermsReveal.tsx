"use client";

// S270 (Fixed disclosure placement, Ask the owner): "Keep the one Working renewal terms editor in
// this outcome, with its own named reveal when dates are not active." In the outcome layout the one
// Working renewal terms editor (S263's verified current lease end, the working dates with the
// next-day start, and the way back to a tenant offer) is a named reveal in Ask the owner's Work,
// in the owner message card above the options group. It is closed while the dates are not the
// active work. It opens as current work for an exact date fix ("Enter renewal start date" or
// "Enter renewal end date": the Guided lead or the offer's fix, which focus the date and open
// it), while a date fix that started in Offer the tenant waits for "Return to tenant offer", and
// while a date save is pending or failed. Opening it saves, sends and looks up nothing.

//
// S281 R-S281-14 (ARCH-S281-5): the editor is mounted once on a page. While the Guided view has it
// open in place on Offer the tenant, this reveal mounts no second one; Full view keeps it here.

import { useRef } from "react";

import { useDateFixReturn } from "./RenewalDateProposal";
import { useRenewalFocusView } from "./RenewalFocusViewContext";
import { useNamedDisclosure } from "./RenewalGuidedView";
import { WorkingRenewalTermsFields } from "./RenewalManualWorkspace";
import { RenewalSectionHelp } from "./RenewalSectionHelp";

export const WORKING_TERMS_REVEAL_LABEL = "Working renewal terms";

export function RenewalWorkingTermsReveal() {
  const view = useRenewalFocusView();
  const onOffer = view?.view === "guided" && view.workingTermsOnOffer;
  return onOffer ? null : <WorkingTermsReveal />;
}

function WorkingTermsReveal() {
  const ref = useRef<HTMLDetailsElement | null>(null);
  const pendingReturn = useDateFixReturn();
  const promoted = useNamedDisclosure(ref, {
    stepId: "ask-owner",
    held: pendingReturn ? "date-fix-return" : null,
  });
  return (
    <details
      className="renewal-working-terms"
      data-renewal-promoted={promoted ?? undefined}
      data-renewal-working-terms
      ref={ref}
    >
      <summary>
        {WORKING_TERMS_REVEAL_LABEL} <RenewalSectionHelp id="working-terms" inSummary />
      </summary>
      <div className="ui-stack" id="renewal-working-terms">
        <WorkingRenewalTermsFields rent={false} />
      </div>
    </details>
  );
}
