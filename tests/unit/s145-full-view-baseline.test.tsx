// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import type { Role } from "@/lib/auth/roles";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import type { RenewalProcessStepId } from "@/lib/lease-renewal/renewal-process";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S145: the same-state Full view baseline, captured from the unchanged dashboard before any Focus
// view code exists. Every later batch 003 change must leave the default Full view identical for
// these fixtures: the same regions, section order, headings, form controls, buttons and links,
// and the same copy in every section. Only an element marked data-renewal-view-switch (the
// additive lease-level view switch) is outside the comparison.
//
// Record the baseline once from unchanged code with UPDATE_S145_BASELINE=1; never update it to
// make a later change pass.
// S152 program re-baseline (f2a50650, fe91d82a, 0f02e013): the owner-confirmed program changed
// the Full view itself (Focus opens by default and Full view is reached through the switch, a
// compact identity line with the tenants, "Suggested next", autosaved staff records and working
// terms). The fixture was re-recorded once on those authorized rules and again pins the Full view
// against accidental drift; a later authorized Full view change needs one more deliberate record.

// Batch 005 deliberately changes Full presentation. Keep the prior fixture immutable and check
// its capabilities separately; the current presentation has its own recorded fixture.
const PRIOR_PATH = join(__dirname, "..", "fixtures", "s145-full-view-baseline.json");
const BASELINE_PATH = join(
  __dirname,
  "..",
  "fixtures",
  "s181-full-view-presentation.json",
);
// S66 (intake 051, AC-S66-6): the three further reference families each gain a resource
// location link. S34 (intake 053, AC-S34-5): the document handoff gains the existing-loop review
// input. Nothing from the prior Full view is removed.
const AUTHORIZED_ADDITIONS: Record<
  "regions" | "sectionIds" | "controls" | "links",
  string[]
> = {
  regions: [],
  sectionIds: [],
  controls: ["input::Existing Dotloop loop number or address"],
  links: [
    "Manage location -> /connections#renewal-resource-entry-kcrar_additional_disclosures",
    "Manage location -> /connections#renewal-resource-entry-brokerage_disclosure",
    "Manage location -> /connections#renewal-resource-entry-insurance_program_addendum",
  ],
};
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const PINNED_NOW = new Date("2026-09-30T17:00:00.000Z");

interface BaselineCase {
  readonly name: string;
  readonly leaseId: string;
  readonly role: Role;
  readonly selectedStepId?: RenewalProcessStepId;
  readonly manual: boolean;
}

const CASES: readonly BaselineCase[] = [
  {
    name: "editor-owner-step-manual",
    leaseId: "lease-318-cedar-7",
    role: "Editor",
    selectedStepId: "owner-decision",
    manual: true,
  },
  {
    name: "admin-default-manual",
    leaseId: "lease-318-cedar-7",
    role: "Admin",
    manual: true,
  },
  {
    name: "approver-default-manual",
    leaseId: "lease-318-cedar-7",
    role: "Approver",
    manual: true,
  },
  {
    name: "editor-default-no-cycle",
    leaseId: "lease-318-cedar-7",
    role: "Editor",
    manual: false,
  },
  {
    name: "editor-maple-manual",
    leaseId: "lease-4821-maple-4",
    role: "Editor",
    manual: true,
  },
  {
    name: "editor-walnut-manual",
    leaseId: "lease-1207-walnut-2",
    role: "Editor",
    manual: true,
  },
];

function preparation(channel: "owner" | "tenant") {
  const inputs = emptyMessagePreparationInputs();
  return {
    senderEmail: "fixture-staff@pmikcmetro.com",
    cycleId: CYCLE_ID,
    saved: null,
    inputs,
    facts: {
      channel,
      names: [channel === "owner" ? "Fixture Owner" : "Fixture Tenant"],
      address: "318 Cedar Street, Unit 7",
      currentBaseRent: null,
      leaseEndDate: "2026-12-31",
      ownerTerms: null,
      range: null,
      suggestedRent: null,
      comps: [],
      trend: null,
      sparseCompsQualification: null,
      charges: inputs.charges,
      insuranceTransition: null,
      leaseOrigin: null,
      otherChargesComparison: null,
      informationForm: null,
      insuranceFlyer: null,
      rbpFlyer: null,
      signature: null,
      attachments: [],
    },
    sourceFingerprint: "a".repeat(64),
    needsReview: true,
    signatureMatchesActor: false,
    publication: { status: "unpublished", reason: "Exact publication pending." },
    notices: [],
    draftAttempt: null,
    previousDraftAttempts: [],
  };
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const target = String(url);
      if (target.includes("/api/lease-renewal/message-preparation"))
        return Response.json(
          preparation(target.includes("channel=owner") ? "owner" : "tenant"),
        );
      if (target.includes("/api/lease-renewal/workspace"))
        return Response.json({ observations: [] });
      if (target.includes("/api/lease-renewal/document-handoff"))
        return Response.json({
          snapshot: null,
          blockers: [],
          readiness: { state: "connected" },
          catalogVersion: "fixture",
          attempts: [],
        });
      return Response.json({});
    }),
  );
}

function text(node: Element | null | undefined): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function outsideSwitch(element: Element): boolean {
  return !element.closest("[data-renewal-view-switch]");
}

function labelOf(element: Element): string {
  const aria = element.getAttribute("aria-label");
  if (aria) return aria.trim();
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy)
    return labelledBy
      .split(/\s+/)
      .map((id) => text(document.getElementById(id)))
      .join(" ")
      .trim();
  const labels = (element as HTMLInputElement).labels;
  if (labels && labels.length > 0) return text(labels[0]);
  return "";
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

/** Structure and copy of the rendered Full view, excluding only the additive view switch. */
function fullViewSignature(container: HTMLElement) {
  const all = <T extends Element>(selector: string) =>
    [...container.querySelectorAll<T>(selector)].filter(outsideSwitch);
  return {
    regions: all("section[aria-label], [role='region'][aria-label]").map(
      (element) => element.getAttribute("aria-label") ?? "",
    ),
    sectionIds: all("[id^='renewal-section-']").map((element) => element.id),
    headings: all("h1, h2, h3, h4").map(
      (element) => `${element.tagName.toLowerCase()}:${text(element)}`,
    ),
    controls: all("input, select, textarea").map(
      (element) =>
        `${element.tagName.toLowerCase()}:${element.getAttribute("type") ?? ""}:${labelOf(element)}`,
    ),
    buttons: all("button").map((element) => labelOf(element) || text(element)),
    links: all("a[href]").map(
      (element) =>
        `${labelOf(element) || text(element)} -> ${element.getAttribute("href")}`,
    ),
    // Copy per top-level dashboard section, fingerprinted to keep the baseline compact.
    copy: all("[id^='renewal-section-']").map(
      (element) => `${element.id}:${fingerprint(text(element))}`,
    ),
  };
}

async function renderCase(testCase: BaselineCase) {
  const workspace = getRenewalLeaseWorkspace(testCase.leaseId)!;
  expect(workspace).not.toBeNull();
  const view = render(
    <RenewalWorkspace
      workspace={workspace}
      role={testCase.role}
      {...(testCase.selectedStepId ? { selectedStepId: testCase.selectedStepId } : {})}
      {...(testCase.manual
        ? {
            manualState: emptyRenewalWorkspace(workspace.summary.id, CYCLE_ID, {
              kind: "lease_end",
              dateIso: "2026-12-31",
              source: "RentVine lease end",
            }),
          }
        : {})}
    />,
  );
  if (testCase.manual) {
    // S152: the consolidated lease opens in Focus view; the Full view is the view under test.
    fireEvent.click(screen.getByRole("button", { name: "Full view" }));
    await waitFor(() => {
      expect(document.getElementById("renewal-card-message-owner")).not.toBeNull();
      expect(document.getElementById("renewal-card-message-tenant")).not.toBeNull();
    });
  }
  // Let every mount-time read settle before reading the DOM.
  for (let index = 0; index < 5; index += 1)
    await new Promise((resolve) => setTimeout(resolve, 0));
  return fullViewSignature(view.container);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("S145 Full view baseline", () => {
  it("renders the same Full view structure and copy as the recorded pre-Focus baseline", async () => {
    const signatures: Record<string, ReturnType<typeof fullViewSignature>> = {};
    for (const testCase of CASES) {
      signatures[testCase.name] = await renderCase(testCase);
      cleanup();
    }
    if (process.env.RECORD_BATCH005_PRESENTATION === "1") {
      writeFileSync(BASELINE_PATH, `${JSON.stringify(signatures, null, 2)}\n`);
    }
    expect(existsSync(BASELINE_PATH)).toBe(true);
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
    expect(signatures).toEqual(baseline);
    const prior = JSON.parse(readFileSync(PRIOR_PATH, "utf8")) as typeof signatures;
    for (const [name, signature] of Object.entries(signatures)) {
      // Reordering and shortening prose cannot remove an input, source link or task section.
      // Exact additions are named here, never inferred; a case shows those its view mounts.
      for (const field of ["regions", "sectionIds", "controls", "links"] as const) {
        const added = AUTHORIZED_ADDITIONS[field].filter((entry) =>
          signature[field].includes(entry),
        );
        expect([...signature[field]].sort(), `${name}: preserved ${field}`).toEqual(
          [...prior[name][field], ...added].sort(),
        );
      }
      expect(signature.buttons).toEqual(expect.arrayContaining(prior[name].buttons));
    }
  }, 120_000);
});
