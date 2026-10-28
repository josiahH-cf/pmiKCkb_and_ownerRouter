import { formatBusinessTimestamp } from "@/lib/date-display";
import type { RemainingDifferenceRow } from "@/lib/lease-renewal/remaining-differences";

/**
 * S237 R-S237-5: each tracked field's Working or approved value beside the latest RentVine or
 * Sheet readback and its read time. It never says the systems are synchronized.
 */
export function RemainingDifferences({
  rows,
}: Readonly<{ rows: readonly RemainingDifferenceRow[] }>) {
  if (!rows.length) return null;
  return (
    <section aria-label="What still differs" data-renewal-field="remaining-differences">
      <h3>What still differs</h3>
      <p className="muted">
        Each field compares the Working or approved value with the latest read from its
        source. A match is not a claim that RentVine and the Sheet are synchronized.
      </p>
      <ul>
        {rows.map((row) => (
          <li key={row.key} data-renewal-difference={row.key}>
            {row.label}: {row.intended}; source {row.readback}
            {row.readAt ? ` (read ${formatBusinessTimestamp(row.readAt)})` : ""} —{" "}
            {row.matches === true
              ? "Matches"
              : row.matches === false
                ? "Differs"
                : "Not compared"}
          </li>
        ))}
      </ul>
    </section>
  );
}
