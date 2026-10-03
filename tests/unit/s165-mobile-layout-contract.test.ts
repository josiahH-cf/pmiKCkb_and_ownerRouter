// S165: the static contract for the whole-app phone pass (360 to 430 px wide, portrait, touch).
// These checks read the real stylesheets, root layout and component markup. They pin the shared
// hazards a phone exposes: page-level horizontal overflow from wide tables, sticky and fixed
// controls that crowd out a focused field, dialogs sized by the static viewport, small touch
// targets and hover-only information. They are not a device observation; the browser pass is
// listed in the S165 mobile checklist.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { APP_VIEWPORT } from "@/lib/ui/app-viewport";
import {
  MOBILE_COVERAGE_AREAS,
  MOBILE_VIEWPORT_WIDTHS,
  THEME_EXPERIENCE_LEDGER,
} from "@/lib/ui/theme-surface-ledger";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const stripSourceComments = (source: string) =>
  stripComments(source).replace(/(^|[^:])\/\/.*$/gm, "$1");

const STYLE_FILES = [
  "styles/theme.css",
  "styles/tokens.css",
  "styles/interactions.css",
  "app/globals.css",
];
const globalsCss = read("app/globals.css");
const S165_MARKER = "S165 mobile";
const s165Block = stripComments(globalsCss.slice(globalsCss.indexOf(S165_MARKER)));

interface CssRule {
  readonly selector: string;
  readonly body: string;
  /** Enclosing at-rules, outermost first (for example "@media (max-width: 560px)"). */
  readonly context: readonly string[];
  readonly order: number;
}

/** Flat rule list across the app stylesheets in cascade order. */
function parseRules(css: string, startOrder = 0): CssRule[] {
  const text = stripComments(css);
  const rules: CssRule[] = [];
  const stack: { selector: string; bodyStart: number }[] = [];
  let segmentStart = 0;
  let order = startOrder;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") {
      stack.push({
        selector: text.slice(segmentStart, index).trim().replace(/\s+/g, " "),
        bodyStart: index + 1,
      });
      segmentStart = index + 1;
    } else if (char === "}") {
      const open = stack.pop();
      if (open) {
        const body = text.slice(open.bodyStart, index);
        if (!body.includes("{")) {
          rules.push({
            selector: open.selector,
            body: body.replace(/\s+/g, " ").trim(),
            context: stack.map((entry) => entry.selector),
            order: (order += 1),
          });
        }
      }
      segmentStart = index + 1;
    }
  }

  return rules;
}

const allRules = STYLE_FILES.reduce<CssRule[]>(
  (rules, file) => [...rules, ...parseRules(read(file), rules.length)],
  [],
);
const s165Rules = parseRules(globalsCss.slice(globalsCss.indexOf(S165_MARKER)));

const selectorsOf = (rule: CssRule) =>
  rule.selector.split(",").map((part) => part.trim());
const s165RulesFor = (selector: string, context?: RegExp) =>
  s165Rules.filter(
    (rule) =>
      selectorsOf(rule).includes(selector) &&
      (context
        ? rule.context.some((entry) => context.test(entry))
        : rule.context.length === 0),
  );

function walk(directory: string, predicate: (path: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path, predicate));
    else if (predicate(path)) found.push(path);
  }
  return found;
}

const componentFiles = [
  ...walk(join(ROOT, "components"), (path) => path.endsWith(".tsx")),
  ...walk(join(ROOT, "app"), (path) => path.endsWith(".tsx")),
];

describe("S165 viewport (BEH-S165-4, BEH-S165-5)", () => {
  it("the root layout declares a phone viewport that uses the safe areas and resizes for the keyboard", () => {
    expect(APP_VIEWPORT).toMatchObject({
      width: "device-width",
      initialScale: 1,
      viewportFit: "cover",
      interactiveWidget: "resizes-content",
    });
    expect(read("app/layout.tsx")).toMatch(
      /export const viewport(?:: Viewport)? = APP_VIEWPORT;/,
    );
  });

  it("never disables pinch zoom", () => {
    expect(APP_VIEWPORT).not.toHaveProperty("maximumScale");
    expect(APP_VIEWPORT).not.toHaveProperty("userScalable");
  });

  it("form controls keep the inherited 16px text size, so focusing a field does not zoom the page", () => {
    const sized = allRules.filter(
      (rule) =>
        /(^|[\s,>+~(])(input|select|textarea)\b/.test(rule.selector) &&
        /(^|[;\s])font-size\s*:/.test(rule.body),
    );
    expect(sized.map((rule) => rule.selector)).toEqual([]);
    expect(globalsCss).toMatch(
      /button,\s*input,\s*select,\s*textarea\s*\{\s*font: inherit;/,
    );
  });
});

describe("S165 no page-level horizontal scroll (AC-S165-2, BEH-S165-4)", () => {
  it("the only rule wider than a phone is the renewal table, inside its own scroll region", () => {
    const wide = allRules.filter((rule) => {
      const match = /(?:^|[;\s])(?:min-width|width):\s*(\d+)px/.exec(rule.body);
      return match !== null && Number(match[1]) > 430 && rule.context.length === 0;
    });
    expect(wide.map((rule) => rule.selector)).toEqual([".renewal-table"]);

    const region = allRules.find((rule) => rule.selector === ".renewal-table-scroll");
    expect(region?.body).toContain("overflow-x: auto");
    expect(region?.body).toContain("max-width: 100%");
  });

  it("the renewal table region is labelled and reachable without a pointer", () => {
    const desk = read("components/lease-renewal/RenewalDeskTable.tsx");
    const region =
      /<div\s+className="renewal-table-scroll"[\s\S]*?>\s*<table className="renewal-table">/.exec(
        desk,
      );
    expect(region?.[0]).toContain('role="region"');
    expect(region?.[0]).toContain("aria-label=");
    expect(region?.[0]).toContain("tabIndex={0}");
  });

  it("every table in the app sits inside a contained horizontal scroll wrapper", () => {
    const wrappers = ["table-scroll", "table-wrap", "renewal-table-scroll"];
    const unwrapped: string[] = [];

    for (const file of componentFiles) {
      const source = stripSourceComments(readFileSync(file, "utf8"));
      for (const match of source.matchAll(/<table[\s>]/g)) {
        const before = source.slice(Math.max(0, match.index - 400), match.index);
        const lastOpenDiv = before.lastIndexOf("<div");
        const wrapper = lastOpenDiv === -1 ? "" : before.slice(lastOpenDiv);
        if (!wrappers.some((name) => wrapper.includes(name))) {
          unwrapped.push(relative(ROOT, file).split(sep).join("/"));
        }
      }
    }

    expect(unwrapped).toEqual([]);
    for (const name of wrappers) {
      const rule = s165Rules.find((entry) => selectorsOf(entry).includes(`.${name}`));
      expect(rule?.body, `.${name} must scroll inside itself`).toContain(
        "overflow-x: auto",
      );
      expect(rule?.body).toContain("max-width: 100%");
    }
  });

  it("the document itself is never clipped to hide overflow", () => {
    for (const rule of allRules) {
      if (selectorsOf(rule).some((selector) => /^(html|body)$/.test(selector))) {
        expect(rule.body).not.toMatch(/overflow(-x)?:\s*hidden/);
      }
    }
  });

  it("long unbroken values (hashes, keys, links) wrap instead of widening the page", () => {
    expect(s165Block).toMatch(/:where\(code, \.mono\)\s*\{[^}]*overflow-wrap: anywhere;/);
  });
});

describe("S165 viewport-relative sizing follows the visible area (BEH-S165-5)", () => {
  it("every full-height or height-capped rule sized in vh is restated in dvh later in the cascade", () => {
    const staticViewport = allRules.filter((rule) =>
      /(?:min-height|max-height):[^;]*\b\d+vh\b/.test(rule.body),
    );
    expect(staticViewport.length).toBeGreaterThan(0);

    for (const rule of staticViewport) {
      for (const selector of selectorsOf(rule)) {
        const restated = allRules.some(
          (later) =>
            later.order > rule.order &&
            selectorsOf(later).includes(selector) &&
            /(?:min-height|max-height):[^;]*\ddvh\b/.test(later.body),
        );
        expect(restated, `${selector} must also be sized in dvh`).toBe(true);
      }
    }
  });

  it("a dialog never grows past the visible area and scrolls inside itself", () => {
    const confirmation = s165RulesFor(".ui-confirmation-dialog")[0];
    expect(confirmation?.body).toContain("max-height: calc(100dvh - 2rem)");

    const anyDialog = s165Rules.find(
      (rule) => rule.selector === ":where(.ui-dialog-backdrop > *)",
    );
    expect(anyDialog?.body).toContain("100dvh");
    expect(anyDialog?.body).toContain("overflow-y: auto");
  });
});

describe("S165 sticky and fixed controls leave fields and actions reachable (BEH-S165-5)", () => {
  it("the fixed feedback control respects the safe areas", () => {
    const rule = s165RulesFor(".report-issue-trigger")[0];
    expect(rule?.body).toContain("env(safe-area-inset-bottom)");
    expect(rule?.body).toContain("env(safe-area-inset-right)");
  });

  it("on a phone the page keeps room below its last action to scroll clear of that control", () => {
    const content = s165RulesFor(".content", /max-width: 560px/)[0];
    expect(content?.body).toMatch(
      /padding-bottom: calc\(\d+px \+ env\(safe-area-inset-bottom\)\)/,
    );
  });

  it("with the keyboard open (a short viewport) the feedback control and the lease toolbar stop floating over the page", () => {
    const short = /max-height: 520px/;
    expect(s165RulesFor(".report-issue-trigger", short)[0]?.body).toContain(
      "position: static",
    );
    expect(s165RulesFor(".renewal-workspace-toolbar", short)[0]?.body).toContain(
      "position: static",
    );
  });

  it("the lease toolbar is height-limited on a tablet and scrolls with the page on a phone", () => {
    const tablet = s165RulesFor(".renewal-workspace-toolbar", /max-width: 760px/)[0];
    expect(tablet?.body).toMatch(/max-height: [^;]*dvh/);
    expect(tablet?.body).toContain("overflow-y: auto");

    const phone = s165RulesFor(".renewal-workspace-toolbar", /max-width: 560px/)[0];
    expect(phone?.body).toContain("position: static");
  });

  it("side panels fill a phone screen without a viewport-width overflow and clear the home indicator", () => {
    expect(s165RulesFor(".renewal-slide-panel", /max-width: 720px/)[0]?.body).toContain(
      "width: 100%",
    );
    expect(s165RulesFor(".renewal-slide-panel")[0]?.body).toContain(
      "env(safe-area-inset-bottom)",
    );
  });

  it("page content stays clear of a notch or rounded corner", () => {
    const body = s165RulesFor("body")[0];
    expect(body?.body).toContain("padding-left: env(safe-area-inset-left)");
    expect(body?.body).toContain("padding-right: env(safe-area-inset-right)");
  });
});

describe("S165 touch use without hover (BEH-S165-3, AC-S165-2)", () => {
  it("controls that were under 44px reach the shared touch target on a touch screen", () => {
    const coarse = /pointer: coarse/;
    for (const selector of [
      ".compact-button",
      ".renewal-copy-button",
      ".work-actions button",
      ".work-inline-form button",
      ".work-form-grid button",
    ]) {
      expect(
        s165RulesFor(selector, coarse)[0]?.body,
        `${selector} must be a 44px target on touch`,
      ).toContain("min-height: var(--target-min)");
    }
  });

  it("no other button-like rule declares a fixed target under 44px", () => {
    const known = new Set([
      ".compact-button",
      ".renewal-copy-button",
      ".work-actions button, .work-inline-form button, .work-form-grid button",
    ]);
    const small = allRules.filter((rule) => {
      const match = /(?:^|[;\s])min-height:\s*(\d+)px/.exec(rule.body);
      return (
        match !== null &&
        Number(match[1]) < 44 &&
        /button|trigger|chip|tab\b|toggle|summary|option|remove|close/.test(
          rule.selector,
        ) &&
        !rule.selector.includes("::") &&
        rule.context.length === 0
      );
    });
    expect(small.map((rule) => rule.selector).filter((sel) => !known.has(sel))).toEqual(
      [],
    );
  });

  it("an explanation carried only by a hover title is shown as text where there is no hover", () => {
    const noHover = /hover: none/;
    for (const selector of [
      ".renewal-lifecycle[title]::after",
      '[data-renewal-field="move-out-timing"][title]::after',
      ".renewal-issue-summary[title]::after",
    ]) {
      expect(
        s165RulesFor(selector, noHover)[0]?.body,
        `${selector} must show its title text on touch`,
      ).toContain("content: attr(title)");
    }
  });

  it("nothing is revealed by hover alone: every hover reveal also opens on focus or tap", () => {
    const hoverReveals = allRules.filter(
      (rule) =>
        rule.selector.includes(":hover") &&
        /(?:^|[;\s])(?:display|visibility|opacity)\s*:/.test(rule.body),
    );
    for (const rule of hoverReveals) {
      expect(rule.selector, "a hover reveal needs a focus or state equivalent").toMatch(
        /:focus|\[aria-/,
      );
    }
  });
});

describe("S165 viewport rules hide nothing (BEH-S165-10)", () => {
  it("the phone pass removes no control: no display:none or visibility:hidden in its rules", () => {
    expect(s165Block.length).toBeGreaterThan(200);
    expect(s165Block).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  });

  it("leaves the renewal Focus/Full view switch rules to their owner", () => {
    expect(s165Block).not.toContain(".renewal-view-switch");
  });
});

describe("S165 surface coverage (BEH-S165-6)", () => {
  it("checks phones at 360, 390 and 430 px wide", () => {
    expect(MOBILE_VIEWPORT_WIDTHS).toEqual([360, 390, 430]);
  });

  it("assigns every surface in the ledger to exactly one coverage area from the specification", () => {
    expect(MOBILE_COVERAGE_AREAS.map((entry) => entry.area)).toEqual([
      "Sign-in and session",
      "Dashboard / AI",
      "My Work / notifications",
      "Lease renewal",
      "Knowledge / processes",
      "Maintenance",
      "Communications / connections",
      "Administration",
      "Vendor",
    ]);

    const assigned = MOBILE_COVERAGE_AREAS.flatMap((entry) => entry.surfaces);
    expect(new Set(assigned).size).toBe(assigned.length);
    expect([...assigned].sort()).toEqual(
      THEME_EXPERIENCE_LEDGER.map((entry) => entry.id).sort(),
    );
    for (const entry of MOBILE_COVERAGE_AREAS) {
      expect(entry.surfaces.length).toBeGreaterThan(0);
      expect(entry.tasks.length).toBeGreaterThan(0);
    }
  });
});
