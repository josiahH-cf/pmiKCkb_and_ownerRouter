"use client";

import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Button, type ButtonVariant } from "./Button";

export type IconName =
  | "approval-tray"
  | "assistant-spark"
  | "calendar-renew"
  | "check"
  | "chevron-right"
  | "clipboard-checklist"
  | "close"
  | "error"
  | "external"
  | "info"
  | "message-envelope"
  | "notifications"
  | "plug-connected"
  | "refresh"
  | "shield-user"
  | "workflow-nodes"
  | "wrench"
  | "warning";

const GLYPHS: Readonly<Record<IconName, ReactNode>> = {
  "approval-tray": (
    <>
      <path d="M4 13h4l2 3h4l2-3h4v6H4v-6Z" />
      <path d="m8 8 2.5 2.5L16 5" />
    </>
  ),
  "assistant-spark": (
    <>
      <path d="M4 5h12v10H9l-4 4v-4H4V5Z" />
      <path d="m19 4 .5 1.5L21 6l-1.5.5L19 8l-.5-1.5L17 6l1.5-.5L19 4Z" />
    </>
  ),
  "calendar-renew": (
    <>
      <path d="M5 4v3M15 4v3M3 9h14M4 6h14v7" />
      <path d="M20 15a5 5 0 1 1-1.46-3.54M20 11v4h-4" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  "chevron-right": <path d="m9 18 6-6-6-6" />,
  "clipboard-checklist": (
    <>
      <path d="M9 5H6a2 2 0 0 0-2 2v12h16V7a2 2 0 0 0-2-2h-3" />
      <path d="M9 3h6v4H9V3Zm0 8-1.5 1.5L6.5 11M11 12h5m-7 4-1.5 1.5-1-1M11 17h5" />
    </>
  ),
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
  "message-envelope": (
    <>
      <path d="M4 4h16v11H9l-5 5V4Z" />
      <path d="m7 8 5 4 5-4" />
    </>
  ),
  notifications: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
  "plug-connected": (
    <>
      <path d="M8 3v4M16 3v4M6 7h12v3a6 6 0 0 1-12 0V7Zm6 9v5" />
      <path d="M12 21h7" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" />,
  "shield-user": (
    <>
      <path d="M12 3 5 6v5c0 4.5 2.7 7.8 7 10 4.3-2.2 7-5.5 7-10V6l-7-3Z" />
      <circle cx="12" cy="10" r="2" />
      <path d="M8.5 16c.7-1.7 1.9-2.5 3.5-2.5s2.8.8 3.5 2.5" />
    </>
  ),
  "workflow-nodes": (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="m8 7 3 8m5-8-3 8M8 6h8" />
    </>
  ),
  wrench: (
    <path d="M14 6a5 5 0 0 0-6.7 6.7L3 17l4 4 4.3-4.3A5 5 0 0 0 18 10l-3 3-4-4 3-3Z" />
  ),
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
