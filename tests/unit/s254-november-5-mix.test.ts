import { describe, expect, it } from "vitest";

import {
  NOVEMBER_5_MIX_COUNTS,
  NOVEMBER_5_MIX_PATH,
  NOVEMBER_5_MIX_ROLES,
  checkNovember5MixShape,
  loadNovember5Mix,
  readNovember5Mix,
  rentvineStandInResponse,
  shiftMixDate,
  summarizeNovember5Mix,
  workingMonthFor,
  type November5MixFixture,
} from "@/scripts/lib/one-path-rehearsal/november-5-mix.mjs";

// S254 ARCH-S254-3 / AC-S254-4 / R-S254-2: the "November 5 mix" is one data file of 38 synthetic
// leases in the rehearsal's RentVine transport shape. Its group counts are checked, every value is
// plainly synthetic, and the loader shifts its dates by whole months so the shape holds on any
// business date.

const fixture = readNovember5Mix();
const ANCHOR = "2026-11-05";
const clone = (): November5MixFixture => structuredClone(fixture);
const leaseOf = (source: November5MixFixture, leaseId: number) =>
  source.leases.find((row) => row.lease.leaseID === leaseId)!;

describe("S254 ARCH-S254-3: the November 5 mix is one checked data file", () => {
  it("is the named fixture, anchored to November 5, 2026", () => {
    expect(NOVEMBER_5_MIX_PATH).toBe("tests/fixtures/lease-renewal/november-5-mix.json");
    expect(fixture.name).toBe("November 5 mix");
    expect(fixture.anchorBusinessDate).toBe(ANCHOR);
    expect(fixture.leases).toHaveLength(38);
  });

  it("has the group counts of R-S254-2", () => {
    expect(NOVEMBER_5_MIX_COUNTS).toEqual({
      working_month: 5,
      carried_over: 4,
      later: 12,
      closed: 10,
      renewed_in_rentvine: 3,
      month_to_month: 3,
      move_out_notice: 1,
    });
    const mix = loadNovember5Mix(fixture, ANCHOR);
    expect(mix.workingMonth).toBe("2026-12");
    expect(mix.monthsShifted).toBe(0);
    const summary = summarizeNovember5Mix(mix);
    expect(summary.counts).toEqual(NOVEMBER_5_MIX_COUNTS);
    expect(Object.values(summary.counts).reduce((sum, count) => sum + count, 0)).toBe(38);
    expect(checkNovember5MixShape(fixture)).toEqual([]);
  });

  it("derives each group from the source rows, not from a label", () => {
    const mix = loadNovember5Mix(fixture, ANCHOR);
    const { groups } = summarizeNovember5Mix(mix);
    const row = (leaseId: number) => mix.leases.find((r) => r.lease.leaseID === leaseId)!;
    const status = (leaseId: number) =>
      mix.statuses.find(
        (entry) =>
          String(entry.leaseStatus.leaseStatusID) ===
          String(row(leaseId).lease.leaseStatusID),
      )!.leaseStatus;
    for (const leaseId of groups.working_month)
      expect(row(leaseId).lease.endDate.slice(0, 7)).toBe("2026-12");
    for (const leaseId of groups.carried_over)
      expect(row(leaseId).lease.endDate.slice(0, 7)).toBe("2026-11");
    for (const leaseId of groups.later)
      expect(row(leaseId).lease.endDate.slice(0, 7) > "2026-12").toBe(true);
    for (const leaseId of groups.closed)
      expect(String(status(leaseId).primaryLeaseStatusID)).toBe("3");
    for (const leaseId of groups.move_out_notice)
      expect(String(status(leaseId).isPendingMoveOutStatus)).toBe("1");
    for (const leaseId of groups.month_to_month)
      expect(row(leaseId).lease.isMonthToMonth).toBe("1");
    for (const leaseId of groups.renewed_in_rentvine)
      expect(mix.recordedCycles[String(leaseId)] < row(leaseId).lease.endDate).toBe(true);
    // The four carried-over leases have four different end dates, so their order is observable.
    expect(new Set(groups.carried_over.map((id) => row(id).lease.endDate)).size).toBe(4);
    // Closed leases end in the carried-over month, the working month and later, so a closed lease
    // would sit in each open group if RentVine's status were ignored.
    expect(
      [...new Set(groups.closed.map((id) => row(id).lease.endDate.slice(0, 7)))].sort(),
    ).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("names the five working-month leases the handoff describes", () => {
    const mix = loadNovember5Mix(fixture, ANCHOR);
    const { groups } = summarizeNovember5Mix(mix);
    expect(Object.keys(mix.roles).sort()).toEqual([...NOVEMBER_5_MIX_ROLES].sort());
    expect(
      Object.values(mix.roles)
        .map((role) => role.leaseId)
        .sort(),
    ).toEqual([...groups.working_month].sort());
    const row = (role: keyof typeof mix.roles) =>
      mix.leases.find((r) => r.lease.leaseID === mix.roles[role].leaseId)!;
    const ownerEmails = (role: keyof typeof mix.roles) =>
      row(role).portfolio.owners.map((owner) => owner.email ?? null);
    // The prepared and replied leases have a verified owner recipient.
    expect(ownerEmails("prepared")).toEqual([
      expect.stringMatching(/@example\.invalid$/),
    ]);
    expect(ownerEmails("replied")).toEqual([expect.stringMatching(/@example\.invalid$/)]);
    // The missing-recipient lease has no owner address and five tenants.
    expect(ownerEmails("missingRecipient")).toEqual([null]);
    expect(row("missingRecipient").lease.tenants).toHaveLength(5);
    // The covered lease is alone in its portfolio, so an agreement on it covers no other lease.
    const covered = row("covered").portfolio.portfolioID;
    expect(mix.leases.filter((r) => r.portfolio.portfolioID === covered)).toHaveLength(1);
    // Candidate-only facts ride beside the source rows as seed data.
    expect(mix.roles.prepared.animals).toEqual([
      { name: "Example Pet One", kind: "pet" },
    ]);
    expect(mix.roles.covered.animals.map((animal) => animal.kind)).toEqual([
      "pet",
      "pet",
    ]);
    expect(mix.roles.assisted.animals.map((animal) => animal.kind)).toEqual([
      "assistance_animal",
    ]);
    expect(mix.roles.assisted.housingAssistance).toEqual({
      program: "Example Housing Assistance Office",
    });
    expect(mix.roles.covered.standingAgreement?.name).toBe("Example Standing Agreement");
  });

  it("carries voucher wording on exactly one later lease, in a field the classification reads", () => {
    const mix = loadNovember5Mix(fixture, ANCHOR);
    const summary = summarizeNovember5Mix(mix);
    expect(summary.assistanceWordingLeaseIds).toHaveLength(1);
    expect(summary.groups.later).toContain(summary.assistanceWordingLeaseIds[0]);
    const lease = leaseOf(fixture, summary.assistanceWordingLeaseIds[0]).lease;
    expect(String(lease.tags)).toMatch(/voucher/i);
    // The first key the program signal reads on this row is the one with the wording.
    for (const key of ["program", "programName", "leaseType", "leaseTypeName"])
      expect(lease).not.toHaveProperty(key);
  });
});

describe("S254 R-S254-2: the shape holds whenever the rehearsal runs", () => {
  it("the working month is the next calendar month on the business date", () => {
    expect(workingMonthFor("2026-11-05")).toBe("2026-12");
    expect(workingMonthFor("2026-11-30")).toBe("2026-12");
    expect(workingMonthFor("2026-12-01")).toBe("2027-01");
    expect(workingMonthFor("2027-01-31")).toBe("2027-02");
  });

  it("dates shift by whole months, and a month end stays a month end", () => {
    expect(shiftMixDate("2026-12-31", 0)).toBe("2026-12-31");
    expect(shiftMixDate("2026-12-31", 2)).toBe("2027-02-28");
    expect(shiftMixDate("2026-11-30", 1)).toBe("2026-12-31");
    expect(shiftMixDate("2027-02-28", 12)).toBe("2028-02-29");
    expect(shiftMixDate("2026-11-03", 3)).toBe("2027-02-03");
    expect(shiftMixDate("2025-12-15", -2)).toBe("2025-10-15");
    expect(shiftMixDate("2026-01-30", 1)).toBe("2026-02-28");
  });

  it.each([
    "2026-11-01",
    "2026-11-05",
    "2026-11-30",
    "2026-12-01",
    "2026-12-31",
    "2027-01-15",
    "2027-02-28",
    "2027-06-01",
    "2028-02-29",
    "2028-12-31",
  ])("keeps the group counts on the business date %s", (businessDate) => {
    const mix = loadNovember5Mix(fixture, businessDate);
    expect(mix.workingMonth).toBe(workingMonthFor(businessDate));
    expect(summarizeNovember5Mix(mix).counts).toEqual(NOVEMBER_5_MIX_COUNTS);
    expect(checkNovember5MixShape(fixture, businessDate)).toEqual([]);
  });

  it("the three month-to-month reviews fall in the working month", () => {
    const mix = loadNovember5Mix(fixture, "2027-03-10");
    const { groups } = summarizeNovember5Mix(mix);
    for (const leaseId of groups.month_to_month) {
      const lease = mix.leases.find((row) => row.lease.leaseID === leaseId)!.lease;
      // The annual review is twelve months after the month-to-month start.
      expect(shiftMixDate(lease.monthToMonthStartDate!, 12).slice(0, 7)).toBe("2027-04");
    }
  });
});

describe("S254 AC-S254-4: a different count or a value that is not synthetic fails", () => {
  it("a different group count fails", () => {
    const fewer = clone();
    fewer.leases = fewer.leases.filter(
      (row) => row.lease.leaseID !== fixture.roles.replied.leaseId,
    );
    expect(checkNovember5MixShape(fewer)).toEqual(
      expect.arrayContaining([
        "The fixture has 37 leases where 38 belong.",
        "The fixture has 4 leases ending in the working month where 5 belong.",
      ]),
    );
    const reopened = clone();
    const closed = summarizeNovember5Mix(loadNovember5Mix(fixture, ANCHOR)).groups
      .closed[0];
    leaseOf(reopened, closed).lease.leaseStatusID = leaseOf(
      reopened,
      fixture.roles.prepared.leaseId,
    ).lease.leaseStatusID;
    const problems = checkNovember5MixShape(reopened);
    expect(problems).toContain(
      "The fixture has 9 leases closed in RentVine where 10 belong.",
    );
  });

  it("a second lease with voucher wording, or none, fails", () => {
    const none = clone();
    const voucher = summarizeNovember5Mix(loadNovember5Mix(fixture, ANCHOR))
      .assistanceWordingLeaseIds[0];
    delete leaseOf(none, voucher).lease.tags;
    expect(checkNovember5MixShape(none)).toContain(
      "The fixture has 0 leases with voucher wording where 1 belongs, among the leases ending later.",
    );
  });

  it("a recorded cycle that is not earlier than the RentVine end date fails", () => {
    const same = clone();
    const [leaseId] = Object.keys(same.recordedCycles);
    same.recordedCycles[leaseId] = leaseOf(same, Number(leaseId)).lease.endDate;
    expect(checkNovember5MixShape(same)).toContain(
      "The fixture has 2 leases whose RentVine end date is later than their recorded cycle where 3 belong.",
    );
  });

  it.each([
    [
      "a tenant name that is not an Example or Sample name",
      (source: November5MixFixture) => {
        source.leases[0].lease.tenants[0].name = "Pat Rivera";
      },
      /tenant name "Pat Rivera" is not an Example or Sample name/,
    ],
    [
      "an owner address outside example.invalid",
      (source: November5MixFixture) => {
        source.leases[0].portfolio.owners[0].email = "pat.owner@gmail.com";
      },
      /address "pat\.owner@gmail\.com" is not on example\.invalid/,
    ],
    [
      "a street that is not an Example or Sample street",
      (source: November5MixFixture) => {
        source.leases[3].property.streetName = "Wornall Rd";
      },
      /street "Wornall Rd" is not an Example or Sample street/,
    ],
    [
      "a postal code outside the invented range",
      (source: November5MixFixture) => {
        source.leases[3].unit.postalCode = "64118";
      },
      /postal code "64118" is not in the invented 001xx range/,
    ],
    [
      "a lease id outside the fixture's own range",
      (source: November5MixFixture) => {
        source.leases[5].lease.leaseID = 4821;
      },
      /lease id 4821 is outside the fixture's invented range/,
    ],
    [
      "a rent that is not a plainly invented amount",
      (source: November5MixFixture) => {
        source.leases[5].unit.rent = "1337.42";
      },
      /rent "1337\.42" is not a plainly invented amount/,
    ],
    [
      "a phone number",
      (source: November5MixFixture) => {
        (source.leases[2].lease.tenants[0] as Record<string, unknown>).phone =
          "816-555-0142";
      },
      /carries a phone number/,
    ],
  ])("%s fails", (_label, mutate, message) => {
    const mutated = clone();
    mutate(mutated);
    expect(checkNovember5MixShape(mutated).join("\n")).toMatch(message);
  });
});

describe("S254 R-S254-3: the same rows load on the starting commit and on the candidate", () => {
  const mix = loadNovember5Mix(fixture, ANCHOR);
  const at = (path: string, flags = {}) =>
    rentvineStandInResponse(
      mix,
      new URL(`https://pmikcmetro.rentvine.com/api/manager/${path}`),
      flags,
    );

  it("keeps the transport shape of the existing rehearsal rows", () => {
    for (const row of mix.leases) {
      expect(Object.keys(row).sort()).toEqual(["lease", "portfolio", "property", "unit"]);
      expect(row.lease.tenants.length).toBeGreaterThan(0);
      expect(row.portfolio.owners.length).toBeGreaterThan(0);
      expect(row.unit.rent).toMatch(/^\d+\.00$/);
    }
  });

  it("answers the export, the status table and each lease detail", () => {
    expect(at("leases/export?page=1&pageSize=500")).toEqual({ body: mix.leases });
    expect(at("leases/export?page=2&pageSize=500")).toEqual({ body: [] });
    expect(at("leases/statuses")).toEqual({ body: mix.statuses });
    const prepared = mix.roles.prepared.leaseId;
    const detail = at(`leases/${prepared}`).body as { lease: Record<string, unknown> };
    expect(detail.lease).toMatchObject({
      leaseID: prepared,
      endDate: "2026-12-31",
      isMonthToMonth: "0",
      monthToMonthStartDate: null,
      leaseStatusID: 2,
      noticeDate: null,
    });
    expect(detail.lease.baseRentAmount).toBe(detail.lease.rentAmount);
    expect(at(`leases/${prepared}/recurring-charges`)).toEqual({ body: [] });
    expect(at("leases/999999")).toEqual({ body: undefined });
    const monthToMonth = summarizeNovember5Mix(mix).groups.month_to_month[0];
    expect(
      (at(`leases/${monthToMonth}`).body as { lease: Record<string, unknown> }).lease,
    ).toMatchObject({ isMonthToMonth: "1", monthToMonthStartDate: "2025-12-10" });
  });

  it("serves the recorded end date while a recorded cycle is being seeded", () => {
    const [leaseId, recorded] = Object.entries(mix.recordedCycles)[0];
    const current = mix.leases.find((row) => String(row.lease.leaseID) === leaseId)!.lease
      .endDate;
    const detail = (flags = {}) =>
      (at(`leases/${leaseId}`, flags).body as { lease: { endDate: string } }).lease
        .endDate;
    expect(detail()).toBe(current);
    expect(detail({ recordingCycles: true })).toBe(recorded);
    const exported = (
      at("leases/export?page=1", { recordingCycles: true }).body as typeof mix.leases
    ).find((row) => String(row.lease.leaseID) === leaseId)!;
    expect(exported.lease.endDate).toBe(recorded);
    expect(recorded < current).toBe(true);
  });

  it("can make one lease's RentVine status unreadable, and only that lease's", () => {
    const prepared = mix.roles.prepared.leaseId;
    const other = mix.roles.covered.leaseId;
    const flags = { statusUnreadable: { [String(prepared)]: "missing" } };
    const lease = (leaseId: number, f = flags) =>
      (at(`leases/${leaseId}`, f).body as { lease: Record<string, unknown> }).lease;
    expect(lease(prepared)).not.toHaveProperty("leaseStatusID");
    expect(lease(other).leaseStatusID).toBe(2);
    const exported = at("leases/export?page=1", flags).body as typeof mix.leases;
    expect(
      exported.find((row) => row.lease.leaseID === prepared)!.lease,
    ).not.toHaveProperty("leaseStatusID");
    expect(exported.find((row) => row.lease.leaseID === other)!.lease.leaseStatusID).toBe(
      2,
    );
    // An id the status table does not hold is the other way a status cannot be read.
    const unresolved = { statusUnreadable: { [String(prepared)]: "unresolved" } };
    expect(lease(prepared, unresolved).leaseStatusID).toBe(999);
    expect(
      mix.statuses.some((entry) => String(entry.leaseStatus.leaseStatusID) === "999"),
    ).toBe(false);
  });
});
