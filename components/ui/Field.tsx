// Field — guided-input wrapper (FDS-3). A labelled control with an optional required asterisk
// (a shape cue, aria-hidden, paired with the control's aria-required state so "required" is never
// color-only and is announced exactly once), an optional example/hint line, and an optional inline
// validation seam. Server-safe (no client state). It clones a single host-control child to wire
// id, aria-required, aria-invalid, and aria-describedby so every cue reaches assistive tech.
//
// Two independent axes are modelled deliberately so downstream consumers (FDS-4 "Next" incomplete
// flow, LR-9 decision forms, MWO-3 intake, ADM-5 setup) never have to reopen this primitive:
//   - `required` (static): a value must eventually be provided.
//   - `invalid` / `error` (runtime state): the current value is missing/incomplete/wrong now.

import { Children, cloneElement, Fragment, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";

interface FieldProps {
  /** Visible label text. */
  label: ReactNode;
  /** id of the control this field labels; also defaulted onto the child when it has no id. */
  htmlFor: string;
  /** The single host form control (input/textarea/select) this field wraps. */
  children: ReactNode;
  /** Static-required: renders the asterisk and sets aria-required. */
  required?: boolean;
  /** Example / pertinent context under the label (e.g. "for example: 1234 Oak St, Unit 2"). */
  hint?: ReactNode;
  /** Inline validation message (missing/incomplete/invalid); rendered role="alert", wired via
      aria-describedby, and forces aria-invalid. */
  error?: ReactNode;
  /** Marks the control invalid without a message (e.g. an incomplete required step in a Next flow). */
  invalid?: boolean;
  className?: string;
}

type ControlProps = {
  id?: string;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
};

export function Field({
  label,
  htmlFor,
  children,
  required = false,
  hint,
  error,
  invalid = false,
  className,
}: Readonly<FieldProps>) {
  const classes = ["field", className].filter(Boolean).join(" ");
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const isInvalid = invalid || Boolean(error);

  // Only a single host element can carry the aria wiring. Fragments pass isValidElement but silently
  // drop aria props, so exclude them explicitly and warn in dev when a control child is not usable.
  const cloneable = isValidElement(children) && children.type !== Fragment;
  if (
    process.env.NODE_ENV === "development" &&
    (!cloneable || Children.count(children) !== 1)
  ) {
    console.warn(
      `Field(htmlFor="${htmlFor}"): expected a single form control child (input/textarea/select) ` +
        `so required/invalid/hint cues reach assistive tech; got a fragment, list, or non-element child.`,
    );
  }

  const control = cloneable
    ? cloneElement(children as ReactElement<ControlProps>, {
        id: (children as ReactElement<ControlProps>).props.id ?? htmlFor,
        "aria-required": required
          ? true
          : (children as ReactElement<ControlProps>).props["aria-required"],
        "aria-invalid": isInvalid
          ? true
          : (children as ReactElement<ControlProps>).props["aria-invalid"],
        "aria-describedby":
          [
            (children as ReactElement<ControlProps>).props["aria-describedby"],
            errorId,
            hintId,
          ]
            .filter(Boolean)
            .join(" ") || undefined,
      })
    : children;

  return (
    <div className={classes}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span aria-hidden="true" className="field-required">
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {control}
      {error ? (
        <span className="field-error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
