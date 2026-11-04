import type { ReactNode } from "react";

import {
  HelpTableOfContents,
  type HelpTocGroup,
  type HelpTocLink,
} from "@/components/help/HelpTableOfContents";
import { HELP_SCREEN_REFERENCES, guidesInSection } from "@/lib/help";
import {
  HELP_ROOT,
  HELP_GLOSSARY_HREF,
  HELP_REFERENCE_HREF,
  HELP_WHAT_CHANGED_HREF,
  helpGuideHref,
  helpScreenHref,
  helpSectionHref,
} from "@/lib/help/links";
import { HELP_SECTIONS } from "@/lib/help/sections";

/** The table of contents groups in reading order (R-S242-2). */
export function helpTocGroups(): readonly HelpTocGroup[] {
  return [
    ...HELP_SECTIONS.map((section) => ({
      id: section.id,
      title: section.title,
      links: [
        { href: helpSectionHref(section.id), title: `${section.title} overview` },
        ...guidesInSection(section.id).map((guide) => ({
          href: helpGuideHref(section.id, guide.id),
          title: guide.title,
          admin: guide.adminOnly,
        })),
      ],
    })),
    {
      id: "reference",
      title: "Reference",
      links: [
        { href: HELP_REFERENCE_HREF, title: "Screens and controls" },
        ...HELP_SCREEN_REFERENCES.map((screen) => ({
          href: helpScreenHref(screen.id),
          title: screen.title,
          admin: screen.adminOnly,
        })),
      ],
    },
  ];
}

export const HELP_TOC_LEADING: readonly HelpTocLink[] = [
  { href: HELP_ROOT, title: "Start here" },
];

export const HELP_TOC_TRAILING: readonly HelpTocLink[] = [
  { href: HELP_GLOSSARY_HREF, title: "Glossary" },
  { href: HELP_WHAT_CHANGED_HREF, title: "What changed" },
];

/** The help layout inside the ordinary signed-in shell: contents beside (or above) the page. */
export function HelpFrame({
  children,
  currentHref,
  currentGroup,
}: Readonly<{ children: ReactNode; currentHref: string; currentGroup?: string }>) {
  return (
    <main className="content content--workspace help-layout">
      <HelpTableOfContents
        currentGroup={currentGroup}
        currentHref={currentHref}
        groups={helpTocGroups()}
        leading={HELP_TOC_LEADING}
        trailing={HELP_TOC_TRAILING}
      />
      <div className="help-body">{children}</div>
    </main>
  );
}
