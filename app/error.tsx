"use client";

// Route-segment error boundary (F-SUPP-4). Next renders this when a page under the root layout throws
// during render. The root layout (and its CSS + the global "Report an issue" button) still render
// around it, so we surface an in-context recovery + report path via ErrorReportPanel.

import { ErrorReportPanel } from "@/components/feedback/ErrorReportPanel";

export default function RouteError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <ErrorReportPanel error={error} reset={reset} />;
}
