// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OperatingSheetPanel } from "@/components/lease-renewal/OperatingSheetPanel";
import type { OperatingSheetRowAssociation } from "@/lib/lease-renewal/sheet-writeback/row-association";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const WORKSPACE_CONTEXT = "workspace-context-".padEnd(48, "x");

function renderPanel(association: OperatingSheetRowAssociation) {
  return render(
    <OperatingSheetPanel
      association={association}
      initialProposal={null}
      role="Editor"
      workspaceContext={WORKSPACE_CONTEXT}
    />,
  );
}

// BEH-S116-2: an existing row is recognized, ambiguous identity is explained without an append
// offer, and confirmed absence retains the existing safe append path.
describe("S116 operating Sheet panel association states", () => {
  afterEach(() => cleanup());

  it("offers the field-update form only for an exact row", () => {
    renderPanel({ kind: "exact_link", rowNumber: 12 });
    expect(screen.getByText("Correct an operating Sheet field")).toBeInTheDocument();
    expect(screen.queryByText("Add Sheet row")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("offers the append form only after a confirmed absence", () => {
    renderPanel({ kind: "absent_confirmed" });
    expect(screen.getByText("Add Sheet row")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Prepare exact missing-row append" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["multiple_rows", /more than one sheet row links to this lease/i],
    ["conflicting_identity", /name different leases or properties/i],
    ["unit_link_only", /links to this lease's unit rather than the lease/i],
    ["plausible_unlinked_row", /carries this tenant's name but no rentvine lease link/i],
    ["metadata_incomplete", /did not include the row notes and links/i],
  ] as const)(
    "explains an ambiguous %s association and offers no append or update",
    (reason, copy) => {
      renderPanel({ kind: "ambiguous", reason, rowNumbers: [4, 9] });
      const status = screen.getByRole("status");
      expect(status).toHaveTextContent(copy);
      expect(screen.queryByText("Add Sheet row")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Correct an operating Sheet field"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Prepare exact missing-row append" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Preview Sheet field update" }),
      ).not.toBeInTheDocument();
      // The correction happens in the Sheet through its existing owner-controlled path; the app
      // never fabricates an association and never adds a second row.
      expect(status).toHaveTextContent(/in the sheet/i);
    },
  );

  it("names the physical rows an operator should look at for a row-level ambiguity", () => {
    renderPanel({ kind: "ambiguous", reason: "multiple_rows", rowNumbers: [4, 9] });
    expect(screen.getByRole("status")).toHaveTextContent(/rows 4 and 9/i);
  });
});
