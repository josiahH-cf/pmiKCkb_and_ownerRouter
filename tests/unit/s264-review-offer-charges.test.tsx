// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  RenewalOfferChargeAdd,
  RenewalOfferCharges,
} from "@/components/lease-renewal/RenewalOfferCharges";
import {
  emptyOfferChargeSelection,
  OfferChargeSelectionSchema,
  projectOfferCharges,
  type OfferChargeSelection,
  type OfferSourceLine,
} from "@/lib/lease-renewal/offer-charges";
import {
  OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
  type OfferChargeMappingEntry,
  type OfferChargeMappingsRead,
} from "@/lib/lease-renewal/offer-charge-mapping";
import type { MessageCharge } from "@/lib/lease-renewal/renewal-message-content";

// S264 AC-S264-2 / AC-S264-3 / AC-S264-7 at the component: "Review offer charges" is the one
// owner of the offer's charge selection. It proposes verified lines with their source, needs the
// evidence to leave a line out, keeps a legacy family-only entry inspectable until a deliberate
// disposition, records a case fee only with its trigger and source, shows the exact separate
// totals, and holds a material transition until its source is entered. The parent recomputes the
// same projection from the local selection, as the preparation does.

afterEach(() => cleanup());

const RENEWAL = "2027-02-01";
const line = (chargeId: string, accountId: string, amount: string): OfferSourceLine => ({
  chargeId,
  accountId,
  accountName: `Synthetic account ${accountId}`,
  description: "Synthetic line",
  classification: "non_rent",
  amount,
  frequency: "1",
  startDate: "2026-02-01",
  endDate: null,
  endDateRaw: null,
  statusId: 1,
  version: `v-${chargeId}`,
});
const entry = (
  accountId: string,
  displayLabel: string,
  family: OfferChargeMappingEntry["family"],
): OfferChargeMappingEntry => ({
  entryId: `00000000-0000-4000-8000-00000000${accountId}`,
  accountId,
  accountName: `Synthetic account ${accountId}`,
  displayLabel,
  family,
  frequencyMonths: 1,
  applicability: "active_on_renewal_date",
  requirement: null,
  approval: { reference: "Synthetic approval note", approvedOn: "2026-11-01" },
});
const MAPPINGS: OfferChargeMappingsRead = {
  readable: true,
  record: {
    schemaVersion: OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
    version: 1,
    entries: [
      entry("9001", "Pet rent", "pet"),
      entry("9002", "Credit reporting", "credit_reporting"),
      entry("9003", "Insurance program", "insurance"),
    ],
    updatedAt: "2026-11-02T15:00:00.000Z",
    updatedByUid: "synthetic-admin",
  },
};

function Harness(props: {
  lines: OfferSourceLine[];
  legacy?: MessageCharge[];
  canEdit?: boolean;
  onCommit: (selection: OfferChargeSelection) => void;
}) {
  const [selection, setSelection] = useState(emptyOfferChargeSelection());
  const review = projectOfferCharges({
    leaseId: "7264",
    source: props.lines.length
      ? { state: "read", asOf: "2026-11-10", lines: props.lines, version: "src" }
      : { state: "not_read" },
    mappings: MAPPINGS,
    selection,
    terms: { rent: 920, effectiveDate: RENEWAL },
    legacyCharges: props.legacy ?? [],
  });
  return (
    <>
      <RenewalOfferCharges
        canEdit={props.canEdit ?? true}
        review={review}
        selection={selection}
        onChange={setSelection}
        onCommit={() => props.onCommit(selection)}
      />
      {/* S270: the optional case charge lives in the offer's options group. */}
      <RenewalOfferChargeAdd
        canEdit={props.canEdit ?? true}
        selection={selection}
        onChange={setSelection}
        onCommit={() => props.onCommit(selection)}
      />
    </>
  );
}

const region = () => screen.getByRole("region", { name: "Review offer charges" });
const total = (kind: "monthly" | "one_time") =>
  region().querySelector<HTMLElement>(`[data-offer-charge-total="${kind}"]`)!;
const row = (rowKey: string) =>
  region().querySelector<HTMLElement>(`[data-offer-charge-row="${rowKey}"]`)!;

describe("S264 AC-S264-2/3 Review offer charges", () => {
  it("proposes verified lines, needs evidence to leave a line out, and shows exact separate totals", () => {
    const commits: OfferChargeSelection[] = [];
    render(
      <Harness
        lines={[
          line("101", "9001", "45.00"),
          line("102", "9002", "13.00"),
          line("103", "9555", "40.00"),
        ]}
        onCommit={(selection) => commits.push(selection)}
      />,
    );
    expect(screen.getByRole("heading", { name: "Review offer charges" })).toBeTruthy();
    // The actionable line leads, before any preview.
    expect(region().querySelector("[data-offer-charges-lead]")!.textContent).toMatch(
      /^First: Synthetic account 9555: No approved offer mapping names RentVine account 9555\./,
    );
    expect(row("rentvine:101").getAttribute("data-offer-charge-status")).toBe("selected");
    expect(
      within(row("rentvine:101")).getByText(/Proposed: included, stays the same/),
    ).toBeTruthy();
    expect(
      within(row("rentvine:101")).getByText(/^Source: RentVine recurring charge 101/),
    ).toBeTruthy();
    expect(total("monthly").textContent).toBe(
      "Known monthly subtotal: $978.00. Not complete yet.",
    );
    expect(total("monthly").getAttribute("data-offer-charge-complete")).toBe("false");
    // An unmapped line is decided for this lease: leaving it out needs its evidence.
    const choice = screen.getByLabelText(
      "Does Synthetic account 9555 apply to this offer?",
    );
    expect(
      [...(choice as HTMLSelectElement).options].map((option) => option.value),
    ).toEqual(["", "include", "exclude"]);
    fireEvent.change(choice, { target: { value: "exclude" } });
    expect(row("rentvine:103").getAttribute("data-offer-charge-status")).toBe(
      "needs_decision",
    );
    fireEvent.change(screen.getByLabelText("Why it does not apply (its evidence)"), {
      target: { value: "Synthetic: duplicate of the pet line" },
    });
    expect(row("rentvine:103").getAttribute("data-offer-charge-status")).toBe("excluded");
    expect(total("monthly").textContent).toBe("Monthly total: $978.00");
    expect(total("monthly").getAttribute("data-offer-charge-complete")).toBe("true");
    expect(region().querySelector("[data-offer-charges-lead='resolved']")).not.toBeNull();
    // A case fee counts only with its amount, date, trigger and source.
    fireEvent.change(screen.getByLabelText("Add a charge for this lease only"), {
      target: { value: "renewal_processing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add this charge" }));
    expect(total("one_time").textContent).toBe(
      "Known one-time subtotal: $0.00. Not complete yet.",
    );
    const amount = screen.getByLabelText("Renewal processing fee amount ($)");
    // Fractions of a cent are named at the field and never saved.
    fireEvent.change(amount, { target: { value: "35.005" } });
    fireEvent.blur(amount);
    expect(
      screen.getByText("Enter the amount in dollars and cents, like 45.00."),
    ).toBeTruthy();
    expect(total("one_time").textContent).toBe(
      "Known one-time subtotal: $0.00. Not complete yet.",
    );
    fireEvent.change(amount, { target: { value: "35" } });
    fireEvent.blur(amount);
    expect(
      screen.queryByText("Enter the amount in dollars and cents, like 45.00."),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Date it applies from"), {
      target: { value: RENEWAL },
    });
    fireEvent.change(screen.getByLabelText("What triggers this fee for this lease"), {
      target: { value: "Synthetic: signed after the posted date" },
    });
    fireEvent.change(screen.getByLabelText("Authorized case source or approved policy"), {
      target: { value: "Synthetic case approval reference" },
    });
    expect(total("one_time").textContent).toBe("One-time total: $35.00");
    expect(total("monthly").textContent).toBe("Monthly total: $978.00");
    // Each decision saved is the one schema the server stores.
    expect(commits.length).toBeGreaterThan(0);
    for (const saved of commits)
      expect(OfferChargeSelectionSchema.safeParse(saved).success).toBe(true);
  });

  it("a line no mapping names is decided for this lease: what it is and why it applies", () => {
    render(<Harness lines={[line("103", "9555", "40.00")]} onCommit={() => undefined} />);
    fireEvent.change(
      screen.getByLabelText("Does Synthetic account 9555 apply to this offer?"),
      { target: { value: "include" } },
    );
    const reason = screen.getByLabelText("Why it applies (its source)");
    fireEvent.change(reason, { target: { value: "Synthetic signed pet addendum" } });
    // The reason's own field stays while it is typed.
    expect(screen.getByLabelText("Why it applies (its source)")).toBe(reason);
    expect(total("monthly").getAttribute("data-offer-charge-complete")).toBe("false");
    fireEvent.change(screen.getByLabelText("What this charge is for this lease"), {
      target: { value: "pet" },
    });
    expect(row("rentvine:103").querySelector("strong")!.textContent).toBe("Pet rent");
    expect(row("rentvine:103").getAttribute("data-offer-charge-status")).toBe("selected");
    expect(total("monthly").textContent).toBe("Monthly total: $960.00");
  });

  it("a legacy family-only entry stays inspectable and counts only after a deliberate disposition", () => {
    render(
      <Harness
        lines={[]}
        legacy={[
          {
            id: "pet",
            applicable: true,
            amount: 45,
            cadence: "monthly",
            effectiveDate: RENEWAL,
            source: "Synthetic earlier staff entry",
            comparison: "unchanged",
          },
        ]}
        onCommit={() => undefined}
      />,
    );
    expect(row("legacy:pet").getAttribute("data-offer-charge-status")).toBe(
      "needs_decision",
    );
    expect(within(row("legacy:pet")).getByRole("note").textContent).toBe(
      "This entry was saved before each charge became its own line. Use it for this offer or leave it out.",
    );
    expect(total("monthly").textContent).toBe(
      "Known monthly subtotal: $920.00. Not complete yet.",
    );
    fireEvent.change(screen.getByLabelText("Does Pet rent apply to this offer?"), {
      target: { value: "include" },
    });
    expect(row("legacy:pet").getAttribute("data-offer-charge-status")).toBe("selected");
    expect(total("monthly").textContent).toBe("Monthly total: $965.00");
  });

  it("read-only roles see the same review without a control that changes it", () => {
    render(
      <Harness
        canEdit={false}
        lines={[line("101", "9001", "45.00")]}
        onCommit={() => undefined}
      />,
    );
    expect(
      region().querySelectorAll("select:not([disabled]), input:not([disabled])"),
    ).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add this charge" })).toBeNull();
  });
});

describe("S264 AC-S264-7 the insurance transition in Review offer charges", () => {
  it("unknown stays source pending until a choice and its source are both entered", () => {
    render(<Harness lines={[line("120", "9003", "12.50")]} onCommit={() => undefined} />);
    const lead = () =>
      region().querySelector("[data-offer-charges-lead]")?.textContent ?? "";
    expect(lead()).toBe(
      "First: Choose whether the insurance transition applies to this renewal, with its source.",
    );
    fireEvent.change(
      screen.getByLabelText("Does the insurance transition apply to this renewal?"),
      {
        target: { value: "does_not_apply" },
      },
    );
    expect(
      screen.getByText("Add its source; until then the transition stays source pending."),
    ).toBeTruthy();
    expect(lead()).toMatch(/insurance transition/);
    fireEvent.change(screen.getByLabelText("Source for the insurance decision"), {
      target: { value: "Synthetic tenant policy on file" },
    });
    expect(
      screen.queryByText(
        "Add its source; until then the transition stays source pending.",
      ),
    ).toBeNull();
    expect(region().querySelector("[data-offer-charges-lead='resolved']")).not.toBeNull();
  });
});
