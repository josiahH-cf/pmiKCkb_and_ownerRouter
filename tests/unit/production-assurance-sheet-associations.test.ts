import { describe, expect, it } from "vitest";
import { projectIndependentSheetLinks } from "../../lib/production-assurance/renewal-source-projection";

const host = "pmikcmetro.rentvine.com";
const sheet = (rows: unknown[][]) => ({
  valueRanges: [
    {
      range: "'Lease Renewal'!A1:C9",
      values: [["What is the lease tenant name?", "Current Rent", "Lease"], ...rows],
    },
  ],
});
const source = (names: string[]) => ({
  complete: true as const,
  rows: names.map((name, index) => ({
    lease: { leaseID: String(index + 1), tenantName: name, endDate: "2027-01-31" },
  })),
});

describe("independent operating Sheet associations", () => {
  it("keeps unaligned wider rows out of associations while retaining their source drift", () => {
    const input = sheet([
      ["Person One", "$1,200", ""],
      ["Person One", "$900", "", "unmapped cell"],
      ["Person Two", "$900", "", "unmapped cell"],
    ]);
    const result = projectIndependentSheetLinks(
      input,
      input,
      {},
      host,
      source(["Person One", "Person Two"]),
    );
    expect([...result.byLeaseId]).toEqual([
      ["1", { sourceUrl: null, currentRent: 1200 }],
    ]);
    const changed = sheet([
      ["Person One", "$1,200", ""],
      ["Person One", "$901", "", "unmapped cell"],
      ["Person Two", "$900", "", "unmapped cell"],
    ]);
    expect(
      projectIndependentSheetLinks(
        changed,
        changed,
        {},
        host,
        source(["Person One", "Person Two"]),
      ).sourceDigest,
    ).not.toBe(result.sourceDigest);
  });
  it("requires complete independent identity evidence and never invents a source link", () => {
    const input = sheet([["Person One", "$1,200", ""]]);
    expect(() => projectIndependentSheetLinks(input, input, {}, host)).toThrow(
      /no exact RentVine lease link/,
    );
    const projection = projectIndependentSheetLinks(
      input,
      input,
      {},
      host,
      source(["One, Person"]),
    );
    expect([...projection.leaseUrls]).toEqual([]);
    expect([...projection.byLeaseId]).toEqual([
      ["1", { sourceUrl: null, currentRent: 1200 }],
    ]);
    expect(() =>
      projectIndependentSheetLinks(input, input, {}, host, {
        ...source(["Person One"]),
        complete: false,
      }),
    ).toThrow(/complete/);
  });

  it("preserves one-to-many, many-to-one, missing-field and unmatched ambiguity", () => {
    const input = sheet([
      ["Person One", "$1,200", ""],
      ["Unknown Person", "$900", ""],
    ]);
    const duplicateSource = source(["Person One", "Person One"]);
    expect([
      ...projectIndependentSheetLinks(input, input, {}, host, duplicateSource).byLeaseId,
    ]).toEqual([]);
    const repeated = sheet([
      ["Person One", "$1,200", ""],
      ["One, Person", "", ""],
    ]);
    expect([
      ...projectIndependentSheetLinks(
        repeated,
        repeated,
        {},
        host,
        source(["Person One"]),
      ).byLeaseId,
    ]).toEqual([]);
    const result = projectIndependentSheetLinks(
      input,
      input,
      {},
      host,
      source(["Person One"]),
    );
    expect([...result.byLeaseId.keys()]).toEqual(["1"]);
    const changed = sheet([
      ["Person One", "$1,200", ""],
      ["Unknown Person", "$901", ""],
    ]);
    expect(
      projectIndependentSheetLinks(changed, changed, {}, host, source(["Person One"]))
        .sourceDigest,
    ).not.toBe(result.sourceDigest);
  });

  it("keeps exact links separate and rejects duplicate or conflicting destinations", () => {
    const values = sheet([
      ["Person One", "$1,200", "Open"],
      ["Person One", "$900", ""],
    ]);
    const formulas = sheet([
      [
        "Person One",
        "$1,200",
        '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/1","Open")',
      ],
      ["Person One", "$900", ""],
    ]);
    const projection = projectIndependentSheetLinks(
      values,
      formulas,
      {},
      host,
      source(["Person One"]),
    );
    expect(projection.byLeaseId.get("1")).toEqual({
      sourceUrl: "https://pmikcmetro.rentvine.com/leases/1",
      currentRent: 1200,
    });
    const duplicate = sheet([
      [
        "Person One",
        "$1,200",
        '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/1","Open")',
      ],
      [
        "Person One",
        "$900",
        '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/1","Open")',
      ],
    ]);
    expect(() =>
      projectIndependentSheetLinks(values, duplicate, {}, host, source(["Person One"])),
    ).toThrow(/duplicate rows/);
  });

  it("refuses incomplete or duplicate identity reads and missing tenant headers", () => {
    const input = sheet([["Person One", "$1,200", ""]]);
    const one = source(["Person One"]);
    expect(() =>
      projectIndependentSheetLinks(input, input, {}, host, {
        complete: true,
        rows: [...one.rows, ...one.rows],
      }),
    ).toThrow(/identity/);
    const wrongHeader = {
      valueRanges: [
        {
          range: "Lease Renewal",
          values: [
            ["Tenant", "Current Rent"],
            ["Person One", "$1,200"],
          ],
        },
      ],
    };
    expect(() =>
      projectIndependentSheetLinks(wrongHeader, wrongHeader, {}, host, one),
    ).toThrow(/tenant header/);
  });
});
