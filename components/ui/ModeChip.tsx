// ModeChip — a small, quiet environment marker (e.g. "Sample data", "Live data"). Replaces the
// full-width simulation banner so the mode is honest but not shouting. The "live" tone adds a small
// status dot so live data is never visually mistaken for sample data. Server-safe.

import type { ReactNode } from "react";

export function ModeChip({
  children,
  tone = "sample",
}: Readonly<{ children: ReactNode; tone?: "sample" | "live" }>) {
  return (
    <span className="ui-mode-chip" data-tone={tone}>
      {children}
    </span>
  );
}
