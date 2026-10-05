"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

// S58: the desk's manual-refresh control plus conditional focus revalidation.
//
// The button forces a provider read (the server route rate-limits per operator, so a held-down
// click cannot become load against RentVine). Regaining window focus revalidates ONLY when the
// rendered snapshot is already older than the soft TTL; tabbing back and forth with fresh data
// makes no request at all. Both paths finish with router.refresh() so the server component
// re-renders from the updated cache. Refresh stays demand-driven: no timer or interval here.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

export function RenewalDeskRefresh({
  readAtMs,
  ttlMs,
  id = "renewal-refresh",
  label = "Refresh data",
}: Readonly<{ readAtMs: number; ttlMs: number; id?: string; label?: string }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const live = useRef(true);
  const waitingSnapshot = useRef(false);
  const startingRead = useRef(readAtMs);
  const expectsNewRead = useRef(true);
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [renderPending, startRender] = useTransition();
  const sawRenderPending = useRef(false);
  const finish = useCallback(() => {
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = null;
    waitingSnapshot.current = false;
    inFlight.current = false;
    if (live.current) setBusy(false);
  }, []);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, []);
  useEffect(() => {
    if (renderPending) sawRenderPending.current = true;
    if (
      waitingSnapshot.current &&
      (readAtMs !== startingRead.current ||
        (!expectsNewRead.current && sawRenderPending.current && !renderPending))
    )
      finish();
  }, [readAtMs, renderPending, finish]);

  const request = useCallback(
    async (mode: "force" | "revalidate") => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      startingRead.current = readAtMs;
      sawRenderPending.current = false;
      setError("");
      try {
        const response = await fetch("/api/lease-renewal/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            body?.error ??
              "The source refresh did not complete. The previous data is still shown; retry the read.",
          );
        }
        const body = (await response.json()) as {
          state?: string;
          lastError?: string | null;
          readAtIso?: string;
          throttled?: boolean;
        };
        if (body.state === "failed" || body.lastError)
          throw new Error(
            body.lastError ??
              "The source read failed. The previous data is still shown; retry the read.",
          );
        if (!live.current) return;
        expectsNewRead.current =
          !body.throttled &&
          (!body.readAtIso || Date.parse(body.readAtIso) !== startingRead.current);
        waitingSnapshot.current = true;
        renderTimer.current = setTimeout(() => {
          if (live.current)
            setError(
              "The refreshed view has not arrived. The previous data is still shown; retry the read.",
            );
          finish();
        }, 60_000);
        startRender(() => router.refresh());
      } catch (cause) {
        if (live.current)
          setError(
            cause instanceof Error
              ? cause.message
              : "The source refresh did not complete. The previous data is still shown; retry the read.",
          );
      } finally {
        if (!waitingSnapshot.current) finish();
      }
    },
    [router, readAtMs, finish],
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
    <span className="ui-stack-tight">
      <button
        id={id}
        className="secondary-button"
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={() => void request("force")}
        type="button"
      >
        {busy ? "Refreshing" : label}
      </button>
      {error ? (
        <span role="alert" className="error-text">
          {error}
        </span>
      ) : null}
    </span>
  );
}
