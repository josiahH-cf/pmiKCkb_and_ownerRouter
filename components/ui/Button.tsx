// Button — composes the existing .primary-button / .secondary-button / .compact-button classes
// (styles/tokens.css) so every new surface gets a consistent, accessible button without
// re-deriving the styling. Server-safe (no client state); spreads native button attributes.

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { BusyIndicator } from "./BusyIndicator";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";
type ButtonSize = "default" | "compact" | "large";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  busyLabel?: ReactNode;
  state?: "idle" | "success" | "error";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "default",
    type = "button",
    className,
    busy = false,
    busyLabel,
    state = "idle",
    children,
    disabled,
    ...rest
  },
  ref,
) {
  const variantClass = {
    primary: "primary-button",
    secondary: "secondary-button",
    tertiary: "tertiary-button",
    destructive: "destructive-button",
  }[variant];
  const classes = [
    "action-button",
    variantClass,
    size === "compact" ? "compact-button" : null,
    size === "large" ? "button--large" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...rest}
      aria-busy={busy || undefined}
      className={classes}
      data-state={state}
      disabled={disabled || busy}
      ref={ref}
      type={type}
    >
      <span className="action-button-label">
        {busy ? (busyLabel ?? children) : children}
      </span>
      {busy ? (
        <BusyIndicator decorative delayMs={400} label={String(busyLabel ?? children)} />
      ) : null}
    </button>
  );
});
