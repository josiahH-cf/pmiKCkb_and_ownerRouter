// S115: a renewal heading with its plain-language help control beside it. Server-safe: the heading
// keeps its exact text as its only content and the help trigger is a sibling button named
// `About <label>`, so existing heading, text and label locators keep resolving.

import type { ElementType, ReactNode } from "react";

import { RenewalSectionHelp } from "@/components/lease-renewal/RenewalSectionHelp";
import type { SectionHelpId } from "@/lib/lease-renewal/section-help";

export function RenewalSectionHeading({
  id,
  as: Tag = "h2",
  className,
  headingId,
  children,
}: Readonly<{
  id: SectionHelpId;
  as?: "h2" | "h3";
  className?: string;
  headingId?: string;
  children: ReactNode;
}>) {
  const Heading = Tag as ElementType;
  return (
    <div className="renewal-heading-row">
      <Heading className={className} id={headingId}>
        {children}
      </Heading>
      <RenewalSectionHelp id={id} />
    </div>
  );
}

/** A Card title node: the usual `.section-subtitle` heading plus the section's help control. */
export function renewalCardTitle(id: SectionHelpId, text: string) {
  return (
    <RenewalSectionHeading id={id} className="section-subtitle">
      {text}
    </RenewalSectionHeading>
  );
}
