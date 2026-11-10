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

import { SYNTHETIC_APPROVAL_CHOICES } from "../helpers/owner-approval-form";
import { HousingAssistanceField } from "@/components/lease-renewal/RenewalHousingAssistance";
import {
  RenewalManualProvider,
  RenewalManualSection,
} from "@/components/lease-renewal/RenewalManualWorkspace";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import type {
  HousingAssistanceValue,
  RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";
import { ASSISTED, PROGRAM } from "@/tests/fixtures/s266-program-source";

// S266 R-S266-1 / R-S266-2 on the mounted controls: the assisted outcome leads with the program
// and its current contact input in the existing program contact step, the field keeps Not set, No
// and Yes distinct with nothing preselected, and the source hint stays separate from the saved
// fact. Opening the step reads and writes nothing. Synthetic values only.

vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const LEASE = "9266";
const record = (value: HousingAssistanceValue | null): RenewalWorkingRecord => ({
  schemaVersion: "renewal-working-record/v1",
  leaseId: LEASE,
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

const SOURCE_HINT =
  "RentVine program source: Source pending. No approved RentVine program read is available. Enter the known contact here.";

describe("AC-S266-2: the program contact step leads with the program and its contact", () => {
  it("shows the program and the saved contact input first, then the owner's answer, then the rent choice", () => {
    ownerSection(ASSISTED);
    const step = document.getElementById("renewal-manual-program_contact")!;
    expect(step).toBeTruthy();
    const lead = step.querySelector<HTMLElement>(
      '[data-renewal-housing-placement="program-contact"]',
    )!;
    expect(lead).toBeTruthy();
    expect(within(lead).getByText(`Program: ${PROGRAM}`)).toBeVisible();
    expect(
      within(lead).getByRole("textbox", { name: "Program contact (optional)" }),
    ).toHaveValue("SYNTHETIC staff contact, 555-0100");
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

  it("names the missing contact action when no contact is saved, with the source hint separate", () => {
    ownerSection({ status: "yes", program: PROGRAM });
    const lead = document.querySelector<HTMLElement>(
      '[data-renewal-housing-placement="program-contact"]',
    )!;
    const input = within(lead).getByRole("textbox", {
      name: "Program contact (optional)",
    });
    expect(input).toHaveValue("");
    expect(lead).toHaveTextContent("No program contact is saved for this lease yet.");
    // The missing contact is the step's first next control, ahead of the outcome.
    const step = document.getElementById("renewal-manual-program_contact")!;
    expect(step.querySelector("[data-renewal-next-control]")).toBe(input);
    const hint = lead.querySelector(
      '[data-renewal-field="housing-assistance-source-hint"]',
    );
    expect(hint).toHaveTextContent(SOURCE_HINT);
    // The hint is its own line, never part of the saved fact or its attribution.
    expect(lead.querySelector(".working-field-attribution")).not.toContainElement(
      hint as HTMLElement,
    );
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

  it("corrects the contact locally on the one working-record field, keeping the program and notes", async () => {
    ownerSection(ASSISTED);
    const lead = document.querySelector<HTMLElement>(
      '[data-renewal-housing-placement="program-contact"]',
    )!;
    const contact = within(lead).getByRole("textbox", {
      name: "Program contact (optional)",
    });
    fireEvent.change(contact, { target: { value: "SYNTHETIC corrected contact" } });
    fireEvent.blur(contact);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/lease-renewal/working-record");
    expect(JSON.parse(String(init.body))).toMatchObject({
      leaseId: LEASE,
      field: "housing_assistance",
      expectedRevision: 1,
      value: {
        status: "yes",
        program: PROGRAM,
        contact: "SYNTHETIC corrected contact",
        notes: "SYNTHETIC staff note about the renewal packet",
      },
    });
  });

  it("keeps the contact read-only when the save scope is revoked", () => {
    ownerSection(ASSISTED, false);
    const lead = document.querySelector<HTMLElement>(
      '[data-renewal-housing-placement="program-contact"]',
    )!;
    expect(
      within(lead).getByRole("textbox", { name: "Program contact (optional)" }),
    ).toBeDisabled();
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
  });
});
