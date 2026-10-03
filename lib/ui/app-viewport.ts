import type { Viewport } from "next";

/**
 * S165: the one viewport declaration for every page.
 *
 * - `width` / `initialScale`: lay the page out at the device width, unzoomed.
 * - `viewportFit: "cover"`: expose the safe-area insets so fixed controls and the page edges can
 *   stay clear of a notch, rounded corners and the home indicator (see the S165 block in
 *   app/globals.css).
 * - `interactiveWidget: "resizes-content"`: when the onscreen keyboard opens, the layout area
 *   shrinks with it, so dialogs sized in dvh and fixed controls stay inside what is visible.
 *
 * Pinch zoom is deliberately left on: no maximum scale and no user-scalable restriction.
 */
export const APP_VIEWPORT: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};
