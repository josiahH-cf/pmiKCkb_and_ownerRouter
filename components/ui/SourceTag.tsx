// SourceTag — the trust chip: which system a fact came from and how confident we are
// ("RentVine · Verified", "Sheet · Needs Verification"). Confidence drives the chip color so a
// "Needs Verification" fact reads as caution everywhere. Server-safe. The source label passes through
// displaySourceLabel so stored ids ("Rentvine (read-authoritative)") read as clean brand names.

import { displaySourceLabel } from "@/lib/lease-renewal/source-display";

export function SourceTag({
  source,
  confidence,
}: Readonly<{ source: string; confidence?: string }>) {
  const label = displaySourceLabel(source);
  return (
    <span className="ui-source-tag" data-confidence={confidence}>
      {confidence ? `${label} · ${confidence}` : label}
    </span>
  );
}
