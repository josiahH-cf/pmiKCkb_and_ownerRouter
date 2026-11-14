// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RenewalWorkspaceSidebars } from "@/components/lease-renewal/RenewalWorkspaceSidebars";
import { GlobalEntitySearch } from "@/components/search/GlobalEntitySearch";
import {
  PHONE_HEADER_QUERY,
  PHONE_TABLE_QUERY,
} from "@/components/hooks/useNarrowViewport";
import { resetTransientLayersForTests } from "@/lib/ui/transient-layer";

// S281 R-S281-7 to R-S281-10 (ARCH-S281-4, AC-S281-6): on a phone the app header is one row,
// the pinned lease header is two lines with "Lease details", the monthly table shows the lease
// identity and Next action together, and the path strip is one row. The phone layouts arrange
// controls (a trigger, a disclosure, a contained scroll); they hide none (S165 BEH-S165-10).
// These are the static and component contracts; the pixel budgets are measured by the browser
// pass at 360, 390 and 430 px. Fail-first on the starting state: the header wrapped to three
// rows with a full-width search field, the lease header wrapped to five lines, and the monthly
// table needed a sideways scroll to reach Next action. Values are synthetic.

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

interface CssRule {
  readonly selector: string;
  readonly body: string;
  readonly context: readonly string[];
}

function parseRules(css: string): CssRule[] {
  const text = stripComments(css);
  const rules: CssRule[] = [];
  const stack: { selector: string; bodyStart: number }[] = [];
  let segmentStart = 0;
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
        if (!body.includes("{"))
          rules.push({
            selector: open.selector,
            body: body.replace(/\s+/g, " ").trim(),
            context: stack.map((entry) => entry.selector),
          });
      }
      segmentStart = index + 1;
    }
  }
  return rules;
}

const globalsCss = read("app/globals.css");
const S281_MARKER = "S281: the deciding facts first";
const s281Block = globalsCss.slice(globalsCss.indexOf(S281_MARKER));
const s281Rules = parseRules(s281Block);
const ruleFor = (selector: string, context?: RegExp) =>
  s281Rules.find(
    (rule) =>
      (rule.selector === selector ||
        rule.selector.split(",").some((part) => part.trim() === selector)) &&
      (context
        ? rule.context.some((entry) => context.test(entry))
        : rule.context.length === 0),
  );

/** A phone or a wide screen: each "(max-width: Npx)" query matches when the width fits. */
function viewport(width: number) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const limit = /max-width:\s*(\d+)px/.exec(query);
      return {
        matches: limit ? width <= Number(limit[1]) : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  );
}

afterEach(() => {
  cleanup();
  resetTransientLayersForTests();
  vi.unstubAllGlobals();
});

describe("S281 the phone stylesheet arranges and hides nothing (ARCH-S281-4)", () => {
  it("the S281 rules sit inside the S165 phone pass and declare no display:none or visibility:hidden", () => {
    expect(globalsCss.indexOf("S165 mobile")).toBeGreaterThan(-1);
    expect(globalsCss.indexOf(S281_MARKER)).toBeGreaterThan(
      globalsCss.indexOf("S165 mobile"),
    );
    expect(stripComments(s281Block)).not.toMatch(/display:\s*none|visibility:\s*hidden/);
    // The shared lease toolbar keeps its owner's rules; S281 styles only its compact form.
    expect(
      s281Rules.filter((rule) =>
        rule.selector
          .split(",")
          .some((part) => part.trim() === ".renewal-workspace-toolbar"),
      ),
    ).toEqual([]);
  });

  it("R-S281-7: at 760 px the app header is one row and the utilities scroll inside it", () => {
    expect(PHONE_HEADER_QUERY).toBe("(max-width: 760px)");
    const narrow = /max-width: 760px/;
    expect(ruleFor(".topbar", narrow)?.body).toContain("flex-wrap: nowrap");
    expect(ruleFor(".topbar .primary-navigation", narrow)?.body).toContain("order: -1");
    const utilities = ruleFor(".topbar-utilities", narrow)?.body;
    expect(utilities).toContain("overflow-x: auto");
    expect(utilities).toContain("min-width: 0");
    // Wider screens keep the earlier header: the utilities wrapper takes no box of its own.
    expect(ruleFor(".topbar-utilities")?.body).toContain("display: contents");
    expect(ruleFor(".global-entity-search-trigger")?.body).toContain(
      "min-height: var(--target-min)",
    );
  });

  it("R-S281-8: the compact lease header keeps its rows on one line each", () => {
    const narrow = /max-width: 760px/;
    expect(ruleFor(".renewal-toolbar-identity-row", narrow)?.body).toContain(
      "flex-wrap: nowrap",
    );
    expect(ruleFor(".renewal-toolbar-summary", narrow)?.body).toContain(
      "text-overflow: ellipsis",
    );
    expect(ruleFor(".renewal-toolbar-stage-row", narrow)?.body).toContain(
      "overflow-x: auto",
    );
    expect(
      ruleFor(".renewal-lease-details[open] > .renewal-lease-details-body", narrow)?.body,
    ).toMatch(/max-height: [^;]*dvh/);
  });

  it("R-S281-9: at 430 px the lease identity and Next action share the first screen and the identity stays pinned", () => {
    expect(PHONE_TABLE_QUERY).toBe("(max-width: 430px)");
    const phone = /max-width: 430px/;
    expect(ruleFor(".renewal-batch-table-scroll")?.body).toContain(
      "container-type: inline-size",
    );
    expect(
      ruleFor(".renewal-batch-table :is(th, td):nth-child(-n + 2)", phone)?.body,
    ).toContain("width: 50cqi");
    const pinned = ruleFor(".renewal-batch-table :is(th, td):first-child", phone)?.body;
    expect(pinned).toContain("position: sticky");
    expect(pinned).toContain("left: 0");
  });

  it("R-S281-10: the path strip is one row that scrolls sideways inside itself", () => {
    const narrow = /max-width: 760px/;
    const steps = ruleFor(".renewal-path-strip .renewal-path-steps", narrow)?.body;
    expect(steps).toContain("flex-wrap: nowrap");
    expect(steps).toContain("overflow-x: auto");
  });

  it("R-S281-2: the exact review keeps its buttons in view and the body scrolls in its own area", () => {
    expect(
      ruleFor(".ui-confirmation-dialog.renewal-review-dialog .ui-dialog-actions")?.body,
    ).toContain("position: sticky");
    const body = ruleFor(".renewal-review-body")?.body;
    expect(body).toMatch(/max-height: \d+dvh/);
    expect(body).toContain("overflow-y: auto");
  });
});

describe("S281 phone header search (R-S281-7)", () => {
  it("AC-S281-6: at 390 px search is one trigger that opens the same field in place and folds back on Escape", async () => {
    viewport(390);
    const user = userEvent.setup();
    render(<GlobalEntitySearch />);
    expect(screen.queryByRole("combobox", { name: "Search records" })).toBeNull();
    const trigger = screen.getByRole("button", { name: "Search records" });
    expect(trigger).toHaveTextContent("Search");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    const field = screen.getByRole("combobox", { name: "Search records" });
    expect(field).toHaveFocus();
    expect(field.closest("[data-search-expanded]")).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("combobox", { name: "Search records" })).toBeNull();
    expect(screen.getByRole("button", { name: "Search records" })).toHaveFocus();
  });

  it("a typed query keeps the phone search open", async () => {
    viewport(390);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ results: [], limitations: [] }))),
    );
    const user = userEvent.setup();
    render(<GlobalEntitySearch />);
    await user.click(screen.getByRole("button", { name: "Search records" }));
    await user.keyboard("Maple");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("combobox", { name: "Search records" })).toHaveValue("Maple");
  });

  it("a wide screen keeps the search field in the header", () => {
    viewport(1280);
    render(<GlobalEntitySearch />);
    expect(screen.getByRole("combobox", { name: "Search records" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Search records" })).toBeNull();
  });
});

describe("S281 the pinned lease header on a phone (R-S281-8)", () => {
  function renderHeader() {
    return render(
      <RenewalWorkspaceSidebars
        identity="7001 Sample St · Alex Sample, Jordan Sample"
        identitySummary="7001 Sample St · 2 tenants"
        leaseInformation={<p>Current source facts</p>}
        rentvineHref="https://example.invalid/lease/7001"
        sectionNavigation={<nav aria-label="Renewal dashboard sections">Sections</nav>}
        viewSwitch={<button type="button">Full view</button>}
        workStatus={<button type="button">Work status</button>}
      >
        <p>Lease work</p>
      </RenewalWorkspaceSidebars>,
    );
  }

  it("AC-S281-6: at 390 px the header is the address with the tenant count and Lease details, then the stage with Work status", () => {
    viewport(390);
    const { container } = renderHeader();
    const toolbar = container.querySelector(".renewal-workspace-toolbar")!;
    expect(toolbar).toHaveAttribute("data-renewal-toolbar-compact");
    expect(toolbar.querySelector(".renewal-toolbar-summary")).toHaveTextContent(
      "7001 Sample St · 2 tenants",
    );
    const details = toolbar.querySelector<HTMLDetailsElement>(
      "[data-renewal-lease-details]",
    )!;
    expect(details.querySelector("summary")).toHaveTextContent("Lease details");
    // Nothing is removed: the full identity, RentVine link, view switch and panel toggles are
    // in Lease details, and Work status is on the stage row.
    expect(details).toHaveTextContent("Alex Sample, Jordan Sample");
    expect(
      details.querySelector('a[href="https://example.invalid/lease/7001"]'),
    ).not.toBeNull();
    expect(details).toHaveTextContent("Full view");
    expect(details).toHaveTextContent("Lease information");
    const stageRow = toolbar.querySelector(".renewal-toolbar-stage-row")!;
    expect(stageRow.querySelector("[data-renewal-view-switch]")).not.toBeNull();
    expect(stageRow).toHaveTextContent("Work status");
    const sections = screen.getByRole("navigation", {
      name: "Renewal dashboard sections",
    });
    expect(toolbar).not.toContainElement(sections);
    expect(container.querySelector(".renewal-workspace-body")).toContainElement(sections);
  });

  it("closing Lease information returns focus to its toggle inside an opened Lease details", () => {
    viewport(390);
    const { container } = renderHeader();
    const details = container.querySelector<HTMLDetailsElement>(
      "[data-renewal-lease-details]",
    )!;
    const toggle = screen.getByRole("button", { name: "Lease information" });
    expect(details.contains(toggle)).toBe(true);
    fireEvent.click(toggle);
    act(() => {
      details.open = false;
    });
    fireEvent.click(screen.getByRole("button", { name: "Close lease information" }));
    expect(details.open).toBe(true);
    expect(toggle).toHaveFocus();
  });

  it("a wide screen keeps the earlier one-row toolbar", () => {
    viewport(1280);
    const { container } = renderHeader();
    const toolbar = container.querySelector(".renewal-workspace-toolbar")!;
    expect(toolbar).not.toHaveAttribute("data-renewal-toolbar-compact");
    expect(toolbar.querySelector("[data-renewal-lease-details]")).toBeNull();
    expect(toolbar).toContainElement(
      screen.getByRole("navigation", { name: "Renewal dashboard sections" }),
    );
    expect(screen.getByRole("button", { name: "Lease information" })).toBeInTheDocument();
  });
});

describe("S281 the monthly desk on a phone (R-S281-9)", () => {
  it("the Prepare block and the filters each take one expandable row at 430 px and narrower", () => {
    const source = read("components/lease-renewal/RenewalWorkingBatch.tsx");
    expect(source).toContain(
      "<PhoneRow label={`Prepare ${renewalBatchMonthInWords(month)} leases`}>",
    );
    expect(source).toContain('<PhoneRow label="Filter renewals">');
    expect(source).toMatch(
      /function PhoneRow[\s\S]*?useNarrowViewport\(PHONE_TABLE_QUERY\)[\s\S]*?if \(!phone\) return <>\{children\}<\/>;[\s\S]*?<details className="renewal-batch-phone-row"/,
    );
  });
});
