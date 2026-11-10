import { describe, expect, it } from "vitest";

import {
  applyLeaseDetailToView,
  leaseCurrentRent,
  leaseTotalRentAmount,
  leaseUnitListedRent,
  leaseViewsFromExport,
} from "@/lib/integrations/rentvine/lease-mapper";
import {
  CURRENT_BASE_RENT_LABEL,
  currentBaseRent,
  operationalCurrentRent,
} from "@/lib/lease-renewal/current-rent";
import { buildDeskLeaseGuidance } from "@/lib/lease-renewal/desk-guidance";
import {
  kickoffFactsFor,
  UNREAD_KICKOFF_SUPPORT,
} from "@/lib/lease-renewal/kickoff-facts";
import {
  composeRenewalMessage,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import { WORKING_CURRENT_RENT_TARGET } from "@/lib/lease-renewal/workspace-targets";
import {
  fixtureCharge,
  fixtureInventory,
  fixtureWorkingRecord,
} from "@/tests/helpers/rent-charge-fixtures";
import { projectRenewalBatchRow } from "@/lib/lease-renewal/renewal-batch-row";
import {
  getRenewalDeskView,
  getRenewalLeaseWorkspace,
} from "@/tests/helpers/sample-desk";

// S261 R-S261-1 / ARCH-S261-1 / BEH-S261-1 / AC-S261-1: one current base rent decision. The
// lease's own base, the provider's payment total, the unit's listed rent and each separate charge
// stay distinct facts; the batch, the comparison preparation and the owner message read the same
// base, and the worklist keeps its explicitly typed RentVine amount. Every amount, lease and label
// is synthetic.

const RENT = fixtureCharge("401", {
  accountLabel: "Rent",
  projection: { amount: "900.00", description: "Rent" },
});
const PET_RENT = fixtureCharge("402", {
  accountId: "15",
  accountLabel: "Pet Rent",
  classification: "non_rent",
  projection: { accountID: "15", amount: "40.00", description: "Pet Rent" },
});
/** The same pet line booked to a rent account: a second candidate rent charge. */
const PET_RENT_ON_RENT_ACCOUNT = fixtureCharge("403", {
  accountLabel: "Pet Rent",
  projection: { amount: "40.00", description: "Pet Rent" },
});
const COMBINED_RENT = fixtureCharge("404", {
  accountLabel: "Rent",
  projection: { amount: "940.00", description: "Rent" },
});

/** One export row through the S102 lease-detail path: base, total and listed rent apart. */
function leaseView(detail: { baseRentAmount: number | null; rentAmount: number | null }) {
  const [view] = leaseViewsFromExport([
    {
      lease: {
        leaseID: 4821,
        endDate: "2026-12-31",
        tenants: [{ name: "Sample Tenant" }],
      },
      unit: { unitID: 77, rent: "1000.00" },
      property: { streetNumber: "4821", streetName: "Example Avenue" },
    },
  ]);
  applyLeaseDetailToView(view!, { leaseID: 4821, ...detail });
  return view!;
}

function ownerFacts(
  currentBaseRentFact: RenewalMessageFacts["currentBaseRent"],
  check?: string | null,
): RenewalMessageFacts {
  return {
    outgoingContract: true,
    ownerIntent: "recommend_rent",
    channel: "owner",
    names: ["Sample Owner"],
    firstNames: ["Sample"],
    address: "4821 Example Avenue",
    currentBaseRent: currentBaseRentFact,
    ...(check ? { currentBaseRentCheck: check } : {}),
    leaseEndDate: "2026-12-31",
    ownerTerms: null,
    range: { low: 950, high: 1050, source: "Synthetic comparison" },
    suggestedRent: { value: 980, source: "Synthetic proposal", kind: "proposal" },
    comps: [],
    trend: null,
    sparseCompsQualification: null,
    charges: [],
    insuranceTransition: null,
    leaseOrigin: null,
    otherChargesComparison: null,
    informationForm: null,
    insuranceFlyer: null,
    rbpFlyer: null,
    signature: null,
    attachments: [],
  } as RenewalMessageFacts;
}

/** Every amount a consumer must never present as the base. */
const NOT_BASE = ["$940", "940.00", "$1,000", "1000.00", "$860", "860.00"];

describe("S261 one current base rent decision", () => {
  it("AC-S261-1 / BEH-S261-1: the real data path reads $900 base with $40 pet rent apart; the $940 total and $1,000 listed rent stay their own facts", () => {
    const view = leaseView({ baseRentAmount: 900, rentAmount: 940 });
    expect(leaseCurrentRent(view)).toBe(900);
    expect(leaseTotalRentAmount(view)).toBe(940);
    expect(leaseUnitListedRent(view)).toBe(1000);
    const decision = currentBaseRent({
      inventory: fixtureInventory([RENT, PET_RENT]),
      contractualRent: leaseCurrentRent(view) ?? null,
      providerTotal: leaseTotalRentAmount(view) ?? null,
      listedRent: leaseUnitListedRent(view) ?? null,
    });
    expect(decision).toMatchObject({
      state: "ready",
      amount: 900,
      basis: "rent_charge",
      check: null,
      providerTotal: 940,
      listedRent: 1000,
      correctionTarget: WORKING_CURRENT_RENT_TARGET,
    });
    expect(decision.separateCharges).toEqual([
      { id: "402", label: "Pet Rent", amount: 40 },
    ]);
    expect(CURRENT_BASE_RENT_LABEL).toBe("Current base rent");
    const message = composeRenewalMessage(
      ownerFacts({ value: decision.amount!, source: decision.label }),
    );
    expect(message.plainText).toContain(
      "We are currently charging them $900.00 per month.",
    );
    for (const amount of NOT_BASE) expect(message.plainText).not.toContain(amount);
  });

  it("BEH-S261-1: with only the $940 payment total the base needs verification and names what to verify; subtracting the pet line never makes a base", () => {
    const view = leaseView({ baseRentAmount: null, rentAmount: 940 });
    expect(leaseCurrentRent(view)).toBeUndefined();
    const decision = currentBaseRent({
      inventory: fixtureInventory([PET_RENT]),
      contractualRent: leaseCurrentRent(view) ?? null,
      providerTotal: leaseTotalRentAmount(view) ?? null,
      listedRent: leaseUnitListedRent(view) ?? null,
    });
    expect(decision.state).toBe("needs_verification");
    expect(decision.amount).toBeNull();
    expect(decision.check).toMatchObject({ kind: "missing", leads: true });
    expect(decision.check!.text).toContain("$940");
    expect(decision.check!.text).toMatch(/not the base rent/);
    expect(decision.check!.text).toMatch(/working current rent/);
    expect(decision.correctionTarget).toBe(WORKING_CURRENT_RENT_TARGET);
    // The dependent owner message field says what to verify instead of a guessed amount.
    const message = composeRenewalMessage(ownerFacts(null, decision.check!.text));
    expect(message.missing).toContainEqual({
      field: "currentBaseRent",
      message: decision.check!.text,
    });
    expect(message.plainText).toContain("[Needs Verification: current rent]");
    for (const amount of NOT_BASE) expect(message.plainText).not.toContain(amount);
  });

  it("BEH-S261-1: ambiguous candidate rent accounts with no contractual base list each amount and need verification", () => {
    const decision = currentBaseRent({
      inventory: fixtureInventory([RENT, PET_RENT_ON_RENT_ACCOUNT]),
      contractualRent: null,
      providerTotal: 940,
    });
    expect(decision).toMatchObject({
      state: "needs_verification",
      amount: null,
      chargeEvidence: "several",
    });
    expect(decision.check).toMatchObject({ kind: "ambiguous", leads: true });
    expect(decision.check!.sources.map((source) => source.amount)).toEqual(
      expect.arrayContaining([900, 40]),
    );
    expect(decision.check!.text).toContain("$900");
    expect(decision.check!.text).toContain("$40");
  });

  it("AC-S261-1: a rent charge that disagrees with the contractual base is not guessed; the correction leads with both sources", () => {
    const decision = currentBaseRent({
      inventory: fixtureInventory([COMBINED_RENT]),
      contractualRent: 900,
      providerTotal: 940,
    });
    expect(decision.state).toBe("needs_verification");
    expect(decision.amount).toBeNull();
    expect(decision.check).toMatchObject({ kind: "conflict", leads: true });
    expect(decision.check!.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amount: 940 }),
        expect.objectContaining({ amount: 900 }),
      ]),
    );
    // S153's typed evidence is unchanged: the rent charge is still the identified charge.
    expect(decision.rentCharge?.id).toBe("404");
    expect(decision.contractualRent).toBe(900);
  });

  it("AC-S261-1: multiple candidate rent accounts that include the contractual base keep it, with the correction leading", () => {
    const decision = currentBaseRent({
      inventory: fixtureInventory([RENT, PET_RENT_ON_RENT_ACCOUNT]),
      contractualRent: 900,
    });
    expect(decision).toMatchObject({ state: "ready", amount: 900, basis: "contractual" });
    expect(decision.check).toMatchObject({ kind: "ambiguous", leads: true });
    // A contractual base that matches none of several rent charges is a conflict, never a sum.
    const combined = currentBaseRent({
      inventory: fixtureInventory([RENT, PET_RENT_ON_RENT_ACCOUNT]),
      contractualRent: 940,
    });
    expect(combined).toMatchObject({ state: "needs_verification", amount: null });
    expect(combined.check?.kind).toBe("conflict");
  });

  it("AC-S261-1: zero candidate rent accounts keep the contractual base under its own label and note the check without leading", () => {
    const decision = currentBaseRent({
      inventory: fixtureInventory([PET_RENT]),
      contractualRent: 900,
    });
    expect(decision).toMatchObject({
      state: "ready",
      amount: 900,
      basis: "contractual",
      label: "RentVine contractual lease amount",
    });
    expect(decision.check).toMatchObject({ kind: "unconfirmed", leads: false });
    expect(decision.separateCharges.map((charge) => charge.amount)).toEqual([40]);
  });

  it("AC-S261-1: a source timeout keeps the contractual base and states the unavailable read without leading", () => {
    const decision = currentBaseRent({ inventory: null, contractualRent: 900 });
    expect(decision).toMatchObject({ state: "ready", amount: 900, basis: "contractual" });
    expect(decision.check).toMatchObject({ kind: "unavailable", leads: false });
    expect(decision.check!.text).toMatch(/could not be read/);
  });

  it("R-S261-3: the working correction leads every consumer and settles the check", () => {
    const working = fixtureWorkingRecord({ current_rent: { value: 900, revision: 2 } });
    const decision = currentBaseRent({
      working,
      inventory: fixtureInventory([COMBINED_RENT]),
      contractualRent: 940,
      providerTotal: 940,
    });
    expect(decision).toMatchObject({
      state: "ready",
      amount: 900,
      basis: "working",
      check: null,
    });
    // The desk holds only the amount; it reaches the same base.
    expect(
      operationalCurrentRent({ workingRent: 900, contractualRent: 940 }),
    ).toMatchObject({ amount: 900, basis: "working" });
  });

  it("ARCH-S261-1: the batch row and the comparison preparation read the same base as the lease page; the worklist keeps the explicitly typed RentVine amount", () => {
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    const guidance = buildDeskLeaseGuidance({
      summary: workspace.summary,
      process: workspace.process,
      dataCheck: workspace.dataCheck,
      rentvineCurrentRent: 940,
      rentDecision: null,
      currencyState: "fresh",
      readComplete: true,
    });
    // The worklist column is a typed source amount: RentVine's own figure, labelled RentVine,
    // with the working correction shown beside it on the row.
    expect(guidance).toMatchObject({
      currentBaseRent: 940,
      currentBaseRentSource: "RentVine",
    });
    const deskRow = getRenewalDeskView().items.find(
      (row) => row.id === "lease-318-cedar-7",
    )!;
    const batchRow = (row: typeof deskRow) =>
      projectRenewalBatchRow(row, { sourceReadAtIso: null, todayIso: "2026-11-10" });
    // "Current base rent" in the batch is the one base decision: the correction, never 940.
    expect(
      batchRow({ ...deskRow, currentRent: 940, workingCurrentRent: 900 }).currentBaseRent,
    ).toBe(900);
    expect(batchRow({ ...deskRow, currentRent: 940 }).currentBaseRent).toBe(940);
    const facts = kickoffFactsFor({
      leaseId: "4821",
      cycleDateIso: "2026-12-31",
      contractualRent: 940,
      leaseEndIso: "2026-12-31",
      workingCurrentRent: 900,
      address: "4821 Example Avenue",
      dataCheck: null,
      manual: null,
      working: null,
      sourceReadable: true,
      ownerRecipient: { state: "ready" },
      support: UNREAD_KICKOFF_SUPPORT,
    });
    // The comparison suggestion is held near the corrected base, the same base the message uses.
    expect(facts.currentRent).toBe(900);
  });
});
