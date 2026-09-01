// Optional S85 adapter for downstream transient-layer coordination. Appearance remains fully
// functional without a coordinator; S86/S84 may request a close when another disclosure opens.
export const APPEARANCE_CLOSE_EVENT = "pmi:appearance-close";

export function requestAppearanceClose() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(APPEARANCE_CLOSE_EVENT));
  }
}

export function registerAppearanceClose(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(APPEARANCE_CLOSE_EVENT, listener);
  return () => window.removeEventListener(APPEARANCE_CLOSE_EVENT, listener);
}
