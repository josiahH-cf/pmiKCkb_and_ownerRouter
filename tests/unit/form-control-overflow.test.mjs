import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, it } from "vitest";

// Regression coverage for the 2026-08-17 phone-width overflow: a bare <select> sizes to its widest
// option, so the /admin "Stop a Production Action" picker (option text carries the full action key)
// pushed the document to 783px against a 375px viewport, and /processes to 390px. The fix caps every
// form control and field wrapper at its container globally instead of adding one more per-surface
// override. Falsified in-page before shipping: injecting the rule took /admin 783 -> 375 and
// /processes 390 -> 375, and removing it restored both.

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(^|\\n)${escaped}[^{]*\\{([^}]*)\\}`));
  return match ? match[2] : null;
}

function blockContaining(selector, declaration) {
  const blocks = css.split("}");
  return blocks.some((block) => {
    const [head = "", body = ""] = block.split("{");
    const selectors = head
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return selectors.includes(selector) && body.includes(declaration);
  });
}

it("caps every form control at its container width", () => {
  for (const control of ["input", "select", "textarea"]) {
    expect(
      blockContaining(control, "max-width: 100%"),
      `${control} must not be allowed to exceed its container`,
    ).toBe(true);
    expect(
      blockContaining(control, "min-width: 0"),
      `${control} must be allowed to shrink inside a grid or flex track`,
    ).toBe(true);
    expect(
      blockContaining(control, "box-sizing: border-box"),
      `${control} padding must not add to its capped width`,
    ).toBe(true);
  }
});

it("caps the shared field wrappers that hold those controls", () => {
  for (const wrapper of [".field", ".field-label", "fieldset"]) {
    expect(blockContaining(wrapper, "max-width: 100%"), `${wrapper} must be capped`).toBe(
      true,
    );
    expect(
      blockContaining(wrapper, "min-width: 0"),
      `${wrapper} must be shrinkable`,
    ).toBe(true);
  }
});

it("does not force a width on globally capped controls", () => {
  // Forcing width:100% globally would restyle intentionally auto-sized controls; the cap alone
  // is what fixes the overflow.
  const globalControlBlock = ruleBody("input,\nselect,\ntextarea");
  expect(globalControlBlock).not.toBeNull();
  expect(globalControlBlock).not.toMatch(/(^|[^-])width:\s*100%/);
});
