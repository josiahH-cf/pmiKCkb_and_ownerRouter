// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LeaseTermReviewControl } from "@/components/lease-renewal/LeaseTermReviewControl";
import { OperatingSheetPanel } from "@/components/lease-renewal/OperatingSheetPanel";
import { focusRenewalDashboardControl } from "@/components/lease-renewal/RenewalDashboardNavigation";
import { RenewalCorrections } from "@/components/lease-renewal/RenewalCorrections";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { DRAFT_BANNER } from "@/lib/constants";
import { RENEWAL_DASHBOARD_SECTIONS } from "@/lib/lease-renewal/dashboard-sections";
import { SECTION_HELP, SECTION_HELP_IDS } from "@/lib/lease-renewal/section-help";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import { resetTransientLayersForTests } from "@/lib/ui/transient-layer";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S115: plain-language section help. Every section and card heading carries an `About` control
// that opens accessible help over the real owning operation; the old inline prose is gone; blockers,
// paused states, unsent banners and required cues stay visible; opening help has zero effects.

const ROOT = join(process.cwd());
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function renderWorkspace(
  overrides: Partial<Parameters<typeof RenewalWorkspace>[0]> = {},
) {
  const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
  return render(
    <RenewalWorkspace
      workspace={workspace}
      selectedStepId="verify-renewal"
      correctionPanel={
        <RenewalCorrections
          leaseId={workspace.summary.id}
          role="Admin"
          dataCheck={workspace.dataCheck}
          sheetValues={null}
          workspaceContext={null}
          inventory={null}
          sheetPreviewHash={null}
          rentvinePreviewHash={null}
          reviewHref={null}
        />
      }
      operatingSheetPanel={
        <OperatingSheetPanel
          hasSheetRow
          initialProposal={null}
          role="Editor"
          workspaceContext="ctx"
        />
      }
      termReviewPanel={
        <LeaseTermReviewControl
          canEdit
          leaseId={workspace.summary.id}
          term={workspace.summary.leaseTerm}
          recordedTerm={null}
        />
      }
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  resetTransientLayersForTests();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("S115 plain-language section help", () => {
  it("AC-S115-1: every section heading has an About control that opens on focus, closes on Escape with focus returned, and reopens on click", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    for (const section of RENEWAL_DASHBOARD_SECTIONS) {
      const region = screen.getByRole("region", { name: section.label });
      expect(
        within(region).getByRole("button", { name: `About ${section.label}` }),
      ).toBeInTheDocument();
    }
    const trigger = screen.getByRole("button", { name: "About Lease details" });
    act(() => trigger.focus());
    const panel = screen.getByRole("region", { name: "About Lease details" });
    expect(panel).toHaveTextContent("Step 1");
    expect(panel).toHaveTextContent(/Saves:/);
    expect(panel).toHaveTextContent(/Does not:/);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "About Lease details" })).toBeNull();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(
      screen.getByRole("region", { name: "About Lease details" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Process guide" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("AC-S115-1: a fine-pointer hover opens after 600 ms and a touch pointer never schedules hover", () => {
    vi.useFakeTimers();
    renderWorkspace();
    const trigger = screen.getByRole("button", { name: "About Rent and charges" });
    fireEvent.pointerEnter(trigger, { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.queryByRole("region", { name: "About Rent and charges" })).toBeNull();
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(599));
    expect(screen.queryByRole("region", { name: "About Rent and charges" })).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(
      screen.getByRole("region", { name: "About Rent and charges" }),
    ).toBeInTheDocument();
  });

  it("AC-S115-2: every help entry is complete, plain and never claims a send, source write, approval or signature", () => {
    // Each pattern names a claim the help must never make; the example proves the pattern bites.
    const forbidden: Array<[RegExp, string]> = [
      [
        /\b(app|section|card|help|saving|save|preview|proposal|record(ing)?) (sends|emails|delivers) (the|this|an?|it|a message)\b/i,
        "The app sends the message.",
      ],
      [
        /\b(saving|opening|previewing|a saved [a-z-]+|a proposal|recording|this section) (here )?(updates?|writes?|edits?|changes?) (RentVine|the Sheet)\b/i,
        "Saving here updates RentVine.",
      ],
      [
        /\bapprov(es|ed) the (rent|terms) for\b/i,
        "The app approves the rent for the owner.",
      ],
      [/\bgets? signed (here|in the app)\b/i, "The lease gets signed here."],
      [/—/, "one — two"],
      [/\b[a-z_]+\.[a-z_]+\.[a-z_]+\b/, "google_sheets.renewal_checklist.update"],
      [/source of truth|control plane|PMI handles/i, "the source of truth"],
    ];
    for (const [pattern, example] of forbidden) {
      expect(example).toMatch(pattern);
    }
    for (const id of SECTION_HELP_IDS) {
      const help = SECTION_HELP[id];
      expect(help.label.trim().length, id).toBeGreaterThan(0);
      expect(help.purpose.trim().length, id).toBeGreaterThan(20);
      expect(help.saves.trim().length, id).toBeGreaterThan(10);
      expect(help.notDone.trim().length, id).toBeGreaterThan(10);
      if (help.steps) expect(help.steps.length, id).toBeGreaterThanOrEqual(2);
      const text = [
        help.purpose,
        ...(help.steps ?? []),
        help.saves,
        help.notDone,
        help.next?.label ?? "",
      ].join(" ");
      for (const [pattern] of forbidden) {
        expect(text, `${id}: ${pattern}`).not.toMatch(pattern);
      }
      expect(help.notDone, `${id}: notDone must state a non-effect`).toMatch(
        /\b(not|never|nothing|no)\b/i,
      );
    }
  });

  it("AC-S115-2: the affected work areas each host their own About control", () => {
    // Without staff records the workspace shows the decision, offer and draft cards.
    renderWorkspace();
    for (const label of [
      "Lease term",
      "Rent and charges",
      "Data check",
      "Correct a lease fact",
      "Operating Sheet updates",
      "Owner decision",
      "Tenant offer",
      "Renewal-notice draft",
      "Document preparation",
      "Document packet truth",
      "Completion checks",
    ]) {
      expect(
        screen.getAllByRole("button", { name: `About ${label}` }).length,
        label,
      ).toBeGreaterThan(0);
    }
    cleanup();
    resetTransientLayersForTests();
    // With a confirmed cycle the manual-work cards, response forms and market evidence render.
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    renderWorkspace({
      manualState: emptyRenewalWorkspace(
        workspace.summary.id,
        "b4bc3b81-c402-4f62-a2e2-c605c67867fb",
        { kind: "lease_end", dateIso: "2026-12-31", source: "RentVine lease end" },
      ),
    });
    for (const label of [
      "Recorded renewal work",
      "Work recorded by staff: owner",
      "Work recorded by staff: tenant",
      "Work recorded by staff: documents",
      "Owner message preparation",
      "Tenant message preparation",
      "Document preparation and signature handoff",
      "Owner response and exact terms",
      "Tenant response",
      "Staff completion",
      "Source updates",
      "Market evidence",
    ]) {
      expect(
        screen.getAllByRole("button", { name: `About ${label}` }).length,
        label,
      ).toBeGreaterThan(0);
    }
  });

  it("AC-S115-3: the Start here prose moved into help while blockers, paused copy and the draft banner stay visible", () => {
    renderWorkspace();
    expect(screen.queryByText(/^Start here/)).toBeNull();
    act(() => screen.getByRole("button", { name: "About Lease details" }).focus());
    expect(screen.getByRole("region", { name: "About Lease details" })).toHaveTextContent(
      /Start here/,
    );
    expect(screen.getAllByText(DRAFT_BANNER).length).toBeGreaterThan(0);
    const workspace = read("components/lease-renewal/RenewalWorkspace.tsx");
    for (const kept of [
      "Current blockers",
      "Recording is paused while the lease data is past",
      "Do this next",
      "Needs verification before sending",
      "Data too old to act on",
    ]) {
      expect(workspace).toContain(kept);
    }
    expect(workspace).not.toContain("section.description");
    expect(workspace).not.toContain("to unlock the tenant offer");
    expect(read("lib/lease-renewal/dashboard-sections.ts")).not.toContain("Start here");
    expect(read("components/lease-renewal/OperatingSheetPanel.tsx")).not.toContain(
      "{effect.action_key}",
    );
  });

  it("AC-S115-3: genuinely manual required fields carry the required cue and their exact labels still resolve", () => {
    renderWorkspace();
    const source = screen.getByLabelText("Value source / reason");
    expect(source).toHaveAttribute("aria-required", "true");
    expect(source.closest(".field")?.querySelector(".field-required")?.textContent).toBe(
      "*",
    );
    expect(screen.getByLabelText("Fact to correct")).not.toHaveAttribute("aria-required");
    expect(screen.getByLabelText("Destinations")).toBeVisible();
    expect(read("styles/tokens.css")).toMatch(/\.form-error\s*\{[^}]*border-left/);
  });

  it("AC-S115-4: opening help makes no request, keeps unsaved edits and never shows an action key as instruction", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderWorkspace();
    const source = screen.getByLabelText("Value source / reason");
    fireEvent.change(source, { target: { value: "Owner call 2026-09-16" } });
    for (const label of ["Correct a lease fact", "Lease term", "Data check"]) {
      act(() => screen.getByRole("button", { name: `About ${label}` }).focus());
      fireEvent.keyDown(document, { key: "Escape" });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Value source / reason")).toHaveValue(
      "Owner call 2026-09-16",
    );
    expect(screen.queryByText(/google_sheets\.renewal_checklist/)).toBeNull();
    expect(screen.getByText(/No Sheet update is waiting for review/)).toBeInTheDocument();
  });

  it("AC-S115-4: section navigation focuses a real control instead of a help trigger and closes open help", () => {
    renderWorkspace();
    act(() => screen.getByRole("button", { name: "About Lease details" }).focus());
    expect(
      screen.getByRole("region", { name: "About Lease details" }),
    ).toBeInTheDocument();
    act(() => focusRenewalDashboardControl("renewal-section-lease-details"));
    expect(document.activeElement?.classList.contains("info-tip-trigger")).toBe(false);
    act(() => {
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(screen.queryByRole("region", { name: "About Lease details" })).toBeNull();
  });

  it("AC-S115-4: the operator guide's About rows name controls that render", async () => {
    const { parseGuideSteps } =
      await import("../../scripts/lib/renewal-guide-controls.mjs");
    const steps = parseGuideSteps(
      read("docs/products/renewal-operator-guide.md"),
    ) as Array<{
      control: string;
      role: string;
    }>;
    const aboutRows = steps.filter((step) => step.control.startsWith("About "));
    expect(aboutRows.length).toBeGreaterThanOrEqual(3);
    renderWorkspace();
    for (const row of aboutRows) {
      expect(row.role).toBe("button");
      expect(screen.getAllByRole("button", { name: row.control }).length).toBeGreaterThan(
        0,
      );
    }
  });
});
