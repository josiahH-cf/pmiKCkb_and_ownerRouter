export interface HelpCoverageInputs {
  routes: readonly string[];
  navItems: readonly string[];
  spaces: readonly string[];
  aboutIds: readonly string[];
  manual: {
    guides: readonly unknown[];
    screens: readonly unknown[];
    [key: string]: unknown;
  };
  allowList: readonly { kind: string; id: string; reason: string }[];
}
export interface HelpCoverageResult {
  problems: string[];
  unreferenced: Record<string, string[]>;
  referenced: Record<"route" | "navItem" | "space" | "aboutId", Set<string>>;
  allowList: readonly { kind: string; id: string; reason: string }[];
}
export function enumerateStaffRoutes(root?: string): string[];
export function helpReferences(manual: HelpCoverageInputs["manual"]): {
  routes: Set<string>;
  navItems: Set<string>;
  spaces: Set<string>;
  aboutIds: Set<string>;
};
export function evaluateHelpCoverage(inputs: HelpCoverageInputs): HelpCoverageResult;
export function runHelpCoverage(root?: string): HelpCoverageResult;
