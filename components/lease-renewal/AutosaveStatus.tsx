"use client";

// S155: the one saving / saved / failed indicator shown beside autosaved work. "Saved" is shown
// only after the server confirmed and returned the stored value. A failure keeps the entered value
// in its control and offers the same save again.

import { Button } from "@/components/ui";

export type AutosaveState =
  | { readonly phase: "idle" }
  | { readonly phase: "saving" }
  | { readonly phase: "saved" }
  | {
      readonly phase: "failed";
      readonly message: string;
      /** True when another operator changed the same value first. */
      readonly conflict?: boolean;
    };

export const AUTOSAVE_IDLE: AutosaveState = Object.freeze({ phase: "idle" });

export function AutosaveStatus({
  state,
  onRetry,
  subject,
}: Readonly<{
  state: AutosaveState;
  /** Saves the same entered value again. Omitted when the control retries on its own. */
  onRetry?: () => void;
  /** What was saved, for the accessible label (for example "Working current rent"). */
  subject: string;
}>) {
  return (
    <span
      aria-live="polite"
      className="autosave-status"
      data-autosave={state.phase}
      role="status"
    >
      {state.phase === "saving" ? `Saving ${subject.toLowerCase()}` : null}
      {state.phase === "saved" ? "Saved" : null}
      {state.phase === "failed" ? (
        <>
          <span className="autosave-status-error">
            {state.conflict ? "Changed elsewhere. " : "Save failed. "}
            {state.message} Your entry is kept.
          </span>
          {onRetry ? (
            <Button onClick={onRetry} size="compact" variant="tertiary">
              {state.conflict ? "Save my entry" : "Try again"}
            </Button>
          ) : null}
        </>
      ) : null}
    </span>
  );
}
