"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

type PendingNavigation = {
  href: string;
  label: string;
  phase: "pending" | "interrupted";
};
/** Navigation owns this status; existing regions continue to own their independent work. */
export function NavigationFeedback({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0);
  const committed = `${pathname}${search ? `?${search}` : ""}`;
  const committedRef = useRef(committed);
  useLayoutEffect(() => {
    committedRef.current = committed;
  }, [committed]);
  function begin(href: string, label: string) {
    const current = ++generation.current;
    clearTimeout(timer.current);
    setPending({ href, label, phase: "pending" });
    timer.current = setTimeout(() => {
      if (generation.current === current)
        setPending({ href, label, phase: "interrupted" });
    }, 30_000);
  }
  const beginRef = useRef(begin);
  useLayoutEffect(() => {
    beginRef.current = begin;
  });
  useEffect(() => {
    const selected = pending && new URL(pending.href, window.location.href);
    if (selected && `${selected.pathname}${selected.search}` === committed) {
      clearTimeout(timer.current);
      queueMicrotask(() =>
        setPending((current) => (current?.href === pending.href ? null : current)),
      );
    }
  }, [committed, pending]);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        !(event.target instanceof Element)
      )
        return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.download || anchor.target) return;
      const url = new URL(anchor.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname.startsWith("/api/") ||
        `${url.pathname}${url.search}` === committedRef.current ||
        // A table that changes its own view in place owns that status. Leaving it for another
        // page, such as opening a lease from the worklist, is navigation.
        (anchor.closest("[data-admitted-view]") &&
          url.pathname === window.location.pathname)
      )
        return;
      beginRef.current(
        `${url.pathname}${url.search}`,
        anchor.getAttribute("aria-label") ||
          anchor.textContent?.trim() ||
          "selected page",
      );
    };
    const submit = (event: Event) => {
      const form = event.target;
      if (
        !(form instanceof HTMLFormElement) ||
        form.method.toLowerCase() !== "get" ||
        form.closest("[data-admitted-view]")
      )
        return;
      const url = new URL(form.action, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/"))
        return;
      const params = new URLSearchParams();
      new FormData(form).forEach((value, key) => {
        if (typeof value === "string") params.append(key, value);
      });
      const href = `${url.pathname}?${params}`;
      const label = form.getAttribute("aria-label") || "requested view";
      const current = generation.current;
      // A form whose own handler keeps the submission on this screen is not a page navigation; it
      // owns its status. Decide after the whole dispatch, when that handler has had its say.
      setTimeout(() => {
        if (!event.defaultPrevented && generation.current === current)
          beginRef.current(href, label);
      }, 0);
    };
    const pop = () => {
      const url = `${window.location.pathname}${window.location.search}`;
      if (url !== committedRef.current) beginRef.current(url, "previously selected page");
    };
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    window.addEventListener("popstate", pop);
    return () => {
      clearTimeout(timer.current);
      generation.current += 1;
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
      window.removeEventListener("popstate", pop);
    };
  }, []);
  return (
    <>
      {pending ? (
        <div
          className="route-feedback"
          data-operation-pending={pending.phase === "pending" || undefined}
        >
          <span role="status" aria-label="Page navigation">
            {pending.phase === "pending"
              ? `Opening ${pending.label}…`
              : `${pending.label} has not finished opening. Your current screen is still available.`}
          </span>
          {pending.phase === "interrupted" ? (
            <>
              <a className="text-link" href={pending.href}>
                Retry navigation
              </a>
              <Button
                variant="tertiary"
                size="compact"
                onClick={() => {
                  generation.current += 1;
                  setPending(null);
                }}
              >
                Stay here
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {children}
    </>
  );
}
