// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImgHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    const rest = { ...props };
    delete rest.unoptimized;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...rest} alt={props.alt ?? ""} />;
  },
}));

import {
  HELP_TOC_LEADING,
  HELP_TOC_TRAILING,
  helpTocGroups,
} from "@/components/help/HelpFrame";
import { HelpTableOfContents } from "@/components/help/HelpTableOfContents";
import {
  HelpGuidePage,
  HelpLanding,
  HelpSectionPage,
  HelpWholeManual,
} from "@/components/help/HelpViews";
import { HELP_GUIDES, guidesInSection } from "@/lib/help";
import { helpGuideHref } from "@/lib/help/links";
import { HELP_SECTIONS } from "@/lib/help/sections";
import { HELP_VERSION } from "@/lib/help/version";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.location.hash = "";
});

describe("S242 BEH-S242-1: Help landing", () => {
  it("states the help version, the serving release and offers print and What changed", () => {
    render(<HelpLanding moved={false} servingCommit={COMMIT} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "PMI KC staff help" }),
    ).toBeVisible();
    expect(screen.getByText(`Help version ${HELP_VERSION}`)).toBeVisible();
    expect(screen.getByText(COMMIT)).toBeVisible();
    expect(screen.getByRole("link", { name: "Print the whole manual" })).toHaveAttribute(
      "href",
      "/help/print",
    );
    expect(screen.getByRole("link", { name: "What changed" })).toHaveAttribute(
      "href",
      "/help/what-changed",
    );
    for (const section of HELP_SECTIONS)
      expect(screen.getByRole("link", { name: section.title })).toBeVisible();
  });

  it("says plainly when this server reports no release", () => {
    render(<HelpLanding moved={false} servingCommit={null} />);
    expect(screen.getAllByText(/not reported by this server/).length).toBeGreaterThan(0);
  });
});

describe("S242 BEH-S242-2: table of contents", () => {
  const lease = HELP_SECTIONS.find((section) => section.id === "lease-renewals")!;
  const firstGuide = guidesInSection("lease-renewals")[0];

  function renderToc(
    currentGroup = lease.id,
    currentHref = helpGuideHref(lease.id, firstGuide.id),
  ) {
    return render(
      <HelpTableOfContents
        currentGroup={currentGroup}
        currentHref={currentHref}
        groups={helpTocGroups()}
        leading={HELP_TOC_LEADING}
        trailing={HELP_TOC_TRAILING}
      />,
    );
  }

  it("lists Start here, every area in order, Reference, Glossary and What changed", () => {
    renderToc();
    const nav = screen.getByRole("navigation", { name: "Help contents" });
    const order = [
      "Start here",
      ...HELP_SECTIONS.map((section) => section.title),
      "Reference",
      "Glossary",
      "What changed",
    ];
    const text = nav.textContent ?? "";
    let at = -1;
    for (const title of order) {
      const next = text.indexOf(title, at + 1);
      expect(next, title).toBeGreaterThan(at);
      at = next;
    }
  });

  it("opens the section holding the current page on arrival and marks the page", () => {
    renderToc();
    expect(screen.getByRole("button", { name: lease.title })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Admin" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("link", { name: firstGuide.title })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("toggles a section by pointer and by keyboard and announces the change", async () => {
    const user = userEvent.setup();
    renderToc();
    const admin = screen.getByRole("button", { name: "Admin" });
    await user.click(admin);
    expect(admin).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Admin expanded")).toBeInTheDocument();
    admin.focus();
    await user.keyboard("{Enter}");
    expect(admin).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Admin collapsed")).toBeInTheDocument();
    await user.keyboard(" ");
    expect(admin).toHaveAttribute("aria-expanded", "true");
    expect(
      JSON.parse(window.sessionStorage.getItem("pmi-help-toc-open") ?? "[]"),
    ).toContain("admin");
  });

  it("offers one Help contents disclosure for narrow screens, styled above the content", async () => {
    const user = userEvent.setup();
    const { container } = renderToc();
    const toggle = screen.getByRole("button", { name: "Help contents" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector(".help-toc")).toHaveAttribute(
      "data-narrow-open",
      "true",
    );
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const narrow = css.slice(css.indexOf("@media (max-width: 900px) {\n  .help-layout"));
    expect(narrow).toMatch(/\.help-layout \{\s+display: block;/);
    expect(narrow).toMatch(
      /\.help-toc\[data-narrow-open="false"\] \.help-toc-panel \{\s+display: none;/,
    );
  });
});

describe("S242 BEH-S242-3: deep links", () => {
  const guide = HELP_GUIDES[0];

  it("every step renders at its stable anchor and a known hash is not reported as moved", () => {
    window.location.hash = `#${guide.steps[1].id}`;
    const { container } = render(<HelpGuidePage guide={guide} servingCommit={COMMIT} />);
    for (const step of guide.steps)
      expect(container.querySelector(`li#${CSS.escape(step.id)}`)).not.toBeNull();
    expect(screen.queryByText(/This guide moved/)).toBeNull();
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(/\.help-step:target \{/);
  });

  it("an unknown step id shows the visible moved line instead of a blank page", () => {
    window.location.hash = "#no-such-step";
    render(<HelpGuidePage guide={guide} servingCommit={COMMIT} />);
    expect(screen.getByRole("status")).toHaveTextContent("This guide moved");
    expect(screen.getByRole("heading", { level: 1, name: guide.title })).toBeVisible();
  });

  it("an unknown guide lands on its section page with the moved line", () => {
    render(<HelpSectionPage moved section={HELP_SECTIONS[1]} />);
    expect(screen.getByRole("status")).toHaveTextContent("This guide moved");
    for (const entry of guidesInSection(HELP_SECTIONS[1].id))
      expect(screen.getByRole("link", { name: entry.title })).toBeVisible();
  });

  it("the guide route redirects an unknown guide to its section with the moved line", () => {
    const route = readFileSync(
      join(process.cwd(), "app/help/[section]/[guide]/page.tsx"),
      "utf8",
    );
    expect(route).toMatch(/redirect\(`\$\{helpSectionHref\(section\.id\)\}\?moved=1`\)/);
  });
});

describe("S242 BEH-S242-4 / AC-S242-6: print", () => {
  it("each guide header and print footer carry the help version, title and page number", () => {
    const guide = HELP_GUIDES[0];
    const { container } = render(<HelpGuidePage guide={guide} servingCommit={COMMIT} />);
    const header = container.querySelector(".help-guide-header")!;
    expect(header.textContent).toContain(`Help ${HELP_VERSION}`);
    expect(header.textContent).toContain("Last updated");
    expect(header.textContent).toContain(COMMIT.slice(0, 12));
    const style = container.querySelector("style")!.textContent!;
    expect(style).toContain(
      `PMI KC staff help ${HELP_VERSION} · ${guide.title.replace(/["\\]/g, "")}`,
    );
    expect(style).toContain('"Page " counter(page)');
    // The footer is drawn in the page margin; without a declared margin a print can omit it.
    expect(style).toMatch(/@page \{ margin: \d+mm \d+mm \d+mm;/);
    expect(screen.getByRole("button", { name: "Print this guide" })).toBeVisible();
  });

  it("the print stylesheet removes shell, sidebar and controls and keeps steps whole", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const print = css.slice(css.lastIndexOf("@media print {"));
    expect(print).toMatch(
      /\.help-toc,\s+\.help-print-hide,\s+\.help-page-actions,\s+\.help-moved \{\s+display: none !important;/,
    );
    expect(print).toMatch(/\.help-step \{[^}]*break-inside: avoid;/);
    expect(print).toMatch(/max-width: 100% !important;\s+height: auto !important;/);
    expect(css).toMatch(
      /\.topbar,\s+\.appearance,\s+\.notification-menu,\s+\.report-issue-trigger \{\s+display: none !important;/,
    );
  });

  it("the whole manual renders every guide, reference and the glossary in contents order", () => {
    const { container } = render(<HelpWholeManual servingCommit={COMMIT} />);
    const titles = [...container.querySelectorAll(".help-guide h2")].map(
      (node) => node.textContent,
    );
    const expected = HELP_SECTIONS.flatMap((section) =>
      guidesInSection(section.id).map((guide) => guide.title),
    );
    expect(titles).toEqual(expected);
    expect(container.querySelectorAll(".help-screen").length).toBeGreaterThan(10);
    expect(
      within(container as HTMLElement).getByRole("heading", { name: "Glossary" }),
    ).toBeVisible();
    expect(container.querySelector("style")!.textContent).toContain(
      `PMI KC staff help ${HELP_VERSION}`,
    );
    expect(container.querySelector("nav")).toBeNull();
  });
});

describe("S242 sidebar session state", () => {
  it("restores sections opened earlier in this browser session", async () => {
    window.sessionStorage.setItem("pmi-help-toc-open", JSON.stringify(["search"]));
    await act(async () => {
      render(
        <HelpTableOfContents
          currentHref="/help"
          groups={helpTocGroups()}
          leading={HELP_TOC_LEADING}
          trailing={HELP_TOC_TRAILING}
        />,
      );
    });
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});
