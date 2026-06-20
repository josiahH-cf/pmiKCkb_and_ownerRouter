import { PMI_TAGLINE, PMI_WORDMARK } from "@/lib/constants";

/**
 * Source-safe TYPOGRAPHIC treatment of the visible PMI wordmark `pmi.` and tagline
 * `the property management people` (docs/brand_pack/).
 *
 * This is intentionally NOT the official angular PMI logo mark: no official vector
 * artwork was supplied and the brand pack forbids tracing/redrawing the mark. Shipping
 * the official logo + favicon is a documented release blocker. The trailing period
 * carries the brand orange; styling lives in styles/tokens.css (.pmi-* classes).
 */
export function PmiWordmark({
  variant = "inline",
}: Readonly<{ variant?: "inline" | "hero" }>) {
  const wordmark = (
    <span
      className={`pmi-wordmark${variant === "inline" ? " pmi-wordmark--inline" : ""}`}
      aria-label={PMI_WORDMARK}
    >
      <span aria-hidden="true">
        {PMI_WORDMARK.slice(0, -1)}
        <span className="pmi-dot">{PMI_WORDMARK.slice(-1)}</span>
      </span>
    </span>
  );

  if (variant === "inline") {
    return wordmark;
  }

  return (
    <div className="pmi-lockup">
      {wordmark}
      <span className="pmi-tagline">{PMI_TAGLINE}</span>
    </div>
  );
}
