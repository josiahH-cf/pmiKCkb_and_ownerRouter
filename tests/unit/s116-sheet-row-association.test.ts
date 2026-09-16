import { describe, expect, it } from "vitest";

import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import {
  normalRowNote,
  proofRowNote,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  appendIntentRefusal,
  associateOperatingSheetRow,
  type OperatingSheetRowAssociation,
} from "@/lib/lease-renewal/sheet-writeback/row-association";

const HEADER = SAMPLE_RENEWAL_TABLES[0][0] as readonly string[];
const WIDTH = HEADER.length;
const TENANT = HEADER.findIndex((cell) => cell.toLowerCase().includes("tenant name"));
const RENT = HEADER.findIndex((cell) => cell.toLowerCase().includes("current rent"));

function row(tenant: string, rent = "$1,250"): string[] {
  const cells = Array.from({ length: WIDTH }, () => "");
  cells[TENANT] = tenant;
  cells[RENT] = rent;
  return cells;
}

const blank = (): string[] => Array.from({ length: WIDTH }, () => "");
const noNotes = (rows: number): (string | null)[][] =>
  Array.from({ length: rows }, () => Array.from({ length: WIDTH }, () => null));

function associate(input: {
  rawTable: readonly (readonly string[])[];
  rawJoins?: readonly (string | null)[];
  rawNotes?: readonly (readonly (string | null)[])[];
  headerRowIndex?: number;
  unitId?: string | null;
  tenantName?: string;
  layers?: { notes: boolean; cellLinks: boolean };
}): OperatingSheetRowAssociation {
  return associateOperatingSheetRow({
    rawTable: input.rawTable,
    rawJoins: input.rawJoins ?? input.rawTable.map(() => null),
    rawNotes: input.rawNotes ?? noNotes(input.rawTable.length),
    headerRowIndex: input.headerRowIndex ?? 0,
    tenantColumnIndex: TENANT,
    leaseId: "4821",
    propertyId: "84",
    unitId: input.unitId ?? "77",
    tenantName: input.tenantName ?? "Jordan Maple",
    layers: input.layers ?? { notes: true, cellLinks: true },
  });
}

// One fresh server-owned association governs presentation, update and absence-before-append
// (ARCH-S116-2). The live operating tab carries 146 of its RentVine links as rich text attached to
// the cell (counts-only inspection, 2026-09-16), which the formula-only read could not see, so an
// existing row looked absent and an append was offered. These cases pin every state the resolver
// can report and prove that nothing short of a confirmed absence permits the append path.
describe("S116 operating Sheet row association (AC-S116-2)", () => {
  it("resolves one exact lease link to that physical row, whatever layer carried the link", () => {
    const table = [HEADER, row("Jordan Maple"), row("RIVERS CASEY")];
    expect(
      associate({ rawTable: table, rawJoins: [null, "lease:4821", "lease:9007"] }),
    ).toEqual({ kind: "exact_link", rowNumber: 2 });
  });

  it("keeps physical coordinates across a divider, an offset header and an unrelated inserted row", () => {
    const table = [
      blank(),
      ["Section A", ...Array.from({ length: WIDTH - 1 }, () => "")],
      HEADER,
      row("Someone Else"),
      blank(),
      row("Jordan Maple"),
    ];
    expect(
      associate({
        rawTable: table,
        rawJoins: [null, null, null, "lease:1", null, "lease:4821"],
        headerRowIndex: 2,
      }),
    ).toEqual({ kind: "exact_link", rowNumber: 6 });
  });

  it("recognizes the app's own normal row note as the durable association", () => {
    const table = [HEADER, row("Jordan Maple")];
    const notes = noNotes(2);
    notes[1][TENANT] = normalRowNote({
      operationId: "op-12345678",
      leaseId: "4821",
      propertyId: "84",
    });
    expect(associate({ rawTable: table, rawNotes: notes })).toEqual({
      kind: "app_note",
      rowNumber: 2,
    });
  });

  it("reports two rows linking the same lease as ambiguous, never as the first one", () => {
    const table = [HEADER, row("Jordan Maple"), row("Jordan Maple (2025)")];
    expect(
      associate({ rawTable: table, rawJoins: [null, "lease:4821", "lease:4821"] }),
    ).toEqual({ kind: "ambiguous", reason: "multiple_rows", rowNumbers: [2, 3] });
  });

  it("reports a link and note that name different leases as a conflicting identity", () => {
    const table = [HEADER, row("Jordan Maple")];
    const notes = noNotes(2);
    notes[1][TENANT] = normalRowNote({
      operationId: "op-12345678",
      leaseId: "4821",
      propertyId: "84",
    });
    expect(
      associate({ rawTable: table, rawJoins: [null, "lease:999"], rawNotes: notes }),
    ).toEqual({ kind: "ambiguous", reason: "conflicting_identity", rowNumbers: [2] });
  });

  it("treats a row linking only this lease's unit as unconfirmed, not absent", () => {
    const table = [HEADER, row("Jordan Maple")];
    expect(associate({ rawTable: table, rawJoins: [null, "unit:77"] })).toEqual({
      kind: "ambiguous",
      reason: "unit_link_only",
      rowNumbers: [2],
    });
  });

  it("treats an unlinked row carrying this tenant's name as a plausible row, not absent", () => {
    const table = [HEADER, row("RIVERS CASEY"), row("Maple, Jordan")];
    expect(associate({ rawTable: table })).toEqual({
      kind: "ambiguous",
      reason: "plausible_unlinked_row",
      rowNumbers: [3],
    });
  });

  it("never lets a name become the association when an exact link exists elsewhere", () => {
    const table = [HEADER, row("Jordan Maple"), row("Jordan Maple")];
    expect(associate({ rawTable: table, rawJoins: [null, null, "lease:4821"] })).toEqual({
      kind: "exact_link",
      rowNumber: 3,
    });
  });

  it("refuses to confirm absence from an incomplete read", () => {
    const table = [HEADER, row("RIVERS CASEY")];
    expect(
      associate({ rawTable: table, layers: { notes: true, cellLinks: false } }),
    ).toEqual({
      kind: "ambiguous",
      reason: "metadata_incomplete",
    });
    expect(
      associate({ rawTable: table, layers: { notes: false, cellLinks: true } }),
    ).toEqual({
      kind: "ambiguous",
      reason: "metadata_incomplete",
    });
  });

  it("ignores sealed proof rows and confirms absence only from a complete one-to-one check", () => {
    const table = [HEADER, row("RIVERS CASEY"), row("Jordan Maple")];
    const notes = noNotes(3);
    notes[2][TENANT] = proofRowNote({
      operationId: "op-87654321",
      leaseId: "4821",
      propertyId: "84",
    });
    expect(
      associate({
        rawTable: table,
        rawJoins: [null, "lease:9007", null],
        rawNotes: notes,
      }),
    ).toEqual({ kind: "absent_confirmed" });
  });

  it("permits the append preview only after a confirmed absence", () => {
    expect(appendIntentRefusal({ kind: "absent_confirmed" })).toBeNull();
    expect(appendIntentRefusal({ kind: "exact_link", rowNumber: 2 })).toBe(
      "row_state_mismatch",
    );
    expect(appendIntentRefusal({ kind: "app_note", rowNumber: 2 })).toBe(
      "row_state_mismatch",
    );
    for (const reason of [
      "multiple_rows",
      "conflicting_identity",
      "unit_link_only",
      "plausible_unlinked_row",
      "metadata_incomplete",
    ] as const) {
      expect(appendIntentRefusal({ kind: "ambiguous", reason })).toBe(
        "row_join_ambiguous",
      );
    }
  });
});
