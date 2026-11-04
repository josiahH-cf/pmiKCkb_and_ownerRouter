"use client";

// S242 R-S242-5: a deep link whose step id this guide no longer has shows a visible line instead
// of silently landing at the top. Known step ids are highlighted by the :target style.

import { useEffect, useState } from "react";

export function HelpStepTarget({ stepIds }: Readonly<{ stepIds: readonly string[] }>) {
  const [moved, setMoved] = useState<string | null>(null);

  useEffect(() => {
    const check = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      setMoved(id && !stepIds.includes(id) ? id : null);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [stepIds]);

  if (!moved) return null;
  return (
    <p className="help-moved" role="status">
      This guide moved: the step you followed is no longer here. The guide below shows the
      current steps.
    </p>
  );
}
