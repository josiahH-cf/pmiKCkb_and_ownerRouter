"use client";

import { Button } from "@/components/ui";

/** S242 R-S242-6: opens the browser's own print dialog. Printing records nothing. */
export function HelpPrintButton({ label }: Readonly<{ label: string }>) {
  return (
    <Button
      className="help-print-hide"
      onClick={() => window.print()}
      variant="secondary"
    >
      {label}
    </Button>
  );
}
