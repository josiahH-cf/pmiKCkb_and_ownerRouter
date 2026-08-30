// Stepper — a purely presentational/server-safe ordered workflow. Pass the steps and current index;
// each step renders done (✓) / current / upcoming from its position.

import type { ReactNode } from "react";

export interface StepDescriptor {
  id: string;
  label: string;
  meta?: ReactNode;
}

type StepState = "done" | "current" | "upcoming";

export function Stepper({
  steps,
  currentIndex,
}: Readonly<{ steps: readonly StepDescriptor[]; currentIndex: number }>) {
  return (
    <ol className="ui-stepper">
      {steps.map((step, index) => {
        const state: StepState =
          index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";

        return (
          <li
            aria-current={state === "current" ? "step" : undefined}
            className="ui-step"
            data-state={state}
            key={step.id}
          >
            <span aria-hidden="true" className="ui-step-index">
              {state === "done" ? "✓" : index + 1}
            </span>
            <span>
              <span className="sr-only">
                {state === "done"
                  ? "Completed: "
                  : state === "current"
                    ? "Current step: "
                    : "Upcoming: "}
              </span>
              <span className="ui-step-label">{step.label}</span>
              {step.meta ? <span className="ui-step-meta muted">{step.meta}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
