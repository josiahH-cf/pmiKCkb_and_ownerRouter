// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { SYNTHETIC_APPROVAL_CHOICES } from "../helpers/owner-approval-form";
import {
  HOUSING_ASSISTANCE_TARGETS,
  HousingAssistanceField,
} from "@/components/lease-renewal/RenewalHousingAssistance";
import {
  RenewalManualProvider,
  RenewalManualSection,
} from "@/components/lease-renewal/RenewalManualWorkspace";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import type {
  HousingAssistanceValue,
  RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";
import { ASSISTED, PROGRAM } from "@/tests/fixtures/s266-program-source";
import {
  renderWorkspace,
  settle,
  stubRenewalRoutes,
} from "@/tests/helpers/focus-workspace";

// S266 R-S266-1 / R-S266-2 on the mounted controls: the assisted outcome leads with the program
// and its saved contact, read-only, in the existing program contact step, with one action that
// reaches the Housing assistance field's own contact input. That field stays the only editor of
// the contact, in Guided view (on Check the numbers) and in Full view (in Lease information). The
// field keeps Not set, No and Yes distinct with nothing preselected, and the source hint stays
// separate from the saved fact. Opening the step or following the action saves nothing.
// Synthetic values only.

const LEASE = "9266";
const CONTACT_LABEL = "Program contact (optional)";
const SAVED_CONTACT = "SYNTHETIC staff contact, 555-0100";
const record = (
  value: HousingAssistanceValue | null,
  leaseId = LEASE,
): RenewalWorkingRecord => ({
  schemaVersion: "renewal-working-record/v1",
  leaseId,
  revision: 1,
  fields:
    value === null
      ? {}
      : {
          housing_assistance: {
            value,
            revision: 1,
            eventId: "00000000-0000-4000-8000-000000000266",
            recordedAt: "2026-11-10T15:00:00.000Z",
            recordedByUid: "synthetic-editor",
            recordedByLabel: "Example Staff",
            origin: "staff_entry",
          },
        },
});

let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  request = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const saved = record(body.value);
    saved.revision = 2;
    saved.fields.housing_assistance!.revision = 2;
    return Response.json({ record: saved });
  });
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function ownerSection(value: HousingAssistanceValue | null, canEdit = true) {
  return render(
    <RenewalWorkingRecordProvider
      canEdit={canEdit}
      initialRecord={record(value)}
      leaseId={LEASE}
    >
      <RenewalManualProvider
        initialState={null}
        leaseId={LEASE}
        ownerApproval={SYNTHETIC_APPROVAL_CHOICES}
      >
        <RenewalManualSection currentRent={1500} section="owner" />
      </RenewalManualProvider>
    </RenewalWorkingRecordProvider>,
  );
}

const leadOf = (root: ParentNode = document) =>
  root.querySelector<HTMLElement>('[data-renewal-housing-placement="program-contact"]')!;

const SOURCE_HINT =
  "RentVine program source: Source pending. No approved RentVine program read is available. Enter the known contact here.";

describe("AC-S266-2: the program contact step leads with the program and its saved contact", () => {
  it("shows the program and the saved contact read-only first, then the owner's answer, then the rent choice", () => {
    ownerSection(ASSISTED);
    const step = document.getElementById("renewal-manual-program_contact")!;
    expect(step).toBeTruthy();
    const lead = leadOf(step);
    expect(lead).toBeTruthy();
    expect(within(lead).getByText(`Program: ${PROGRAM}`)).toBeVisible();
    expect(within(lead).getByText(`Program contact: ${SAVED_CONTACT}`)).toBeVisible();
    // The step shows the contact; it holds no editor of its own.
    expect(within(lead).queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByLabelText(CONTACT_LABEL)).toHaveLength(0);
    const edit = within(lead).getByRole("button", { name: "Edit the program contact" });
    expect(edit).not.toHaveAttribute("data-renewal-next-control");
    // The lead comes before the activity's own outcome, source and comment inputs. With a saved
    // contact, recording the contact outcome stays the step's next control.
    const outcome = within(step).getByLabelText(
      "Housing program contact about the renewal process outcome",
    );
    expect(lead.compareDocumentPosition(outcome)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(step.querySelector("[data-renewal-next-control]")).toBe(outcome);
    // Contact, the owner's answer and the rent choice stay separate and in that order.
    const answer = screen.getByRole("region", {
      name: "Ask the owner whether to renew this tenant",
    });
    const rent = screen.getByRole("region", { name: "Rent for this renewal" });
    expect(step.compareDocumentPosition(answer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(answer.compareDocumentPosition(rent)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // Nothing in the step is chosen for staff.
    expect(within(answer).queryAllByRole("radio", { checked: true })).toHaveLength(0);
    expect(within(rent).queryAllByRole("radio", { checked: true })).toHaveLength(0);
  });

  it("names the missing contact and makes its one action the step's next control, with the source hint separate", () => {
    ownerSection({ status: "yes", program: PROGRAM });
    const lead = leadOf();
    expect(within(lead).queryAllByRole("textbox")).toHaveLength(0);
    const shown = lead.querySelector('[data-renewal-field="assisted-program-contact"]');
    expect(shown).toHaveTextContent("No program contact is saved for this lease yet.");
    // The missing contact is the step's first next control, ahead of the outcome.
    const action = within(lead).getByRole("button", {
      name: "Enter the program contact",
    });
    const step = document.getElementById("renewal-manual-program_contact")!;
    expect(step.querySelector("[data-renewal-next-control]")).toBe(action);
    const hint = lead.querySelector(
      '[data-renewal-field="housing-assistance-source-hint"]',
    );
    expect(hint).toHaveTextContent(SOURCE_HINT);
    // The hint is its own line, never part of the saved contact.
    expect(shown).not.toContainElement(hint as HTMLElement);
    expect(shown).not.toHaveTextContent("RentVine");
  });

  it("opening and closing the step reads and writes nothing", () => {
    ownerSection(ASSISTED);
    const step = document.getElementById(
      "renewal-manual-program_contact",
    ) as HTMLDetailsElement;
    const summary = step.querySelector("summary")!;
    fireEvent.click(summary);
    fireEvent.click(summary);
    expect(request).not.toHaveBeenCalled();
  });

  it("offers no action and no editor when the save scope is revoked", () => {
    ownerSection(ASSISTED, false);
    const lead = leadOf();
    expect(within(lead).getByText(`Program contact: ${SAVED_CONTACT}`)).toBeVisible();
    expect(within(lead).queryAllByRole("button")).toHaveLength(0);
    expect(within(lead).queryAllByRole("textbox")).toHaveLength(0);
  });

  it("shows no program contact step for Not set or an explicit No (preservation)", () => {
    for (const value of [null, { status: "no" } as const]) {
      ownerSection(value);
      expect(document.getElementById("renewal-manual-program_contact")).toBeNull();
      expect(
        document.querySelector('[data-renewal-housing-placement="program-contact"]'),
      ).toBeNull();
      cleanup();
    }
  });
});

describe(
  "AC-S266-2: one editor for the contact, reached from the program contact step",
  {
    timeout: 120_000,
  },
  () => {
    const WORKSPACE_LEASE = "lease-318-cedar-7";
    const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
    const manual = () =>
      emptyRenewalWorkspace(WORKSPACE_LEASE, CYCLE_ID, {
        kind: "lease_end",
        dateIso: "2026-12-31",
        source: "RentVine lease end",
      });
    const pathStep = (id: string) =>
      document.querySelector<HTMLButtonElement>(
        `[data-renewal-path-step="${id}"] button`,
      )!;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-30T17:00:00.000Z"));
      window.history.replaceState(
        null,
        "",
        `/lease-renewal/live/desk/lease/${WORKSPACE_LEASE}`,
      );
      window.sessionStorage.clear();
    });
    afterEach(() => {
      vi.useRealTimers();
      window.history.replaceState(null, "", "/");
    });

    it("Full: Lease information holds the only contact input, and the action opens it there without a save", async () => {
      const routes = stubRenewalRoutes(manual());
      await renderWorkspace({
        view: "full",
        manual: manual(),
        extra: { workingRecord: record(ASSISTED, WORKSPACE_LEASE) },
      });
      const step = document.getElementById("renewal-manual-program_contact")!;
      const lead = leadOf(step);
      expect(within(lead).getByText(`Program contact: ${SAVED_CONTACT}`)).toBeVisible();
      const target = HOUSING_ASSISTANCE_TARGETS["lease-information"].contact;
      expect(document.getElementById(target)).toBeNull();

      fireEvent.click(
        within(lead).getByRole("button", { name: "Edit the program contact" }),
      );
      await settle();
      const panel = screen.getByRole("complementary", { name: "Lease information" });
      expect(panel).toBeVisible();
      const contact = document.getElementById(target) as HTMLInputElement;
      await waitFor(() => expect(contact).toHaveFocus());
      expect(contact).toHaveValue(SAVED_CONTACT);
      expect(
        contact.closest(`#${HOUSING_ASSISTANCE_TARGETS["lease-information"].field}`),
      ).toBeTruthy();
      // With the program contact step and Lease information both shown, the contact has one editor.
      expect(step.closest("[hidden]")).toBeNull();
      expect(screen.getAllByLabelText(CONTACT_LABEL)).toEqual([contact]);
      expect(within(lead).queryAllByRole("textbox")).toHaveLength(0);
      expect(routes.writes()).toEqual([]);
    });

    it("Guided: the action opens Check the numbers at the field's own contact input without a save", async () => {
      const routes = stubRenewalRoutes(manual());
      await renderWorkspace({
        view: "guided",
        manual: manual(),
        extra: {
          workingRecord: record({ status: "yes", program: PROGRAM }, WORKSPACE_LEASE),
        },
      });
      fireEvent.click(pathStep("assisted-program-contact"));
      await settle();
      expect(pathStep("assisted-program-contact")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      const step = document.getElementById("renewal-manual-program_contact")!;
      expect(step.closest("[hidden]")).toBeNull();
      const target = HOUSING_ASSISTANCE_TARGETS.now.contact;
      expect(document.getElementById(target)).toBeNull();

      const action = within(leadOf(step)).getByRole("button", {
        name: "Enter the program contact",
      });
      fireEvent.click(action);
      await settle();
      expect(pathStep("check-numbers")).toHaveAttribute("aria-pressed", "true");
      const contact = document.getElementById(target) as HTMLInputElement;
      await waitFor(() => expect(contact).toHaveFocus());
      expect(contact).toHaveValue("");
      expect(contact.closest(`#${HOUSING_ASSISTANCE_TARGETS.now.field}`)).toBeTruthy();
      expect(screen.getAllByLabelText(CONTACT_LABEL)).toEqual([contact]);
      expect(routes.writes()).toEqual([]);
    });
  },
);

describe("AC-S266-1: the field keeps Not set, No and Yes distinct with nothing preselected", () => {
  function field(
    value: HousingAssistanceValue | null,
    props: { mention?: boolean; explicitTask?: boolean } = {},
  ) {
    return render(
      <RenewalWorkingRecordProvider canEdit initialRecord={record(value)} leaseId={LEASE}>
        <HousingAssistanceField placement="now" {...props} />
      </RenewalWorkingRecordProvider>,
    );
  }
  const container = () =>
    document.getElementById("renewal-now-housing-assistance") as HTMLElement;

  it("keeps ordinary Not set optional with no answer, prompt or required mark", () => {
    field(null);
    expect(container()).toHaveAttribute("data-renewal-housing-assistance", "not_set");
    expect(container()).toHaveAttribute("data-renewal-housing-work", "optional");
    expect(screen.queryAllByRole("radio", { checked: true })).toHaveLength(0);
    expect(container()).not.toHaveTextContent("RentVine mentions housing assistance");
    expect(container().querySelector("[required]")).toBeNull();
  });

  it("brings the one field into Work for an explicit task without choosing an answer", () => {
    field(null, { explicitTask: true });
    expect(container()).toHaveAttribute("data-renewal-housing-work", "active");
    expect(container()).toHaveAttribute("data-renewal-housing-reason", "explicit_task");
    expect(screen.queryAllByRole("radio", { checked: true })).toHaveLength(0);
    expect(document.querySelectorAll("#renewal-now-housing-assistance")).toHaveLength(1);
  });

  it("treats a RentVine mention as an indication that leaves the answer unset", () => {
    field(null, { mention: true });
    expect(container()).toHaveAttribute("data-renewal-housing-work", "active");
    expect(container()).toHaveAttribute(
      "data-renewal-housing-reason",
      "program_indication",
    );
    expect(container()).toHaveTextContent(
      "RentVine mentions housing assistance. Set the field?",
    );
    expect(screen.queryAllByRole("radio", { checked: true })).toHaveLength(0);
    expect(request).not.toHaveBeenCalled();
  });

  it("reads an explicit No and a program Yes as their saved answers", () => {
    field({ status: "no" });
    expect(container()).toHaveAttribute("data-renewal-housing-assistance", "no");
    expect(container()).toHaveAttribute("data-renewal-housing-work", "optional");
    expect(screen.getByRole("radio", { name: "No" })).toBeChecked();
    cleanup();
    field(ASSISTED);
    expect(container()).toHaveAttribute("data-renewal-housing-assistance", "yes");
    expect(screen.getByRole("radio", { name: "Yes" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Program name" })).toHaveValue(PROGRAM);
    // The contact input carries the exact target the program contact step links to.
    expect(screen.getByRole("textbox", { name: CONTACT_LABEL })).toHaveAttribute(
      "id",
      HOUSING_ASSISTANCE_TARGETS.now.contact,
    );
  });
});
