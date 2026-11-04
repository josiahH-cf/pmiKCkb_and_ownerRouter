export const HELP_FORBIDDEN_PHRASES: readonly string[];
export const HELP_STALE_STATEMENTS: readonly string[];
export const HELP_FORBIDDEN_PATTERNS: readonly { rule: string; pattern: RegExp }[];
export interface HelpString {
  location: string;
  text: string;
  kind: "prose" | "label";
}
export function collectHelpStrings(
  manual?: {
    guides: readonly unknown[];
    screens: readonly unknown[];
    glossary: readonly unknown[];
    changelog: readonly unknown[];
    sections?: readonly unknown[];
    [key: string]: unknown;
  },
  extras?: { sectionHelp?: Record<string, unknown>; dispositions?: readonly unknown[] },
): HelpString[];
export function evaluateHelpContent(strings: readonly HelpString[]): string[];
