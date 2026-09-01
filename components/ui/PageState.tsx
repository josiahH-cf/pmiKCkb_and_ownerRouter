import type { ReactNode } from "react";

import { BusyIndicator } from "./BusyIndicator";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

export type PageStateKind = "loading" | "empty" | "error" | "not-found";

const PAGE_STATE_ICONS: Readonly<Record<Exclude<PageStateKind, "loading">, IconName>> = {
  empty: "info",
  error: "error",
  "not-found": "warning",
};

export function PageState({
  kind,
  title,
  description,
  actionLabel,
  onAction,
  action,
}: Readonly<{
  kind: PageStateKind;
  title: string;
  description: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  action?: ReactNode;
}>) {
  return (
    <section
      aria-busy={kind === "loading" || undefined}
      className="page-state"
      data-kind={kind}
    >
      {kind === "loading" ? (
        <BusyIndicator delayMs={0} label={title} />
      ) : (
        <Icon name={PAGE_STATE_ICONS[kind]} size={28} />
      )}
      <div>
        <h2>{title}</h2>
        <div className="page-state-description">{description}</div>
      </div>
      {action ??
        (actionLabel && onAction ? (
          <Button onClick={onAction} variant="secondary">
            {actionLabel}
          </Button>
        ) : null)}
    </section>
  );
}
