// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import type { Role } from "@/lib/auth/roles";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S145 (FV-15, FV-81): the Full view's copy output against the build before any Focus code.
// Every existing copy control (the S114 lease information values and audiences, and each message
// preparation export) is pressed in page order and its exact clipboard output is recorded. The
// fixture was recorded once with UPDATE_S145_COPY_BASELINE=1 from an unchanged checkout of
// b1c6135c (the merge before batch 003), using only modules that existed there. On later code the
// same output must come back byte for byte, before and after a Focus round trip, and the copied
// text must carry no Focus view wording. Sample data only; never update the fixture to pass.
// S162 re-recording (owner-approved program S152-S167): "Copy plain text" now puts the message on
// the clipboard as displayed, with its "Needs Verification" markers, instead of nothing. Only those
// entries changed; the lease-information entries and "Copy subject" are byte-identical.

const FIXTURE_PATH = join(__dirname, "..", "fixtures", "s145-copy-output-baseline.json");
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const PINNED_NOW = new Date("2026-09-30T17:00:00.000Z");

interface CopyCase {
  readonly name: string;
  readonly leaseId: string;
  readonly role: Role;
}

const CASES: readonly CopyCase[] = [
  { name: "editor-cedar", leaseId: "lease-318-cedar-7", role: "Editor" },
  { name: "admin-cedar", leaseId: "lease-318-cedar-7", role: "Admin" },
  { name: "approver-cedar", leaseId: "lease-318-cedar-7", role: "Approver" },
  { name: "editor-maple", leaseId: "lease-4821-maple-4", role: "Editor" },
  { name: "editor-walnut", leaseId: "lease-1207-walnut-2", role: "Editor" },
];

interface CopyEntry {
  readonly control: string;
  readonly output: readonly string[];
}

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

async function settle(rounds = 5) {
  for (let index = 0; index < rounds; index += 1)
    await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderCase(testCase: CopyCase) {
  const workspace = getRenewalLeaseWorkspace(testCase.leaseId)!;
  expect(workspace).not.toBeNull();
  render(
    <RenewalWorkspace
      workspace={workspace}
      role={testCase.role}
      manualState={emptyRenewalWorkspace(workspace.summary.id, CYCLE_ID, {
        kind: "lease_end",
        dateIso: "2026-12-31",
        source: "RentVine lease end",
      })}
    />,
  );
  // S152 (f2a50650): the lease opens in Focus view, which hides the Full view regions in place
  // (no accessible names), so the message cards are awaited by id and Full view is chosen.
  await waitFor(() => {
    expect(document.getElementById("renewal-card-message-owner")).not.toBeNull();
    expect(document.getElementById("renewal-card-message-tenant")).not.toBeNull();
  });
  await userEvent.setup().click(screen.getByRole("button", { name: "Full view" }));
  await within(screen.getByRole("region", { name: "Owner approval" })).findByRole(
    "region",
    { name: "Owner message preparation" },
  );
  await within(
    screen.getByRole("region", { name: "Tenant offer and response" }),
  ).findByRole("region", { name: "Tenant message preparation" });
  await settle();
}

function accessibleName(button: HTMLElement): string {
  return (button.getAttribute("aria-label") ?? button.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

const COPY_CONTROL = /^Copy\b/;

/** Press every existing copy control in page order and record exactly what reached the clipboard. */
async function captureCopies(user: UserEvent): Promise<CopyEntry[]> {
  const output: string[] = [];
  const clipboard = navigator.clipboard;
  const writeText = vi
    .spyOn(clipboard, "writeText")
    .mockImplementation(async (value: string) => {
      output.push(`text/plain:${value}`);
    });
  const write = vi
    .spyOn(clipboard, "write")
    .mockImplementation(async (items: ClipboardItems) => {
      for (const item of items)
        for (const type of [...item.types].sort())
          output.push(`${type}:${await (await item.getType(type)).text()}`);
    });
  const entries: CopyEntry[] = [];
  const press = async (scope: string) => {
    const controls = screen
      .getAllByRole("button")
      .filter((button) => COPY_CONTROL.test(accessibleName(button)));
    for (const control of controls) {
      const before = output.length;
      await user.click(control);
      await settle(2);
      entries.push({
        control: `${scope}:${accessibleName(control).replace(/^Copied\b/, "Copy")}`,
        output: output.slice(before),
      });
    }
  };
  try {
    // The S114 copy controls live in the lease information panel; the message exports in the page.
    await press("page");
    const information = screen.getByRole("button", { name: "Lease information" });
    await user.click(information);
    await settle();
    const panel = screen.getByRole("complementary", { name: "Lease information" });
    const before = entries.length;
    for (const control of within(panel)
      .getAllByRole("button")
      .filter((button) => COPY_CONTROL.test(accessibleName(button)))) {
      const start = output.length;
      await user.click(control);
      await settle(2);
      entries.push({
        control: `lease-information:${accessibleName(control).replace(/^Copied\b/, "Copy")}`,
        output: output.slice(start),
      });
    }
    expect(entries.length).toBeGreaterThan(before);
    await user.click(information);
    await settle();
  } finally {
    writeText.mockRestore();
    write.mockRestore();
  }
  return entries;
}

// S197 adds three primary identity copy controls. Original controls keep every recorded byte.
function priorControls(entries: CopyEntry[]) {
  return entries.filter(
    (entry) => !/^page:Copy (?:address|tenant name|lease ID): /.test(entry.control),
  );
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

describe("S145 Full view copy output", () => {
  it("records the copy output of every existing copy control", async () => {
    const recorded: Record<string, CopyEntry[]> = {};
    for (const testCase of CASES) {
      await renderCase(testCase);
      recorded[testCase.name] = await captureCopies(userEvent.setup());
      cleanup();
    }
    if (process.env.UPDATE_S145_COPY_BASELINE === "1")
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(recorded, null, 2)}\n`);
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    const baseline = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
    expect(
      Object.fromEntries(
        Object.entries(recorded).map(([key, entries]) => [key, priorControls(entries)]),
      ),
    ).toEqual(baseline);
    for (const testCase of CASES) {
      const added = recorded[testCase.name].filter(
        (entry) => !priorControls([entry]).length,
      );
      expect(added).toHaveLength(3);
      expect(
        added.find((entry) => entry.control.startsWith("page:Copy lease ID: "))?.output,
      ).toEqual([`text/plain:${testCase.leaseId}`]);
    }
    // Lease values and at least one message export reached the clipboard for every case.
    for (const entries of Object.values(recorded)) {
      expect(
        entries.some((entry) => entry.control.startsWith("lease-information:")),
      ).toBe(true);
      expect(entries.filter((entry) => entry.output.length > 0).length).toBeGreaterThan(
        3,
      );
    }
  }, 180_000);

  it("copies the same output after a Focus round trip, with no Focus wording", async () => {
    const baseline = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Record<
      string,
      CopyEntry[]
    >;
    for (const testCase of CASES) {
      await renderCase(testCase);
      const user = userEvent.setup();
      // Full view -> Focus view -> Full view, then every copy control again.
      await user.click(screen.getByRole("button", { name: "Focus view" }));
      expect(screen.getByRole("region", { name: "Focus view" })).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Full view" }));
      await settle();
      const after = await captureCopies(user);
      expect(priorControls(after), testCase.name).toEqual(baseline[testCase.name]);
      const copied = after.flatMap((entry) => entry.output).join("\n");
      expect(copied, testCase.name).not.toMatch(
        /Focus view|Full view|\bFocus\b|Ready for you|Starts after|Other ready tasks|All renewal work|Done when|\btasks?\b/i,
      );
      cleanup();
    }
  }, 180_000);
});
