"use client";

// S242 R-S242-5: a deep link whose step id this guide no longer has falls back to the guide's
// section landing with the visible "This guide moved" line, the same as a guide id that no longer
// exists. The line shows here until the section page opens, so the page is never blank. Known step
// ids are highlighted by the :target style.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function hashId() {
  const raw = window.location.hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function HelpStepTarget({
  stepIds,
  sectionHref,
}: Readonly<{ stepIds: readonly string[]; sectionHref: string }>) {
  const router = useRouter();
  const [moved, setMoved] = useState<string | null>(null);

  useEffect(() => {
    const check = () => {
      const id = hashId();
      const unknown = id && !stepIds.includes(id) ? id : null;
      setMoved(unknown);
      if (unknown) router.replace(`${sectionHref}?moved=1`);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [router, sectionHref, stepIds]);

  if (!moved) return null;
  return (
    <p className="help-moved" role="status">
      This guide moved: the step you followed is no longer here. The section page opens
      with its current guides.
    </p>
  );
}
