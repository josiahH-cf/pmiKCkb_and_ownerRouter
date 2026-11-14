"use client";

import type { ReactNode } from "react";
import {
  PHONE_HEADER_QUERY,
  useNarrowViewport,
} from "@/components/hooks/useNarrowViewport";

export function TopbarUtilities({ children }: Readonly<{ children: ReactNode }>) {
  const narrow = useNarrowViewport(PHONE_HEADER_QUERY);
  if (!narrow) return <div className="topbar-utilities">{children}</div>;
  return (
    <details className="topbar-utilities">
      <summary>More</summary>
      <div className="topbar-utility-panel">{children}</div>
    </details>
  );
}
