// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  focusRenewalDashboardControl,
  focusRenewalStepPrimary,
  offerRenewalJumpReturn,
  RENEWAL_FOCUS_REQUEST_EVENT,
  RENEWAL_STEP_PRIMARY_REQUEST_EVENT,
  RenewalJumpReturn,
  renewalLandingLabel,
  returnFromRenewalJump,
  type RenewalFocusRequestDetail,
} from "@/components/lease-renewal/RenewalDashboardNavigation";

// S281 R-S281-5 (ARCH-S281-2, BEH-S281-5, AC-S281-4): the navigation helper owns landing and
// return. A jump scrolls so the landed control's label is fully below the sticky toolbar (the
// label is scrolled to, with the toolbar's height as its margin), records the control the jump
// started from, and a jump between Full view sections offers "Return to {step}", which focuses
// that exact control. A return whose landing is gone lands on the step's primary action.
// Fail-first on the starting state: the helper scrolled the control itself, carried no origin
// and offered no return. The page here is a synthetic Full view fragment.

function page() {
  document.body.innerHTML = `
    <div class="renewal-workspace-shell">
      <div class="renewal-workspace-toolbar">Lease toolbar</div>
      <div class="renewal-workspace-body">
        <section id="renewal-section-owner" aria-label="Owner approval">
          <a class="text-link" href="#renewal-now-rent-to-recommend" id="owner-edit">Edit rent to recommend</a>
          <section data-renewal-outcome="offer-tenant">
            <button data-renewal-work-primary id="offer-primary" type="button">Review and send</button>
          </section>
        </section>
        <section id="renewal-section-comps" aria-label="Market rent comparison">
          <label for="renewal-now-rent-to-recommend" id="rent-label">Rent to recommend</label>
          <input id="renewal-now-rent-to-recommend" />
          <fieldset id="renewal-dates">
            <legend id="dates-legend">Working renewal terms</legend>
            <input aria-label="Working effective date" id="renewal-working-start" />
          </fieldset>
        </section>
      </div>
    </div>`;
}

let scrolled: Element[] = [];

beforeEach(() => {
  scrolled = [];
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    scrolled.push(this);
  });
  page();
});

afterEach(() => {
  cleanup();
  offerRenewalJumpReturn(null);
  document.body.innerHTML = "";
});

describe("S281 landing with the label visible (ARCH-S281-2)", () => {
  it("BEH-S281-5: a landed field scrolls to its label, and a fieldset field to its legend", () => {
    expect(
      renewalLandingLabel(document.getElementById("renewal-now-rent-to-recommend")!),
    ).toBe(document.getElementById("rent-label"));
    expect(renewalLandingLabel(document.getElementById("renewal-working-start")!)).toBe(
      document.getElementById("dates-legend"),
    );
    expect(focusRenewalDashboardControl("renewal-now-rent-to-recommend")).toBe(true);
    expect(document.activeElement).toBe(
      document.getElementById("renewal-now-rent-to-recommend"),
    );
    expect(scrolled.at(-1)).toBe(document.getElementById("rent-label"));
    focusRenewalDashboardControl("renewal-dates");
    expect(scrolled.at(-1)).toBe(document.getElementById("dates-legend"));
  });

  it("ARCH-S281-2: the focus request carries the control the jump started from", () => {
    const origins: Array<HTMLElement | null | undefined> = [];
    const listen = (event: Event) =>
      origins.push((event as CustomEvent<RenewalFocusRequestDetail>).detail.origin);
    document.addEventListener(RENEWAL_FOCUS_REQUEST_EVENT, listen);
    const origin = document.getElementById("owner-edit")!;
    origin.focus();
    focusRenewalDashboardControl("renewal-now-rent-to-recommend");
    document.removeEventListener(RENEWAL_FOCUS_REQUEST_EVENT, listen);
    expect(origins).toEqual([origin]);
  });
});

describe("S281 the way back (R-S281-5)", () => {
  it("AC-S281-4: a jump to another section offers Return to {step}, which focuses the exact control it started from", async () => {
    const host = document.createElement("div");
    document.querySelector(".renewal-workspace-body")!.prepend(host);
    render(<RenewalJumpReturn />, { container: host });
    const origin = document.getElementById("owner-edit")!;
    origin.focus();
    act(() => {
      focusRenewalDashboardControl("renewal-now-rent-to-recommend");
    });
    const back = await screen.findByRole("button", { name: "Return to owner approval" });
    await userEvent.setup().click(back);
    expect(document.activeElement).toBe(origin);
    expect(screen.queryByRole("button", { name: "Return to owner approval" })).toBeNull();
  });

  it("a jump within one section offers no way back", () => {
    const origin = document.getElementById("rent-label")!;
    origin.tabIndex = -1;
    origin.focus();
    focusRenewalDashboardControl("renewal-dates");
    expect(returnFromRenewalJump()).toBe(false);
  });

  it("BEH-S281-5: a return whose landing is gone lands on the step's primary action (Full view)", () => {
    expect(focusRenewalStepPrimary("offer-tenant")).toBe(true);
    expect(document.activeElement).toBe(document.getElementById("offer-primary"));
  });

  it("the Guided view answers a step primary request itself", () => {
    const answered: string[] = [];
    const listen = (event: Event) => {
      event.preventDefault();
      answered.push((event as CustomEvent<{ stepId: string }>).detail.stepId);
    };
    document.addEventListener(RENEWAL_STEP_PRIMARY_REQUEST_EVENT, listen);
    expect(focusRenewalStepPrimary("offer-tenant")).toBe(true);
    document.removeEventListener(RENEWAL_STEP_PRIMARY_REQUEST_EVENT, listen);
    expect(answered).toEqual(["offer-tenant"]);
    expect(document.activeElement).not.toBe(document.getElementById("offer-primary"));
  });
});
