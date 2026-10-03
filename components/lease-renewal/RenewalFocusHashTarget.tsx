"use client";

import { useEffect } from "react";

import { focusRenewalDashboardControl } from "./RenewalDashboardNavigation";

const NATIVELY_FOCUSABLE = new Set(["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"]);

/**
 * S127 (R-F07-03): when a workspace URL carries a section or control id in its hash (the desk's
 * blocker links, the next-action link, a refresh that returns to the same control), move keyboard
 * focus to that element after render, so activating an issue lands on the resolution point rather
 * than the top of the page. Effect-free otherwise; it never navigates, saves or changes state.
 * S152: a lease opens in Focus view, so a linked control that the current task does not show is
 * offered to the Focus view first, which chooses the task that owns it or shows it in Full view.
 */
export function RenewalFocusHashTarget() {
  useEffect(() => {
    const focusTarget = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const element = document.getElementById(id);
      if (!(element instanceof HTMLElement)) return;
      if (element.closest("[data-renewal-focus-hidden]")) {
        focusRenewalDashboardControl(id, { focusContainer: true });
        return;
      }
      if (!element.hasAttribute("tabindex") && !NATIVELY_FOCUSABLE.has(element.tagName)) {
        element.setAttribute("tabindex", "-1");
      }
      element.focus();
    };
    // After the Focus view has revealed its task and attached its request listener.
    const frame = window.requestAnimationFrame(focusTarget);
    window.addEventListener("hashchange", focusTarget);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", focusTarget);
    };
  }, []);
  return null;
}
