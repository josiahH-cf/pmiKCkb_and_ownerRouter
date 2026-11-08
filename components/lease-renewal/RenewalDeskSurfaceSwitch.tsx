"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  RENEWAL_DESK_ROUTE,
  RENEWAL_DESK_ALL_LEASES_HREF,
  validateDeskView,
} from "@/lib/lease-renewal/desk-view-continuation";
import { validateRenewalBatchContinuation } from "@/lib/lease-renewal/renewal-batch";

type Surface = "batch" | "table";
const key = "renewal-desk:surface:";
const maxAge = 30 * 60_000;
const defaultHref: Record<Surface, string> = {
  batch: RENEWAL_DESK_ROUTE,
  table: RENEWAL_DESK_ALL_LEASES_HREF,
};

function validatedHref(surface: Surface, query: unknown) {
  if (typeof query !== "string") return null;
  if (surface === "batch" && query === "") return RENEWAL_DESK_ROUTE;
  const valid =
    surface === "batch"
      ? validateRenewalBatchContinuation(query)
      : validateDeskView(query);
  return valid ? `${RENEWAL_DESK_ROUTE}?${valid}` : null;
}

function remembered(surface: Surface): { href: string; y: number } | null {
  try {
    const raw = sessionStorage.getItem(`${key}${surface}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { query?: unknown; y?: unknown; at?: unknown };
    const href = validatedHref(surface, entry.query);
    if (
      href &&
      typeof entry.y === "number" &&
      Number.isFinite(entry.y) &&
      typeof entry.at === "number" &&
      Date.now() - entry.at <= maxAge
    )
      return { href, y: Math.max(0, entry.y) };
  } catch {
    // Browser storage can be unavailable. Canonical links still work.
  }
  return null;
}

export function RenewalDeskSurfaceSwitch({ active }: Readonly<{ active: Surface }>) {
  const router = useRouter();
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem(`${key}return`);
      if (pending !== `${window.location.pathname}${window.location.search}`) return;
      sessionStorage.removeItem(`${key}return`);
      const position = remembered(active);
      if (!position || position.href !== pending) return;
      const frame = requestAnimationFrame(() => window.scrollTo(0, position.y));
      return () => cancelAnimationFrame(frame);
    } catch {
      // This is a visit's position, not a saved staff view.
    }
  }, [active]);

  return (
    <nav
      aria-label="Renewal desk view"
      className="renewal-batch-views"
      data-renewal-desk-view={active}
    >
      {(
        [
          ["batch", "Working batch"],
          ["table", "All leases and filters"],
        ] as const
      ).map(([surface, label]) => (
        <Link
          aria-current={surface === active ? "page" : undefined}
          className="secondary-button"
          href={defaultHref[surface]}
          key={surface}
          prefetch={false}
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.altKey ||
              event.shiftKey ||
              event.defaultPrevented
            )
              return;
            event.preventDefault();
            if (surface === active) return;
            const next = remembered(surface);
            try {
              const query = window.location.search.slice(1);
              if (validatedHref(active, query))
                sessionStorage.setItem(
                  `${key}${active}`,
                  JSON.stringify({ query, y: window.scrollY, at: Date.now() }),
                );
              if (next) sessionStorage.setItem(`${key}return`, next.href);
              else sessionStorage.removeItem(`${key}return`);
            } catch {
              // Continue through the same local route when storage is disabled.
            }
            router.push(next?.href ?? defaultHref[surface]);
          }}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
