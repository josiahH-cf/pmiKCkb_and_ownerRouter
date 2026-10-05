"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
};
/** Compatibility for the old authenticated card anchor, without a default setup entry. */
export function RetiredGmailSetup() {
  const retired = useSyncExternalStore(
    subscribe,
    () =>
      window.location.hash === "#connector-gmail_sender" ||
      new URLSearchParams(window.location.search).get("connector") === "gmail_sender",
    () => false,
  );
  return retired ? (
    <section
      id="connector-gmail_sender"
      className="notice"
      aria-label="Retired Gmail setup"
    >
      <p>This Gmail setup has retired.</p>
      <Link href="/gmail-hub" prefetch={false}>
        Open Workflow Communications
      </Link>
    </section>
  ) : null;
}
