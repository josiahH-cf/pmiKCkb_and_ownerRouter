"use client";

// S115: the small contrasting `i` control beside a renewal heading. It reuses the shared InfoTip
// (hover after 600 ms on a fine pointer, focus, click and touch open it; Escape closes and returns
// focus) over pure help content. It never reads or writes application state: opening help issues
// no request and records nothing.

import type { SyntheticEvent } from "react";

import { InfoTip } from "@/components/ui";
import { SECTION_HELP, type SectionHelpId } from "@/lib/lease-renewal/section-help";

export function RenewalSectionHelp({
  id,
  inSummary = false,
}: Readonly<{ id: SectionHelpId; inSummary?: boolean }>) {
  const help = SECTION_HELP[id];
  return (
    <span
      className="renewal-section-help"
      onClick={inSummary ? stopSummaryToggle : undefined}
    >
      <InfoTip interactive label={help.label} content={<SectionHelpContent id={id} />} />
    </span>
  );
}

function SectionHelpContent({ id }: Readonly<{ id: SectionHelpId }>) {
  const help = SECTION_HELP[id];
  return (
    <div className="renewal-section-help-body ui-stack-tight">
      <p>{help.purpose}</p>
      {help.steps ? (
        <ol className="renewal-section-help-steps">
          {help.steps.map((step, index) => (
            <li key={step}>
              <strong>Step {index + 1}.</strong> {step}
            </li>
          ))}
        </ol>
      ) : null}
      <p>
        <strong>Saves:</strong> {help.saves}
      </p>
      <p>
        <strong>Does not:</strong> {help.notDone}
      </p>
      {help.next ? (
        <p>
          <strong>Next:</strong>{" "}
          {help.next.targetId ? (
            <a className="text-link" href={`#${help.next.targetId}`}>
              {help.next.label}
            </a>
          ) : (
            help.next.label
          )}
        </p>
      ) : null}
    </div>
  );
}

// A `<summary>` toggles its `<details>` on click. The help trigger inside one must open help
// only, so the wrapper stops the summary from seeing the click as a toggle.
function stopSummaryToggle(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}
