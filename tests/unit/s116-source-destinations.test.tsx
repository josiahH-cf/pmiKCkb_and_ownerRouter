// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { buildRentvineRecordDestination } from "@/lib/lease-renewal/desk-destinations";
import type { RenewalLeaseWorkspace } from "@/lib/lease-renewal/desk-model";
import {
  projectIndependentRentVineRows,
  projectIndependentSheetLinks,
} from "@/lib/production-assurance/renewal-source-projection";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

const HOST = "pmikcmetro.rentvine.com";
const RECORD = "https://pmikcmetro.rentvine.com/leases/4821";

function workspaceWithRentVineCandidate(
  sourceDestinations?: RenewalLeaseWorkspace["summary"]["sourceDestinations"],
): RenewalLeaseWorkspace {
  const base = getRenewalLeaseWorkspace("lease-318-cedar-7");
  if (!base) throw new Error("Missing sample workspace.");
  const [first, ...rest] = base.dataCheck;
  if (!first || first.candidates.length === 0)
    throw new Error("Sample data check is empty.");
  const rentvineCandidate = { ...first.candidates[0], sourceSystem: "RentVine" };
  return {
    ...base,
    summary: { ...base.summary, id: "4821", sourceDestinations },
    dataCheck: [
      { ...first, candidates: [rentvineCandidate, ...first.candidates.slice(1)] },
      ...rest,
    ],
  };
}

afterEach(() => cleanup());

// R116.1: an external source badge opens its actual record or says exactly which link is
// unavailable; it never redirects to the same internal page and never guesses parameters.
describe("S116 source destinations (AC-S116-1)", () => {
  it("builds the lease record destination only for the exact tenant host and a positive integer id", () => {
    expect(
      buildRentvineRecordDestination({
        expectedHost: HOST,
        recordId: "4821",
        recordType: "lease",
      })?.href,
    ).toBe(RECORD);
    for (const [expectedHost, recordId] of [
      ["evil.example", "4821"],
      ["pmikcmetro.rentvine.com.evil.example", "4821"],
      [HOST, "0"],
      [HOST, "12a"],
      [HOST, ""],
      [null, "4821"],
    ] as const) {
      expect(
        buildRentvineRecordDestination({ expectedHost, recordId, recordType: "lease" }),
      ).toBeNull();
    }
  });

  it("never turns a RentVine source badge into a same-page self-loop when no link is known", () => {
    render(<RenewalWorkspace workspace={workspaceWithRentVineCandidate(undefined)} />);
    const badges = screen.getAllByLabelText(/RentVine source for/);
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.getAttribute("href") ?? "").not.toMatch(/^#renewal-field/);
      expect(badge.tagName).not.toBe("A");
    }
  });

  it("opens the exact lease record from a RentVine badge when the record destination is known", () => {
    render(
      <RenewalWorkspace
        workspace={workspaceWithRentVineCandidate({
          rentvine: {
            kind: "external",
            href: RECORD,
            label: "Opens this lease in RentVine in a new tab.",
          },
        })}
      />,
    );
    const badges = screen.getAllByLabelText(/RentVine source for/);
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge).toHaveAttribute("href", RECORD);
      expect(badge).toHaveAttribute("target", "_blank");
    }
  });

  it("names the scoped RentVine view as unavailable beside the separately labeled record link", () => {
    render(
      <RenewalWorkspace
        workspace={workspaceWithRentVineCandidate({
          rentvine: {
            kind: "external",
            href: RECORD,
            label: "Opens this lease in RentVine in a new tab.",
          },
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Lease information" }));
    const info = screen.getByRole("complementary", { name: "Lease information" });
    expect(
      within(info).getByRole("link", { name: "RentVine lease record" }),
    ).toHaveAttribute("href", RECORD);
    expect(
      within(info).getByText(/RentVine lease list filtered to this owner or property/),
    ).toHaveTextContent(/unavailable \(no verified RentVine filter destination\)/);
  });

  it("gives the independent reconciliation the same record destination from the export lease id", () => {
    const rows = projectIndependentRentVineRows(
      [{ leaseID: 4821 }],
      new Map(),
      new Map(),
      HOST,
    );
    expect(rows[0].rentvineRecordUrl).toBe(RECORD);
    expect(
      projectIndependentRentVineRows([{ leaseID: 4821 }], new Map(), new Map(), null)[0]
        .rentvineRecordUrl,
    ).toBeNull();
  });

  it("lets the independent Sheet projection join a row whose RentVine link is rich text", () => {
    const evaluated = {
      valueRanges: [
        {
          range: "Lease Renewal",
          values: [
            ["Current Rent", "Lease"],
            ["$1,250", "One"],
          ],
        },
      ],
    };
    // The formula/value layers alone cannot see a rich-text link, so this row is unlinked to them.
    expect(() =>
      projectIndependentSheetLinks(evaluated, evaluated, {}, HOST, undefined),
    ).toThrow(/no exact RentVine lease link/);
    const withRich = projectIndependentSheetLinks(
      evaluated,
      evaluated,
      {},
      HOST,
      undefined,
      {
        "Lease Renewal": [
          [[], []],
          [[], ["https://pmikcmetro.rentvine.com/leases/115"]],
        ],
      },
    );
    expect([...withRich.leaseUrls]).toEqual([
      ["115", "https://pmikcmetro.rentvine.com/leases/115"],
    ]);
  });
});
