// Metric — a quiet summary number (count) on a neutral surface, for dashboard-style strips. Used in
// grids of 2–4 (.ui-metric-grid). Server-safe.

import type { ReactNode } from "react";

export function Metric({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="ui-metric">
      <p className="ui-metric-label">{label}</p>
      <p className="ui-metric-value">{value}</p>
    </div>
  );
}
