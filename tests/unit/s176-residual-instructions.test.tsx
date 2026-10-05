// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  renderWorkspace,
  settle,
  stubRenewalRoutes,
} from "@/tests/helpers/focus-workspace";
import { manualFixture } from "@/tests/helpers/renewal-action-fixtures";

// S176 (R-S176-1) and S87 (R-S87-2): the default Full view and lease information carry no
// instructional, label-repeating or internal sentences. The text that protects a decision stays:
// current state, source and evidence meaning, exact consequences and recovery.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Sentences that told staff how to use a control, repeated its label, or described internals. */
const REMOVED = [
  "Unit rent (RentVine):",
  "Each amount keeps its own meaning",
  "Edit the working current rent above",
  "This review is for the current verified tenancy",
  "Choose again to correct it",
  "Record completion whenever the renewal work is complete",
  "Record completion when the renewal work is complete",
  "edit it or run a lookup",
  "edit it if your review differs",
  "Comparison work is not required for unrelated actions",
  "Opens RentCast's own report for this address",
  "not a copy of this result",
  "not relabeled RentVine facts",
  "Provider order shown",
  "Worth a look before the owner conversation",
  "For a manually copied email",
  "Attach any analysis file yourself",
  "Unrelated renewal work continues as usual",
  "Review and complete form fields in Dotloop; a person sends",
  "exact action gates before preparing creation",
  "Keep typing to continue it",
  "One-time fees, deposit or ledger changes",
] as const;

function flat(value: string | null | undefined): string {
  return (value ?? "").replace(/&apos;|’/g, "'").replace(/\s+/g, " ");
}

function sources(directory: string): Array<{ file: string; text: string }> {
  return readdirSync(join(process.cwd(), directory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => ({
      file: `${directory}/${entry.name}`,
      // JSX wraps a sentence across lines; compare it as it renders.
      text: flat(readFileSync(join(process.cwd(), directory, entry.name), "utf8")),
    }));
}

describe("S176 the renewal workspace keeps no residual instructions", () => {
  it("the rendered Full view and lease information show none of them, and keep the protected text", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T17:00:00.000Z"));
    const manual = manualFixture();
    const routes = stubRenewalRoutes(manual);
    const view = await renderWorkspace({ manual });
    fireEvent.click(screen.getByRole("button", { name: "Full view" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Lease information" }));
    await settle();

    const shown = flat(document.body.textContent);
    expect(REMOVED.filter((sentence) => shown.includes(sentence))).toEqual([]);
    // A link that opens another tab says so in its description, never in a sentence beside it.
    expect(shown).not.toMatch(/Opens this lease.{0,60} in a new tab\./);

    // Protected: evidence meaning, the limit of the RentVine actions (once), and who sends.
    expect(shown).toContain("Provider evidence is shown separately");
    expect(shown.split("are outside these RentVine actions").length - 1).toBe(1);
    expect(view.container).toBeTruthy();
    expect(routes.calls.filter((call) => call.method !== "GET")).toHaveLength(0);
  }, 30_000);

  it("no renewal component or wording module still carries a removed sentence", () => {
    const owners = [
      ...sources("components/lease-renewal"),
      ...sources("lib/lease-renewal"),
      ...sources("lib/lease-documents"),
    ];
    const found = owners.flatMap((owner) =>
      REMOVED.filter((sentence) => owner.text.includes(sentence)).map(
        (sentence) => `${owner.file}: ${sentence}`,
      ),
    );
    expect(found).toEqual([]);
  });

  it("a source link names its destination once and carries the new-tab description on the link", () => {
    const read = (file: string) =>
      readFileSync(join(process.cwd(), "components/lease-renewal", file), "utf8");
    for (const [file, links] of [
      ["RenewalLeaseInformation.tsx", 2],
      ["OperatingSheetLookup.tsx", 1],
      ["RenewalWorkspace.tsx", 2],
    ] as const) {
      const source = read(file);
      expect(source, file).not.toMatch(
        /<span className="muted">\{[\w.?]*(?:rentvine|sheetDestination)\.label\}<\/span>/,
      );
      expect(
        source.match(/title=\{[\w.?]*(?:rentvine|sheetDestination)\.label\}/g) ?? [],
        file,
      ).toHaveLength(links);
    }
  });

  it("the shortened lines keep their state, safety and recovery meaning", () => {
    const read = (file: string) => flat(readFileSync(join(process.cwd(), file), "utf8"));
    const rent = read("components/lease-renewal/RentAndCharges.tsx");
    expect(rent).toContain(
      "One-time fees, deposits, ledger history, party changes and insurance enrollment are outside these RentVine actions",
    );
    expect(rent).toContain("RentVine lease record");
    expect(rent).toContain(
      "Today's billing and the Sheet current rent stay unchanged until the confirmed RentVine change takes effect.",
    );
    const market = read("components/lease-renewal/RenewalProgressControls.tsx");
    expect(market).toContain('starting_rule: "Starting value from current rent."');
    expect(market).toContain('provider: "Filled from the RentCast result."');
    expect(market).toContain(
      "The comparison-based owner message needs a sourced low and high and actual reviewed comps or a reviewed attachment; the starting range alone does not satisfy that.",
    );
    expect(market).toContain("Reference only. Does not set the rent.");
    expect(read("lib/lease-renewal/rentcast-report-links.ts")).toContain(
      "RentCast's own report can differ from the saved lookup, its radius setting and market reports need a RentCast Pro plan, and opening it makes no lookup from this app.",
    );
    expect(read("lib/lease-renewal/under-market.ts")).toContain(
      "Internal note; this stays out of client drafts.",
    );
    const message = read("components/lease-renewal/RenewalMessagePreparation.tsx");
    expect(message).toContain("Edits save in the app. A person sends from Gmail.");
    // AC-S120-5: the response-request hint still names the exact paragraph it replaces.
    expect(message).toContain(
      "Replaces the paragraph after the terms, charges and insurance wording, before the request to complete the renewal information form.",
    );
    expect(message).toContain("Copied text does not include this file.");
    expect(message).toContain("No current receipted screenshot is available.");
    expect(read("components/lease-renewal/RenewalDocumentHandoff.tsx")).toContain(
      "A person sends for signature from Dotloop.",
    );
    expect(read("components/lease-renewal/DotloopPacketLinkPanel.tsx")).toContain(
      "This renewal packet has no receipted Dotloop loop.",
    );
    expect(read("components/lease-renewal/RenewalManualWorkspace.tsx")).toContain(
      "That record is separate from verified completion in RentVine, Gmail or Dotloop.",
    );
    expect(read("components/lease-renewal/RenewalNoticeReview.tsx")).toContain(
      "This review does not start a renewal cycle; a new cycle needs its own review.",
    );
    expect(read("components/lease-renewal/RenewalLeaseInformation.tsx")).toContain(
      "Staff reports. Approvals, source updates, sent messages and signatures require their own evidence.",
    );
    expect(read("lib/lease-renewal/policy-content.ts")).toContain(
      "so applicability cannot be determined for any lease.",
    );
  });
});
