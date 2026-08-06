"use client";

// S58: the desk's manual-refresh control plus conditional focus revalidation.
//
// The button forces a provider read (the server route rate-limits per operator, so a held-down
// click cannot become load against RentVine). Regaining window focus revalidates ONLY when the
// rendered snapshot is already older than the soft TTL; tabbing back and forth with fresh data
// makes no request at all. Both paths finish with router.refresh() so the server component
// re-renders from the updated cache. Refresh stays demand-driven: no timer or interval here.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export function RenewalDeskRefresh({
  readAtMs,
  ttlMs,
}: Readonly<{ readAtMs: number; ttlMs: number }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const request = useCallback(
    async (mode: "force" | "revalidate") => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (mode === "force") setBusy(true);
      try {
        await fetch("/api/lease-renewal/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        router.refresh();
      } catch {
        // The server render already carries the could-not-refresh state; nothing to add here.
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - readAtMs > ttlMs) {
        void request("revalidate");
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [readAtMs, ttlMs, request]);

  return (
    <button
      className="secondary-button"
      disabled={busy}
      onClick={() => void request("force")}
      type="button"
    >
      {busy ? "Refreshing" : "Refresh data"}
    </button>
  );
}
