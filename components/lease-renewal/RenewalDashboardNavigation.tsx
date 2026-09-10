"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  RENEWAL_DASHBOARD_SECTIONS,
  renewalDashboardTarget,
} from "@/lib/lease-renewal/dashboard-sections";

/** Fragment navigation only. Historical step URLs remain useful without mutating progress. */
export function RenewalDashboardNavigation({
  selectedStepId,
}: {
  selectedStepId?: string;
}) {
  useEffect(() => {
    const focusTarget = () => {
      const id =
        window.location.hash.slice(1) ||
        (selectedStepId ? renewalDashboardTarget(selectedStepId) : "");
      if (!id.startsWith("renewal-")) return;
      focusRenewalDashboardControl(id);
    };
    focusTarget();
    const onClick = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = new URL(anchor.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname !== window.location.pathname ||
        !url.hash.startsWith("#renewal-")
      )
        return;
      queueMicrotask(() => focusRenewalDashboardControl(url.hash.slice(1)));
    };
    window.addEventListener("hashchange", focusTarget);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", focusTarget);
      document.removeEventListener("click", onClick);
    };
  }, [selectedStepId]);

  return (
    <nav aria-label="Renewal dashboard sections" className="ui-row">
      {RENEWAL_DASHBOARD_SECTIONS.map((section) => (
        <Link
          prefetch={false}
          scroll={false}
          className="text-link renewal-workspace-link"
          key={section.id}
          href={`#renewal-section-${section.id}`}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}

/** Focus the unresolved control, opening enclosing disclosures without recording any progress. */
export function focusRenewalDashboardControl(id: string) {
  if (!id.startsWith("renewal-")) return;
  const root = document.getElementById(id);
  if (!root) return;
  const candidates = root.querySelectorAll<HTMLElement>(
    "[data-renewal-next-control], [aria-invalid='true'], input, select, textarea, button, summary, a[href]",
  );
  const target =
    [...candidates].find(
      (element) =>
        element.hasAttribute("data-renewal-next-control") &&
        !element.matches(":disabled"),
    ) ??
    [...candidates].find(
      (element) =>
        !element.matches(":disabled") && element.getAttribute("aria-disabled") !== "true",
    ) ??
    root;
  let ancestor: HTMLElement | null = target;
  while (ancestor) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  target.focus({ preventScroll: true });
  target.scrollIntoView?.({ block: "start" });
}
