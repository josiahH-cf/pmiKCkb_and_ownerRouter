/** Usable means a finite positive monthly rent. Provider order and source precision are retained. */
export function firstUsableComparables<T extends { rent: number }>(comps: readonly T[]) {
  const usable = comps
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => Number.isFinite(value.rent) && value.rent > 0);
  return {
    entries: usable.slice(0, 5),
    usableCount: usable.length,
    skipped: comps.length - usable.length,
    total: comps.length,
  };
}
export function comparableDistanceLabel(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? `${value.toFixed(1)} mi`
    : "distance unavailable";
}
