// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HelpGuideLink } from "@/components/help/HelpGuideLink";
import { EnvironmentBadge } from "@/components/layout/EnvironmentBadge";
import { RenewalSectionHelp } from "@/components/lease-renewal/RenewalSectionHelp";
import { helpGuideById } from "@/lib/help";
import {
  ABOUT_GUIDE_LINKS,
  HELP_INFOTIP_IDS,
  INFOTIP_GUIDE_LINKS,
  helpGuideLinkHref,
} from "@/lib/help/guide-links";
import { HELP_HUB_ROUTE_PRESENT } from "@/lib/help/links";
import { panelContradictions } from "@/lib/help/consistency";
import { SECTION_HELP, SECTION_HELP_IDS } from "@/lib/lease-renewal/section-help";
import { resetTransientLayersForTests } from "@/lib/ui/transient-layer";

// S244 ARCH-S244-2 / BEH-S244-2 / AC-S244-3 / AC-S244-5 / BEH-S244-3 and ARCH-S244-3 / AC-S244-4.

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  resetTransientLayersForTests();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function targetExists(target: { guide: string; step: string; section: string }) {
  const guide = helpGuideById(target.guide);
  return Boolean(
    guide &&
    guide.section === target.section &&
    guide.steps.some((step) => step.id === target.step),
  );
}

describe("S244 guide link mapping", () => {
  it("ARCH-S244-2: every About id and InfoTip maps to a hub step that exists", () => {
    expect(Object.keys(ABOUT_GUIDE_LINKS).sort()).toEqual([...SECTION_HELP_IDS].sort());
    expect(Object.keys(INFOTIP_GUIDE_LINKS).sort()).toEqual([...HELP_INFOTIP_IDS].sort());
    const missing = [
      ...Object.entries(ABOUT_GUIDE_LINKS),
      ...Object.entries(INFOTIP_GUIDE_LINKS),
    ].filter(([, target]) => !targetExists(target));
    expect(
      missing.map(([id, target]) => `${id} -> ${target.guide}#${target.step}`),
    ).toEqual([]);
  });

  it("the plain-text fallback names each guide by its exact title", () => {
    for (const [id, target] of [
      ...Object.entries(ABOUT_GUIDE_LINKS),
      ...Object.entries(INFOTIP_GUIDE_LINKS),
    ])
      expect(target.title, id).toBe(helpGuideById(target.guide)?.title);
  });

  it("the hub route flag follows the presence of the /help route", () => {
    expect(HELP_HUB_ROUTE_PRESENT).toBe(
      existsSync(join(process.cwd(), "app/help/page.tsx")),
    );
  });
});

describe("S244 BEH-S244-2 / AC-S244-3: every About panel ends with Open the guide", () => {
  it.each(SECTION_HELP_IDS)("About %s links to its guide step", async (id) => {
    const user = userEvent.setup();
    render(<RenewalSectionHelp id={id} />);
    await user.click(
      screen.getByRole("button", { name: `About ${SECTION_HELP[id].label}` }),
    );
    const panel = screen.getByRole("region", { name: `About ${SECTION_HELP[id].label}` });
    const link = screen.getByRole("link", { name: "Open the guide" });
    expect(panel).toContainElement(link);
    expect(link).toHaveAttribute("href", helpGuideLinkHref({ about: id }));
    expect(panel.lastElementChild).toContainElement(link);
  });

  it("without the hub route the guide is named in plain text and no link renders", () => {
    render(<HelpGuideLink hubAvailable={false} id={{ about: "document-handoff" }} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getByText(
        "Open the guide: Prepare documents and hand off to Dotloop, in Help.",
      ),
    ).toBeVisible();
  });

  it("the environment badge InfoTip ends with Open the guide", async () => {
    const user = userEvent.setup();
    render(
      <EnvironmentBadge
        descriptor={
          {
            ok: true,
            descriptor: { environmentKind: "demo", dataContext: "demo" },
          } as never
        }
      />,
    );
    await user.click(screen.getByRole("button", { name: "About Practice environment" }));
    expect(
      screen.getByRole("region", { name: "About Practice environment" }),
    ).toHaveTextContent("Records here are made up. Real client data is not shown.");
    expect(screen.getByRole("link", { name: "Open the guide" })).toHaveAttribute(
      "href",
      helpGuideLinkHref({ infotip: "environment-badge" }),
    );
  });

  it("AC-S244-5 / BEH-S244-3: opening every panel issues no request", async () => {
    const user = userEvent.setup();
    for (const id of SECTION_HELP_IDS) {
      const { unmount } = render(<RenewalSectionHelp id={id} />);
      await user.click(
        screen.getByRole("button", { name: `About ${SECTION_HELP[id].label}` }),
      );
      await user.keyboard("{Escape}");
      unmount();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("S244 ARCH-S244-3 / AC-S244-4: consistency gate", () => {
  it("every About panel agrees with its linked guide step and the guide's limits", () => {
    const problems = SECTION_HELP_IDS.flatMap((id) => {
      const target = ABOUT_GUIDE_LINKS[id];
      const guide = helpGuideById(target.guide)!;
      return panelContradictions(
        { id, saves: SECTION_HELP[id].saves, notDone: SECTION_HELP[id].notDone },
        guide,
        target.step,
      );
    });
    expect(problems).toEqual([]);
  });

  it("injecting 'the app sends the message for you' fails naming the panel and guide step", () => {
    const target = ABOUT_GUIDE_LINKS["message-preparation-owner"];
    const guide = helpGuideById(target.guide)!;
    const problems = panelContradictions(
      {
        id: "message-preparation-owner",
        saves: `${SECTION_HELP["message-preparation-owner"].saves} The app sends the message for you.`,
        notDone: SECTION_HELP["message-preparation-owner"].notDone,
      },
      guide,
      target.step,
    );
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatchObject({
      panel: "message-preparation-owner",
      guide: target.guide,
      step: target.step,
      effect: "send",
    });
  });
});
