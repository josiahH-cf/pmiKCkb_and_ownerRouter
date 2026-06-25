// Disclosure — a quiet, native <details> collapsible used to DEMOTE plumbing (run manifests,
// data diagnostics) out of the operator's main view while keeping it one click away. Server-safe.

import type { ReactNode } from "react";

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: Readonly<{ summary: ReactNode; children: ReactNode; defaultOpen?: boolean }>) {
  return (
    <details className="ui-disclosure" open={defaultOpen}>
      <summary>{summary}</summary>
      <div className="ui-disclosure-body">{children}</div>
    </details>
  );
}
