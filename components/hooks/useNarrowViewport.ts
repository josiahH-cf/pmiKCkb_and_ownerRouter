"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * S281 R-S281-7 to R-S281-9: the phone-width layouts choose their arrangement here rather than in
 * a stylesheet rule that hides a control (S165 BEH-S165-10). Server rendering and any environment
 * without matchMedia take the wide arrangement; a narrow viewport switches after hydration.
 */
export const PHONE_HEADER_QUERY = "(max-width: 760px)";
export const PHONE_TABLE_QUERY = "(max-width: 430px)";

function matches(query: string): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches
  );
}

export function useNarrowViewport(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function")
        return () => undefined;
      const media = window.matchMedia(query);
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
      }
      media.addListener?.(onChange);
      return () => media.removeListener?.(onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => matches(query),
    () => false,
  );
}
