// ModeChip — a small, quiet environment marker (e.g. "Sample data", "Live"). Replaces the
// full-width simulation banner so the mode is honest but not shouting. Server-safe.

import type { ReactNode } from "react";

export function ModeChip({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="ui-mode-chip">{children}</span>;
}
