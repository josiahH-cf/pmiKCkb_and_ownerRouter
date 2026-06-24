import { describe, expect, it } from "vitest";
import { runRenewalPipeline, type NonSheetCandidate } from "@/lib/lease-renewal/pipeline";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";

// Reuse the real Renewals header so the grid fingerprints + header-resolves to the "Renewals" tab.
const HEADER = SAMPLE_RENEWAL_TABLES[0][0] as readonly string[];
const WIDTH = HEADER.length;
const col = (needle: string): number =>
  HEADER.findIndex((h) => h.toLowerCase().includes(needle));
const TENANT = col("tenant name");
const CURRENT_RENT = col("current rent");

function renewalsRow(overrides: Record<number, string>): string[] {
  const row = Array.from({ length: WIDTH }, () => "");
  for (const [index, value] of Object.entries(overrides)) row[Number(index)] = value;
  return row;
}

function flagKeys(run: ReturnType<typeof runRenewalPipeline>): string[] {
  return run.flags.map((f) => f.fieldKey);
}

describe("§2.1 blank worklist cells with no authoritative match do not flag", () => {
  it("a blank renewal_date/current_rent on an un-joined row raises no flag", () => {
    const tables = [[HEADER, renewalsRow({ [TENANT]: "Unjoined Person" })]];
    const run = runRenewalPipeline({
      runId: "noise-1",
      tables,
      nonSheetCandidates: [], // nothing joins
    });
    // Previously these blank High-severity fields each raised a "missing" flag; now they are
    // recognized as un-started worklist state.
    expect(run.flags).toHaveLength(0);
  });

  it("still flags a blank High field when an authoritative source DID join and supplies a value", () => {
    // (Sanity) when rentvine joins and the sheet is blank, it is single_source rentvine -> benign,
    // not a flag. A genuine conflict is what flags — covered below.
    const tables = [
      [HEADER, renewalsRow({ [TENANT]: "Casey Rivers", [CURRENT_RENT]: "$1,300" })],
    ];
    const conflicting: NonSheetCandidate = {
      source: "rentvine",
      source_system: "Rentvine (read-authoritative)",
      joinKind: "name",
      joinValue: "Casey Rivers",
      fields: { current_rent: { value: 1400, confidence: "Verified" } },
    };
    const run = runRenewalPipeline({
      runId: "noise-2",
      tables,
      nonSheetCandidates: [conflicting],
    });
    expect(flagKeys(run)).toContain("current_rent");
  });
});

describe("§2.3 a current_rent gap explained by RBP + insurance is not a real conflict", () => {
  it("downgrades the add-on-explained conflict to no flag", () => {
    const tables = [
      [HEADER, renewalsRow({ [TENANT]: "Addon Tenant", [CURRENT_RENT]: "$1,289.95" })],
    ];
    const candidate: NonSheetCandidate = {
      source: "rentvine",
      source_system: "Rentvine (read-authoritative)",
      joinKind: "name",
      joinValue: "Addon Tenant",
      fields: { current_rent: { value: 1250, confidence: "Verified" } }, // base rent
    };
    const run = runRenewalPipeline({
      runId: "rent-1",
      tables,
      nonSheetCandidates: [candidate],
    });
    expect(flagKeys(run)).not.toContain("current_rent");
  });

  it("still flags a real pricing difference", () => {
    const tables = [
      [HEADER, renewalsRow({ [TENANT]: "Real Diff", [CURRENT_RENT]: "$1,500" })],
    ];
    const candidate: NonSheetCandidate = {
      source: "rentvine",
      source_system: "Rentvine (read-authoritative)",
      joinKind: "name",
      joinValue: "Real Diff",
      fields: { current_rent: { value: 1250, confidence: "Verified" } },
    };
    const run = runRenewalPipeline({
      runId: "rent-2",
      tables,
      nonSheetCandidates: [candidate],
    });
    expect(flagKeys(run)).toContain("current_rent");
  });
});

describe("§2.3 downgrade is directional and considers every joined amount", () => {
  it("keeps the flag when a SECOND joined amount is a real (non-add-on) difference", () => {
    const tables = [
      [HEADER, renewalsRow({ [TENANT]: "Two Cand", [CURRENT_RENT]: "$1,289.95" })],
    ];
    // Both join the row by name; one is add-on-explained (1250), the other is a real difference (1500).
    const mk = (rent: number): NonSheetCandidate => ({
      source: "rentvine",
      source_system: "Rentvine (read-authoritative)",
      joinKind: "name",
      joinValue: "Two Cand",
      fields: { current_rent: { value: rent, confidence: "Verified" } },
    });
    const run = runRenewalPipeline({
      runId: "multi-1",
      tables,
      nonSheetCandidates: [mk(1250), mk(1500)],
    });
    expect(flagKeys(run)).toContain("current_rent");
  });

  it("keeps the flag when the sheet is LOWER than the base by an add-on sum (not add-on folding)", () => {
    const tables = [
      [HEADER, renewalsRow({ [TENANT]: "Reverse", [CURRENT_RENT]: "$1,250" })],
    ];
    const candidate: NonSheetCandidate = {
      source: "rentvine",
      source_system: "Rentvine (read-authoritative)",
      joinKind: "name",
      joinValue: "Reverse",
      fields: { current_rent: { value: 1289.95, confidence: "Verified" } }, // base is HIGHER than sheet
    };
    const run = runRenewalPipeline({
      runId: "reverse-1",
      tables,
      nonSheetCandidates: [candidate],
    });
    expect(flagKeys(run)).toContain("current_rent");
  });
});

describe("RentVine-id join is definitive (bypasses the fuzzy name join)", () => {
  const tables = [
    [HEADER, renewalsRow({ [TENANT]: "Sheet Spelling", [CURRENT_RENT]: "$1,300" })],
  ];
  // Same lease, but the candidate's tenant name would never fuzzy-match the sheet spelling.
  const candidate: NonSheetCandidate = {
    source: "rentvine",
    source_system: "Rentvine (read-authoritative)",
    joinKind: "name",
    joinValue: "Completely Different Name",
    joinId: "lease:777",
    fields: { current_rent: { value: 1400, confidence: "Verified" } },
  };

  it("matches by id and surfaces the genuine conflict the name join would have missed", () => {
    const run = runRenewalPipeline({
      runId: "id-1",
      tables,
      nonSheetCandidates: [candidate],
      recordJoinIds: { 1: "lease:777" }, // the data row's sourceRowIndex is 1 (header is row 0)
    });
    expect(flagKeys(run)).toContain("current_rent");
  });

  it("without the id link the name join misses, so no conflict is raised", () => {
    const run = runRenewalPipeline({
      runId: "id-2",
      tables,
      nonSheetCandidates: [candidate], // no recordJoinIds
    });
    expect(flagKeys(run)).not.toContain("current_rent");
  });
});
