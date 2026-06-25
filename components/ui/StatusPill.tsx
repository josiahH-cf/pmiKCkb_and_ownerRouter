// StatusPill — the .queue-pill[data-value] severity/status capsule, reused so severity colors
// stay consistent across flags, cohort dispositions, and connector status. Server-safe.

import type { ReactNode } from "react";

// A11y contract: the pill ALWAYS renders a status word (children ?? value). Severity must never be
// conveyed by border hue alone — never add a borderless/text-free variant.
export function StatusPill({
  value,
  children,
}: Readonly<{ value: string; children?: ReactNode }>) {
  return (
    <span className="queue-pill" data-value={value}>
      {children ?? value}
    </span>
  );
}
