"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminTaskHref } from "@/lib/navigation/admin-task-path";

/** Follow a known task anchor and open any containing service disclosure. */
export function TaskAnchorContinuation({
  adminIndex = false,
}: Readonly<{ adminIndex?: boolean }>) {
  const router = useRouter();
  useEffect(() => {
    function follow() {
      const hash = window.location.hash;
      const id = hash.slice(1);
      if (!/^[a-z][a-z0-9_-]{1,100}$/.test(id)) return;
      if (adminIndex) {
        const prior = `/admin${hash}`;
        const next = adminTaskHref(prior);
        if (next !== prior) {
          router.replace(next);
          return;
        }
      }
      const target = document.getElementById(id);
      if (!target) return;
      let node: HTMLElement | null = target;
      while (node) {
        if (node instanceof HTMLDetailsElement) node.open = true;
        node = node.parentElement;
      }
      if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
    }
    const frame = requestAnimationFrame(follow);
    window.addEventListener("hashchange", follow);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", follow);
    };
  }, [adminIndex, router]);
  return null;
}
