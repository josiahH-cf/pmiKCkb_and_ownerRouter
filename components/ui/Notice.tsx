import type { ReactNode } from "react";

import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

export type NoticeTone = "status" | "success" | "caution" | "error";

const NOTICE_ICONS: Readonly<Record<NoticeTone, IconName>> = {
  status: "info",
  success: "check",
  caution: "warning",
  error: "error",
};

export function Notice({
  children,
  tone = "status",
  urgent = false,
  actionLabel,
  onAction,
}: Readonly<{
  children: ReactNode;
  tone?: NoticeTone;
  urgent?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}>) {
  return (
    <div
      aria-atomic="true"
      aria-live={urgent ? "assertive" : "polite"}
      className="ui-notice"
      data-tone={tone}
      role={urgent ? "alert" : "status"}
    >
      <Icon name={NOTICE_ICONS[tone]} />
      <div className="ui-notice-content">{children}</div>
      {actionLabel && onAction ? (
        <Button onClick={onAction} size="compact" variant="secondary">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function LiveRegion({ message }: Readonly<{ message: string }>) {
  return (
    <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
      {message}
    </p>
  );
}
