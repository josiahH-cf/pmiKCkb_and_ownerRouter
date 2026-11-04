// S244 R-S244-3: the "Open the guide" line at the end of every About panel and InfoTip. It opens the
// help hub step in the same tab; leaving the page closes the panel. Without a hub route it renders
// plain text naming the guide, never a dead link. Opening help still records nothing.
import Link from "next/link";

import {
  helpGuideLinkHref,
  helpGuideLinkTarget,
  type HelpGuideLinkId,
} from "@/lib/help/guide-links";

export function HelpGuideLink({
  id,
  hubAvailable,
}: Readonly<{ id: HelpGuideLinkId; hubAvailable?: boolean }>) {
  const href = helpGuideLinkHref(id, hubAvailable);
  const target = helpGuideLinkTarget(id);
  if (!href)
    return (
      <span className="help-guide-link">Open the guide: {target.title}, in Help.</span>
    );
  return (
    <Link className="text-link help-guide-link" href={href} prefetch={false}>
      Open the guide
    </Link>
  );
}
