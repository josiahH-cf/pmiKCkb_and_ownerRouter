// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RenewalCorrections } from "@/components/lease-renewal/RenewalCorrections";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import type { RenewalLeaseWorkspace } from "@/lib/lease-renewal/desk-model";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S114: two independent slide-out surfaces over the same lease/process projections, exact
// whole-value and one-audience copy, retained party filters/section targets, and zero effects.

const PARTY_FILTER_KEY = Buffer.alloc(32, 7).toString("base64url");
const ROOT = "sample:lease-318-cedar-7";

function fact(path: string, label: string) {
  return { label, sourceRef: `${ROOT}:${path}` };
}

function workspaceWithParties(): RenewalLeaseWorkspace {
  const base = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
  const tenants = [
    {
      ...fact("tenants[0]", "Maria de la Cruz Ortega"),
      email: fact("tenants[0].email", "maria.ortega@example.test"),
      phone: fact("tenants[0].phone", "(816) 555-0101"),
    },
    {
      ...fact("tenants[1]", "Jordan Lee-Whitfield"),
      email: fact("tenants[1].email", "jordan.lw@example.test"),
    },
    { ...fact("tenants[2]", "Sam Okafor") },
  ];
  const owners = [
    {
      ...fact("owners[0]", "Cedar Holdings LLC"),
      email: fact("owners[0].email", "owner@cedar-holdings.example.test"),
    },
    {
      ...fact("owners[1]", "Priya Natarajan"),
      email: fact("owners[1].email", "priya@example.test"),
    },
  ];
  return {
    ...base,
    summary: {
      ...base.summary,
      identity: { ...base.summary.identity, tenants, owners },
      tenantNameLabels: tenants.map((party) => party.label),
      ownerNameLabels: owners.map((party) => party.label),
    },
  };
}

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.RENEWAL_DESK_PARTY_FILTER_KEY = PARTY_FILTER_KEY;
  writeText = vi.fn(async () => undefined);
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  cleanup();
  delete process.env.RENEWAL_DESK_PARTY_FILTER_KEY;
  vi.restoreAllMocks();
});

function openInformation() {
  fireEvent.click(screen.getByRole("button", { name: "Lease information" }));
  return screen.getByRole("complementary", { name: "Lease information" });
}

describe("S114 independent lease-information and process sidebars", () => {
  it("AC-S114-1: operates two independent panels below the fold without the old inline header", () => {
    render(
      <RenewalWorkspace
        workspace={workspaceWithParties()}
        selectedStepId="document-packet"
      />,
    );
    // The full expanded header is no longer duplicated in the page body.
    expect(screen.queryByText("Owners / clients")).toBeNull();
    const infoToggle = screen.getByRole("button", { name: "Lease information" });
    const guideToggle = screen.getByRole("button", { name: "Process guide" });
    expect(infoToggle).toHaveAttribute("aria-expanded", "false");
    expect(guideToggle).toHaveAttribute("aria-expanded", "false");

    const info = openInformation();
    expect(info).toBeVisible();
    expect(within(info).getByText("Owners / clients")).toBeVisible();
    expect(within(info).getByText("Tenants")).toBeVisible();

    fireEvent.click(guideToggle);
    const guide = screen.getByRole("complementary", { name: "Process guide" });
    expect(guide).toBeVisible();
    // Opening the guide never closes the information panel; each keeps its own state.
    expect(info).toBeVisible();
    expect(infoToggle).toHaveAttribute("aria-expanded", "true");
    expect(guideToggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(within(guide).getByRole("button", { name: "Close process guide" }));
    expect(guide).not.toBeVisible();
    expect(guideToggle).toHaveFocus();
    expect(info).toBeVisible();

    fireEvent.keyDown(info, { key: "Escape" });
    expect(info).not.toBeVisible();
    expect(infoToggle).toHaveFocus();
    // A single switched drawer would fail this: both toggles remain independently available.
    expect(screen.getByRole("button", { name: "Process guide" })).toBeVisible();
  });

  it("AC-S114-2: copies one whole value or every same-audience address and stays selectable when denied", async () => {
    render(<RenewalWorkspace workspace={workspaceWithParties()} />);
    const info = openInformation();

    fireEvent.click(
      within(info).getByRole("button", {
        name: "Copy tenant name: Maria de la Cruz Ortega",
      }),
    );
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith("Maria de la Cruz Ortega"),
    );

    fireEvent.click(within(info).getByRole("button", { name: "Copy all tenant emails" }));
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith(
        "maria.ortega@example.test, jordan.lw@example.test",
      ),
    );
    // The party without an address is named, never silently dropped or invented.
    expect(within(info).getAllByText(/no email on file/i).length).toBeGreaterThan(0);

    fireEvent.click(
      within(info).getByRole("button", { name: "Copy all tenant names and emails" }),
    );
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith(
        [
          "Maria de la Cruz Ortega <maria.ortega@example.test>",
          "Jordan Lee-Whitfield <jordan.lw@example.test>",
          "Sam Okafor (no email on file)",
        ].join("\n"),
      ),
    );

    fireEvent.click(within(info).getByRole("button", { name: "Copy all owner emails" }));
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith(
        "owner@cedar-holdings.example.test, priya@example.test",
      ),
    );
    for (const call of writeText.mock.calls) {
      const text = String(call[0]);
      if (text.includes("cedar-holdings")) expect(text).not.toContain("example.test>");
    }

    writeText.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(
      within(info).getByRole("button", {
        name: "Copy tenant email: maria.ortega@example.test",
      }),
    );
    await within(info).findByText(/Clipboard access was denied/);
    const value = within(info)
      .getAllByText("maria.ortega@example.test")
      .find((element) => element.classList.contains("renewal-copy-value"));
    expect(value).toBeDefined();
    expect(value).toBeVisible();
    // A value is never itself a link: double-clicking selects text without navigating.
    expect(value!.closest("a")).toBeNull();
  });

  it("AC-S114-3: completes owner and tenant click-back filters with opaque tokens and exposes validated destinations", () => {
    render(
      <RenewalWorkspace
        workspace={workspaceWithParties()}
        sheetDestination={{
          kind: "external",
          href: "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz1234/edit#gid=7&range=12%3A12",
          label: "Opens this lease’s matched operating Sheet location in a new tab.",
        }}
      />,
    );
    const info = openInformation();
    const tenantLinks = within(info).getAllByRole("link", {
      name: "Show leases for this tenant",
    });
    const ownerLinks = within(info).getAllByRole("link", {
      name: "Show leases for this owner",
    });
    expect(tenantLinks).toHaveLength(3);
    expect(ownerLinks).toHaveLength(2);
    for (const link of tenantLinks) {
      const href = link.getAttribute("href") ?? "";
      expect(href.startsWith("/lease-renewal/live/desk?")).toBe(true);
      expect(href).toMatch(/tenantKey=p1_[A-Za-z0-9_-]{43}/);
      expect(href).not.toMatch(/ortega|whitfield|okafor/i);
    }
    for (const link of ownerLinks) {
      expect(link.getAttribute("href")).toMatch(/ownerKey=p1_[A-Za-z0-9_-]{43}/);
    }
    // Names are copy targets, not the link; the link is a separate control.
    const name = within(info)
      .getAllByText("Jordan Lee-Whitfield")
      .find((element) => element.classList.contains("renewal-copy-value"));
    expect(name!.closest("a")).toBeNull();

    const sheet = within(info).getByRole("link", { name: "Matched operating Sheet row" });
    expect(sheet).toHaveAttribute(
      "href",
      "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz1234/edit#gid=7&range=12%3A12",
    );
    expect(sheet).toHaveAttribute("target", "_blank");
    // The sample lease has no validated RentVine destination: say so, never fake a link.
    expect(
      within(info).queryByRole("link", { name: "RentVine lease record" }),
    ).toBeNull();
    expect(within(info).getByText(/RentVine lease record/)).toHaveTextContent(
      /not available/i,
    );
  });

  it("AC-S114-3: keeps one five-link section navigation and a nested process guide over the real targets", () => {
    render(
      <RenewalWorkspace
        workspace={workspaceWithParties()}
        selectedStepId="verify-renewal"
      />,
    );
    const navs = screen.getAllByRole("navigation", {
      name: "Renewal dashboard sections",
    });
    expect(navs).toHaveLength(1);
    expect(
      within(navs[0]!)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "#renewal-section-lease-details",
      "#renewal-section-comps",
      "#renewal-section-owner",
      "#renewal-section-tenant",
      "#renewal-section-documents",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Process guide" }));
    const guide = screen.getByRole("complementary", { name: "Process guide" });
    const contents = within(guide).getByRole("navigation", {
      name: "Process guide contents",
    });
    const hrefs = within(contents)
      .getAllByRole("link", { hidden: true })
      .map((link) => link.getAttribute("href"));
    for (const id of ["lease-details", "comps", "owner", "tenant", "documents"]) {
      expect(hrefs).toContain(`#renewal-section-${id}`);
    }
    for (const nested of [
      "#renewal-step-verify-renewal",
      "#renewal-manual-cycle",
      "#renewal-manual-owner_response",
      "#renewal-manual-tenant_response",
      "#renewal-step-document-packet",
      "#renewal-manual-complete",
    ]) {
      expect(hrefs).toContain(nested);
    }
    // Selecting a guide entry navigates to its target and closes the guide.
    fireEvent.click(
      within(contents).getByRole("link", {
        name: "Owner response and exact terms",
        hidden: true,
      }),
    );
    expect(guide).not.toBeVisible();
  });

  it("AC-S114-4: preserves unsaved edits and makes no request when panels open or close", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const workspace = workspaceWithParties();
    render(
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
      />,
    );
    const reason = screen.getByLabelText("Value source / reason");
    fireEvent.change(reason, {
      target: { value: "Unsaved note while checking a contact" },
    });
    const info = openInformation();
    fireEvent.click(screen.getByRole("button", { name: "Process guide" }));
    fireEvent.click(
      within(screen.getByRole("complementary", { name: "Process guide" })).getByRole(
        "button",
        { name: "Close process guide" },
      ),
    );
    fireEvent.click(
      within(info).getByRole("button", { name: "Close lease information" }),
    );
    expect(reason).toHaveValue("Unsaved note while checking a contact");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("AC-S114-4: keeps lease information reachable on an inspection-only lease without a process guide", () => {
    const workspace = { ...workspaceWithParties(), workflowAvailable: false };
    render(<RenewalWorkspace workspace={workspace} />);
    expect(
      screen.queryByRole("navigation", { name: "Renewal dashboard sections" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Process guide" })).toBeNull();
    const info = openInformation();
    expect(within(info).getByText("Tenants")).toBeVisible();
    expect(
      within(info).getAllByRole("link", { name: "Show leases for this tenant" }),
    ).toHaveLength(3);
  });
});

describe("S114 source contract", () => {
  const root = process.cwd();
  const source = (path: string) => readFileSync(join(root, path), "utf8");

  it("moves the expanded header out of the workspace body into the information panel", () => {
    const workspace = source("components/lease-renewal/RenewalWorkspace.tsx");
    expect(workspace).not.toContain("renewal-record-summary");
    expect(workspace).not.toContain("renewal-record-parties");
    const information = source("components/lease-renewal/RenewalLeaseInformation.tsx");
    expect(information).toContain("Owners / clients");
    expect(information).toContain("renewal-workspace-link");
  });

  it("keeps the panels free of persistence, provider, and store imports", () => {
    for (const path of [
      "components/lease-renewal/RenewalWorkspaceSidebars.tsx",
      "components/lease-renewal/RenewalCopyValue.tsx",
      "components/lease-renewal/RenewalLeaseInformation.tsx",
    ]) {
      const text = source(path);
      expect(text, `${path} imports a store module`).not.toMatch(
        /from "@\/lib\/firestore\//,
      );
      expect(text, `${path} imports a provider module`).not.toMatch(
        /from "@\/lib\/integrations\//,
      );
      expect(text, `${path} persists or logs`).not.toMatch(
        /fetch\(|localStorage|sessionStorage|console\.(log|info|debug)/,
      );
    }
  });
});
