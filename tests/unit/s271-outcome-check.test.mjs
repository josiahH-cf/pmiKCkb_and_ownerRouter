// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  NOVEMBER_TEN_NEGATIVE_CONTROLS,
  injectNovemberTenDefect,
  novemberTenOutcomeFaults,
  restoreNovemberTenDefect,
} from "../browser/one-path-november-10-outcome-check.mjs";
import { NEGATIVE_CONTROLS } from "../browser/one-path-november-10-qualification-verdict.mjs";

// S271 ARCH-S271-4 / AC-S271-4: the rendered verifier rejects each deliberate defect by name, and
// its injections are reversible so a clean page reads clean again.

const clean = {
  workAreas: 1,
  evidenceAreas: 1,
  looseControls: 0,
  evidenceOpen: false,
  effectsInEvidence: false,
  duplicateEditors: false,
  visibleCue: true,
  competingSend: false,
  inactive: false,
  openStacks: 0,
  stackedGroups: false,
  unnamedGroups: 0,
  leadFirst: true,
};

describe("S271 rendered outcome faults", () => {
  it("accepts focused work, closed evidence and named closed groups", () => {
    expect(novemberTenOutcomeFaults(clean)).toEqual([]);
  });

  it.each([
    [{ openStacks: 1 }, "old open stacks"],
    [{ stackedGroups: true }, "old open stacks"],
    [{ unnamedGroups: 1 }, "old open stacks"],
    [{ leadFirst: false }, "active work not first"],
    [{ duplicateEditors: true }, "duplicate working rent editor"],
    [{ effectsInEvidence: true }, "effectful evidence"],
    [{ visibleCue: false }, "next action or fix is hidden"],
    [{ competingSend: true }, "send competes with reconciliation"],
    [{ evidenceOpen: true }, "evidence initially open"],
    [{ looseControls: 2 }, "unconsolidated"],
  ])("rejects %o", (defect, fault) => {
    expect(novemberTenOutcomeFaults({ ...clean, ...defect })).toContain(fault);
  });

  it("keeps an inactive outcome without a cue acceptable", () => {
    expect(
      novemberTenOutcomeFaults({ ...clean, visibleCue: false, inactive: true }),
    ).toEqual([]);
  });

  it("names a rendered fault for every negative control the verdict requires", () => {
    expect(Object.keys(NOVEMBER_TEN_NEGATIVE_CONTROLS).sort()).toEqual(
      [...NEGATIVE_CONTROLS].sort(),
    );
  });
});

describe("S271 negative-control injections are reversible", () => {
  const scope = () => {
    document.body.innerHTML = `
      <section data-renewal-outcome="compare-market" data-renewal-work-state="current">
        <div data-renewal-work><button data-renewal-work-primary>Continue</button></div>
        <details class="renewal-secondary-work" data-renewal-secondary-work data-renewal-group="Comparison inputs and deliberate rerun"><summary>Comparison inputs and deliberate rerun</summary></details>
        <details data-renewal-verification><summary>Verify market comparison</summary></details>
      </section>`;
    return document.querySelector("section");
  };

  it.each(Object.keys(NOVEMBER_TEN_NEGATIVE_CONTROLS))(
    "injects and restores %s",
    (defect) => {
      const node = scope();
      const before = node.outerHTML;
      injectNovemberTenDefect(node, defect);
      expect(node.outerHTML).not.toBe(before);
      restoreNovemberTenDefect(node);
      expect(node.outerHTML).toBe(before);
    },
  );

  it("opens the existing groups and adds an unnamed stack for old open stacks", () => {
    const node = scope();
    injectNovemberTenDefect(node, "oldOpenStacks");
    const open = [...node.querySelectorAll("details[data-renewal-secondary-work]")];
    expect(open.every((details) => details.open)).toBe(true);
    expect(open.some((details) => !details.hasAttribute("data-renewal-group"))).toBe(
      true,
    );
  });
});
