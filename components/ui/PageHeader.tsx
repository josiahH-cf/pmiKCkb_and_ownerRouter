// PageHeader — a consistent page title + optional subtitle with right-aligned actions, so every
// redesigned surface opens the same way. Server-safe.

import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: Readonly<{ title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }>) {
  return (
    <div className="ui-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="ui-page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ui-row">{actions}</div> : null}
    </div>
  );
}
