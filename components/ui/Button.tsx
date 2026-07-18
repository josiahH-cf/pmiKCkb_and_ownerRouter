// Button — composes the existing .primary-button / .secondary-button / .compact-button classes
// (styles/tokens.css) so every new surface gets a consistent, accessible button without
// re-deriving the styling. Server-safe (no client state); spreads native button attributes.

import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary";
type ButtonSize = "default" | "compact" | "large";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "default",
  type = "button",
  className,
  ...rest
}: Readonly<ButtonProps>) {
  const classes = [
    variant === "primary" ? "primary-button" : "secondary-button",
    size === "compact" ? "compact-button" : null,
    size === "large" ? "button--large" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button className={classes} type={type} {...rest} />;
}
