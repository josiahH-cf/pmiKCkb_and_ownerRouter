// @vitest-environment jsdom
// S262 R-S262-2 / R-S262-5 (BEH-S262-2, BEH-S262-5, AC-S262-2, AC-S262-5): Rent to recommend has
// one editor. Before the working base has its own value it edits that shared value; after a
// recorded owner answer it edits only the recommendation, and "Use this amount for the offer" is
// the one deliberate way to move a differing recommendation into the offer, against the exact
// recommendation revision reviewed. A value not bound to this renewal asks for confirmation in
// its own field. Only the HTTP seam is simulated. Synthetic values only.
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

import {
  RentRecommendationSummary,
  RentToRecommendField,
} from "@/components/lease-renewal/RenewalKickoffFields";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import type {
  RenewalWorkingRecord,
  WorkingFieldEntry,
} from "@/lib/lease-renewal/working-record";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// The spec's exact labels.
const USE_FOR_OFFER_LABEL = "Use this amount for the offer";
const CONFIRM_FOR_THIS_RENEWAL_LABEL = "Confirm for this renewal";
type HeldFutureTerm = { entry: WorkingFieldEntry; scope: "earlier" | "unverified" };

const LEASE = "701";
const CYCLE = "0f1c8f6e-6d1c-4bd3-9d7a-00000000000a";
const ANSWER = "0f1c8f6e-6d1c-4bd3-9d7a-000000000040";

function entry(
  value: number,
  revision: number,
  extra: Partial<WorkingFieldEntry> = {},
): WorkingFieldEntry {
  return {
    value,
    revision,
    eventId: `0f1c8f6e-6d1c-4bd3-9d7a-00000000020${revision}`,
    recordedAt: "2026-10-02T15:00:00.000Z",
    recordedByUid: "editor-1",
    recordedByLabel: "editor1@pmikcmetro.com",
    origin: "staff_entry",
    cycleId: CYCLE,
    ...extra,
  };
}

function working(
  fields: Record<string, WorkingFieldEntry>,
  revision = 4,
  held: Partial<Record<"terms_rent", HeldFutureTerm>> = {},
): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: LEASE,
    revision,
    fields,
    cycle: { cycleId: CYCLE, held },
  };
}

const approvedBase = (value = 1875, revision = 2) =>
  entry(value, revision, {
    basis: { kind: "owner_approval", ownerResponseEventId: ANSWER },
  });

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function posts() {
  return fetchMock.mock.calls
    .filter((call) => (call[1] as { method?: string } | undefined)?.method === "POST")
    .map(
      (call) => JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>,
    );
}

function renderField(record: RenewalWorkingRecord) {
  return render(
    <RenewalWorkingRecordProvider canEdit initialRecord={record} leaseId={LEASE}>
      <RentToRecommendField preparation={null} />
      <RentRecommendationSummary preparation={null} />
    </RenewalWorkingRecordProvider>,
  );
}

const rentInput = () => screen.getByLabelText(/Rent to recommend/) as HTMLInputElement;

describe("R-S262-2 Rent to recommend and the offer amount", () => {
  it("BEH-S262-2: one shared working value is edited in place and offers no separate adoption", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { record: working({ terms_rent: entry(1860, 2) }, 5) }),
    );
    renderField(working({ terms_rent: entry(1850, 1) }));
    expect(rentInput()).toHaveValue("1850");
    expect(screen.queryByRole("button", { name: USE_FOR_OFFER_LABEL })).toBeNull();
    fireEvent.change(rentInput(), { target: { value: "1860" } });
    fireEvent.blur(rentInput());
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toMatchObject({
      leaseId: LEASE,
      field: "terms_rent",
      value: 1860,
      expectedRevision: 1,
      expectedCycleId: CYCLE,
    });
  });

  it("BEH-S262-2: after an approved base, editing Rent to recommend leaves the offer on the approved amount", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        record: working(
          { terms_rent: approvedBase(), recommended_rent: entry(1900, 2) },
          5,
        ),
      }),
    );
    renderField(
      working({ terms_rent: approvedBase(), recommended_rent: entry(1850, 1) }),
    );
    expect(rentInput()).toHaveValue("1850");
    expect(screen.getByText(/The offer uses \$1,875/)).toBeInTheDocument();
    fireEvent.change(rentInput(), { target: { value: "1900" } });
    fireEvent.blur(rentInput());
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toMatchObject({
      field: "recommended_rent",
      value: 1900,
      expectedRevision: 1,
      expectedCycleId: CYCLE,
    });
    expect(posts()[0]).not.toHaveProperty("recommendationRevision");
  });

  it("AC-S262-2: Use this amount for the offer reviews the change and applies exactly the reviewed recommendation revision", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        record: working(
          {
            terms_rent: entry(1900, 3, {
              basis: { kind: "recommendation", recommendationRevision: 3 },
            }),
            recommended_rent: entry(1900, 3),
          },
          6,
        ),
      }),
    );
    renderField(
      working({ terms_rent: approvedBase(), recommended_rent: entry(1900, 3) }),
    );
    fireEvent.click(screen.getByRole("button", { name: USE_FOR_OFFER_LABEL }));
    // Opening the review saves nothing.
    expect(posts()).toHaveLength(0);
    const dialog = screen.getByRole("dialog", { name: `${USE_FOR_OFFER_LABEL}?` });
    expect(dialog).toHaveTextContent(
      "The offer amount changes from $1,875 to $1,900, the current Rent to recommend.",
    );
    expect(dialog).toHaveTextContent("This is not an owner approval");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Use $1,900 for the offer" }),
    );
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toMatchObject({
      field: "terms_rent",
      value: 1900,
      expectedRevision: 2,
      expectedCycleId: CYCLE,
      recommendationRevision: 3,
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: USE_FOR_OFFER_LABEL })).toBeNull(),
    );
  });

  it("AC-S262-5: a changed recommendation revision refuses the adoption and keeps the offer amount", async () => {
    const message =
      "Rent to recommend changed since you reviewed it, so the offer amount was not changed. Review Rent to recommend, then choose Use this amount for the offer again.";
    const current = working({
      terms_rent: approvedBase(),
      recommended_rent: entry(1900, 3),
    });
    fetchMock.mockImplementation(async (_url: string, init?: { method?: string }) =>
      init?.method === "POST"
        ? jsonResponse(409, { error: message })
        : jsonResponse(200, { record: current }),
    );
    renderField(current);
    fireEvent.click(screen.getByRole("button", { name: USE_FOR_OFFER_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: "Use $1,900 for the offer" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(screen.getByText(/The offer uses \$1,875/)).toBeInTheDocument();
  });

  it("BEH-S262-2: an approval with no earlier recommendation shows it as unavailable and never copies the approved rent into it", () => {
    renderField(working({ terms_rent: approvedBase() }));
    expect(rentInput()).toHaveValue("");
    expect(
      screen.getByText(/The earlier recommendation is not available/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Rent to recommend:/)).toHaveTextContent("Not set");
    expect(screen.queryByRole("button", { name: USE_FOR_OFFER_LABEL })).toBeNull();
  });
});

describe("R-S262-5 a value that is not current for this renewal", () => {
  it("BEH-S262-5: an unbound earlier value is shown, is not used, and is confirmed only deliberately in its own field", async () => {
    const legacy = entry(1850, 2, {});
    delete (legacy as { cycleId?: unknown }).cycleId;
    fetchMock.mockResolvedValue(
      jsonResponse(200, { record: working({ terms_rent: entry(1850, 3) }, 5) }),
    );
    renderField(working({}, 4, { terms_rent: { entry: legacy, scope: "unverified" } }));
    expect(rentInput()).toHaveValue("");
    expect(
      screen.getByText(/Not confirmed for this renewal: \$1,850/),
    ).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: CONFIRM_FOR_THIS_RENEWAL_LABEL }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toMatchObject({
      field: "terms_rent",
      value: 1850,
      expectedRevision: 2,
      expectedCycleId: CYCLE,
      origin: "staff_entry",
    });
  });

  it("BEH-S262-5: an earlier renewal's value stays history and offers no confirmation", () => {
    renderField(
      working({}, 4, {
        terms_rent: {
          entry: entry(1850, 2, { cycleId: "0f1c8f6e-6d1c-4bd3-9d7a-00000000000b" }),
          scope: "earlier",
        },
      }),
    );
    expect(rentInput()).toHaveValue("");
    expect(
      screen.getByText(
        "From an earlier renewal: $1,850. It stays in this lease's history and is not used for this renewal.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: CONFIRM_FOR_THIS_RENEWAL_LABEL }),
    ).toBeNull();
  });
});
