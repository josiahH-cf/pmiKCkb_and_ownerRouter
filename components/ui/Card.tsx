// Card — the universal .panel surface with an optional heading row + actions. Server-safe.
// A string title is rendered as a .section-subtitle; pass a node for full control.

import type { ReactNode } from "react";

interface CardProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function Card({
  title,
  actions,
  children,
  className,
  ariaLabel,
}: Readonly<CardProps>) {
  const classes = ["panel", className].filter(Boolean).join(" ");

  return (
    <section aria-label={ariaLabel} className={classes}>
      {title || actions ? (
        <div className="panel-heading compact-heading">
          {typeof title === "string" ? (
            <h2 className="section-subtitle">{title}</h2>
          ) : (
            title
          )}
          {actions ? <div className="ui-row">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
