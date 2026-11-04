/**
 * S242 R-S242-7: things the coverage gate may leave undocumented, each with a one-line reason.
 * The gate prints this list with every run so an exclusion is always visible, and it fails on an
 * entry without a reason or an entry naming something that does not exist.
 */
export interface HelpCoverageExclusion {
  readonly kind: "route" | "navItem" | "space" | "aboutId";
  readonly id: string;
  readonly reason: string;
}

export const HELP_COVERAGE_ALLOW_LIST: readonly HelpCoverageExclusion[] = [];
