"use client";
import { useSyncExternalStore } from "react";

// S233: one shared minute clock for time-relative labels ("Incoming checked 3 min ago", a past-due
// lag). Reading the clock during render is impure, so the time arrives as an external store.

const MINUTE_MS = 60_000;

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, MINUTE_MS);
  return () => clearInterval(id);
}

/** Stable within a minute, so React sees one snapshot per tick. */
function snapshot(): number {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

function serverSnapshot(): number | null {
  return null;
}

/** The current minute; null during server rendering, when no relative label is shown. */
export function useMinuteClock(): number | null {
  return useSyncExternalStore<number | null>(subscribe, snapshot, serverSnapshot);
}
