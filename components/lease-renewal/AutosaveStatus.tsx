"use client";

// S155: the one edited / saving / saved / failed indicator shown beside autosaved work. "Edited"
// is shown while an entry differs from what is stored and no save has started. "Saved" is shown
// only after the server confirmed and returned the stored value. A failure keeps the entered value
// in its control and offers the same save again.

import { useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";

export type AutosaveState =
  | { readonly phase: "idle" }
  | { readonly phase: "edited" }
  | { readonly phase: "saving" }
  | { readonly phase: "saved" }
  | {
      readonly phase: "failed";
      readonly message: string;
      /** True when another operator changed the same value first. */
      readonly conflict?: boolean;
    };

export const AUTOSAVE_IDLE: AutosaveState = Object.freeze({ phase: "idle" });
export const AUTOSAVE_EDITED: AutosaveState = Object.freeze({ phase: "edited" });

/**
 * The state to show for a control that may hold an entry not stored yet. A save in flight or a
 * failure keeps its own wording; otherwise an unsaved entry says so.
 */
export function withEdited(state: AutosaveState, edited: boolean): AutosaveState {
  return edited && (state.phase === "idle" || state.phase === "saved")
    ? AUTOSAVE_EDITED
    : state;
}

export function AutosaveStatus({
  state,
  onRetry,
  subject,
  hideWhenIdle = false,
}: Readonly<{
  state: AutosaveState;
  /** Saves the same entered value again. Omitted when the control retries on its own. */
  onRetry?: () => void;
  /** What was saved, for the accessible label (for example "Working current rent"). */
  subject: string;
  /** Omit empty status markup while keeping an in-use retry mounted. */
  hideWhenIdle?: boolean;
}>) {
  // A blur save can start while Tab is moving from the input to its retry. Keep that
  // same button through the request, and until focus leaves it after success.
  const [retryShown, setRetryShown] = useState(state.phase === "failed");
  const [retryFocused, setRetryFocused] = useState(false);
  const retryButton = useRef<HTMLButtonElement>(null);
  const [retryConflict, setRetryConflict] = useState(
    state.phase === "failed" && state.conflict === true,
  );
  if (state.phase === "failed" && !retryShown) setRetryShown(true);
  if (state.phase === "failed" && retryConflict !== (state.conflict === true)) {
    setRetryConflict(state.conflict === true);
  }
  if (
    retryShown &&
    state.phase !== "failed" &&
    state.phase !== "saving" &&
    !retryFocused
  ) {
    setRetryShown(false);
  }
  useLayoutEffect(() => {
    if (!retryFocused) return;
    const button = retryButton.current;
    if (!button) return;
    function keepFocusedRetryVisible() {
      if (!button || !button.isConnected || document.activeElement !== button) return;
      const bounds = button.getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > window.innerHeight)
        button.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
    keepFocusedRetryVisible();
    // A saved record can also change the surrounding path in the same render cycle.
    const frame = window.requestAnimationFrame(keepFocusedRetryVisible);
    return () => window.cancelAnimationFrame(frame);
  }, [state.phase, retryFocused]);
  if (hideWhenIdle && state.phase === "idle" && !(onRetry && retryShown)) return null;
  return (
    <span
      aria-live="polite"
      className="autosave-status"
      data-autosave={state.phase}
      role="status"
    >
      {state.phase === "edited" ? "Edited, not saved yet" : null}
      {state.phase === "saving" ? `Saving ${subject.toLowerCase()}` : null}
      {state.phase === "saved" ? "Saved" : null}
      {state.phase === "failed" ? (
        <>
          <span className="autosave-status-error">
            {state.conflict ? "Changed elsewhere. " : "Save failed. "}
            {state.message} Your entry is kept.
          </span>
        </>
      ) : null}
      {onRetry && retryShown ? (
        <Button
          aria-disabled={state.phase !== "failed" || undefined}
          onBlur={() => setRetryFocused(false)}
          onClick={() => {
            if (state.phase === "failed") onRetry();
          }}
          onFocus={() => setRetryFocused(true)}
          ref={retryButton}
          size="compact"
          variant="tertiary"
        >
          {retryConflict ? "Save my entry" : "Try again"}
        </Button>
      ) : null}
    </span>
  );
}
