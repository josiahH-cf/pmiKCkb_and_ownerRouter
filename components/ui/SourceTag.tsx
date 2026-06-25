// SourceTag — the trust chip: which system a fact came from and how confident we are
// ("RentVine · Verified", "Sheet · Needs Verification"). Confidence drives the chip color so a
// "Needs Verification" fact reads as caution everywhere. Server-safe.

export function SourceTag({
  source,
  confidence,
}: Readonly<{ source: string; confidence?: string }>) {
  return (
    <span className="ui-source-tag" data-confidence={confidence}>
      {confidence ? `${source} · ${confidence}` : source}
    </span>
  );
}
