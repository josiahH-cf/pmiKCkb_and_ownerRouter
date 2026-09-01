"use client";

import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Button, type ButtonVariant } from "./Button";

export type IconName =
  | "check"
  | "chevron-right"
  | "close"
  | "error"
  | "external"
  | "info"
  | "notifications"
  | "refresh"
  | "warning";

const GLYPHS: Readonly<Record<IconName, ReactNode>> = {
  check: <path d="m5 12 4 4L19 6" />,
  "chevron-right": <path d="m9 18 6-6-6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 17h.01" />
    </>
  ),
  external: (
    <path d="M14 5h5v5M19 5l-8 8M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  notifications: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" />,
  warning: <path d="M12 3 2.5 20h19L12 3Zm0 6v5m0 3h.01" />,
};

export function Icon({
  name,
  label,
  size = 20,
}: Readonly<{ name: IconName; label?: string; size?: number }>) {
  return (
    <svg
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      className="ui-icon"
      fill="none"
      height={size}
      role={label ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
    >
      {GLYPHS[name]}
    </svg>
  );
}

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  icon: IconName;
  label: string;
  variant?: ButtonVariant;
}

export function IconButton({
  icon,
  label,
  variant = "tertiary",
  ...buttonProps
}: Readonly<IconButtonProps>) {
  const tooltipId = useId();
  return (
    <span className="icon-button-wrap">
      <Button
        {...buttonProps}
        aria-describedby={tooltipId}
        aria-label={label}
        className={["icon-button", buttonProps.className].filter(Boolean).join(" ")}
        variant={variant}
      >
        <Icon name={icon} />
      </Button>
      <span className="icon-button-tooltip" id={tooltipId} role="tooltip">
        {label}
      </span>
    </span>
  );
}
