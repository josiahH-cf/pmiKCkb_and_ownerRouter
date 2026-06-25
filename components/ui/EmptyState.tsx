// EmptyState — a quiet, consistent placeholder for empty lists/sections (replaces ad-hoc
// "Nothing here" muted paragraphs). Server-safe.

import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: Readonly<{ title: string; description?: ReactNode; action?: ReactNode }>) {
  return (
    <div className="ui-empty">
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
      {action ? <div className="ui-row">{action}</div> : null}
    </div>
  );
}
