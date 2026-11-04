export interface CollectedHelpControl {
  owner: string;
  step: string | null;
  label: string;
  controlRole: string;
  region?: string;
  availability: "required" | "conditional";
  source: readonly string[];
  sourceText?: string;
  aboutId?: string;
  actions?: readonly string[];
  route: string;
  role: "Editor" | "Approver" | "Admin";
}
export function normalizeSourceText(text: string): string;
export function collectHelpControls(manual?: {
  guides: readonly unknown[];
  screens: readonly unknown[];
  [key: string]: unknown;
}): CollectedHelpControl[];
export function checkHelpControlSources(
  controls: readonly CollectedHelpControl[],
  readFile: (path: string) => string | null,
  sectionHelp?: Record<string, { label: string }>,
): string[];
export function runHelpControlSources(root?: string): {
  controls: CollectedHelpControl[];
  problems: string[];
};
