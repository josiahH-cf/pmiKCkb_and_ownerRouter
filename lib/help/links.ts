import type { HelpSectionId } from "@/lib/help/types";

/**
 * S242 R-S242-5: the deep-link contract. Every guide, step and screen reference has a stable URL;
 * S244's "Open the guide" links and the S245 litmus consume these shapes.
 */
export const HELP_ROOT = "/help";

/**
 * True because this build serves the `/help` route family (app/help/page.tsx). S244's "Open the
 * guide" links render as plain text naming the guide when it is false;
 * tests/unit/s244-help-guide-links.test.tsx keeps it equal to the presence of that route.
 */
export const HELP_HUB_ROUTE_PRESENT = true;

export function helpSectionHref(section: HelpSectionId): string {
  return `${HELP_ROOT}/${section}`;
}

export function helpGuideHref(
  section: HelpSectionId,
  guide: string,
  step?: string,
): string {
  return `${HELP_ROOT}/${section}/${guide}${step ? `#${step}` : ""}`;
}

export function helpScreenHref(screen: string, control?: string): string {
  return `${HELP_ROOT}/reference/${screen}${control ? `#${control}` : ""}`;
}

export const HELP_GLOSSARY_HREF = `${HELP_ROOT}/glossary`;
export const HELP_WHAT_CHANGED_HREF = `${HELP_ROOT}/what-changed`;
export const HELP_REFERENCE_HREF = `${HELP_ROOT}/reference`;
export const HELP_PRINT_HREF = `${HELP_ROOT}/print`;

/** The anchor id a screen control renders with, derived from its label. */
export function helpControlAnchor(label: string): string {
  return `control-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}
