// S278 R-S278-4 / R-S278-5 (ARCH-S278-3, BEH-S278-4, BEH-S278-5, AC-S278-4) with the deterministic
// Sheets adapter: one confirmation applies a lease row's listed cells in order, each through the
// existing exact field update with its own claim, compare-and-swap write, read-back and receipt.
// A changed value refuses the whole confirmation with nothing written; a cell that does not apply
// stops the run. Synthetic values only; no provider is reached.
import { describe, expect, it } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import { RENEWAL_TAB_SCHEMAS, resolveHeaders } from "@/lib/lease-renewal/headers";
import {
  SheetWritebackService,
  SheetWritebackServiceError,
  hashSheetHeader,
  type SheetWritebackDependencies,
  type SheetWritebackWriter,
} from "@/lib/lease-renewal/sheet-writeback/execution-service";
import {
  buildSheetWritebackProposal,
  sheetWritebackExecutionId,
  type SheetWritebackProposal,
  type ValidatedSheetWritebackEffect,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  recheckSheetSet,
  runSheetUpdateSet,
  sheetSetGroups,
} from "@/lib/lease-renewal/sheet-writeback/set-run";
import { SHEET_SET_WORDS } from "@/lib/lease-renewal/sheet-writeback/set-words";
import {
  assertProposalMatchesFreshLeaseContext,
  effectForSheetFieldIntent,
  type FreshOperatingSheetLeaseContext,
} from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
import type { SheetFieldIntent } from "@/lib/lease-renewal/sheet-writeback/field-intent";

const NOW = Date.parse("2026-11-13T12:00:00.000Z");
const RUNTIME_BINDING = {
  version: "operating-sheet-runtime/v1",
  revision: "pmi-kc-app-test-enabled-a",
  policy: "explicit-owner-enabled/v1",
} as const;
const HEADER = [
  "Have we confirmed pricing with the owner?",
  "Have we sent the renewal letter?",
  "What is the Lease/Tenant name?",
  "Renewal Date",
  "Current Rent",
  "Market Value",
  "Have they responded if they are renewing or not?",
  "Have the lease docs been sent out?",
];
const TENANT = "Existing Tenant";

/** The five listed cells, in list order. */
const INTENTS: SheetFieldIntent[] = [
  { field: "owner_pricing_confirmed", value: true, source: "Staff record" },
  {
    field: "renewal_letter_sent",
    value: "Done — recorded by staff",
    source: "Staff record",
  },
  { field: "market_value", value: 1500, source: "Rent to recommend, entered by staff" },
  {
    field: "tenant_responded",
    value: "Done — recorded by staff",
    source: "Staff record",
  },
  { field: "lease_docs_sent", value: "Done — recorded by staff", source: "Staff record" },
];

function letterIndex(letters: string) {
  let value = 0;
  for (const letter of letters) value = value * 26 + (letter.charCodeAt(0) - 64);
  return value - 1;
}

function harness() {
  const row = ["No", "", TENANT, "", "1400", "1450", "Waiting", ""];
  const writes: { range: string; before: string; after: string }[] = [];
  const claims: string[] = [];
  const resolution = resolveHeaders([HEADER], RENEWAL_TAB_SCHEMAS.Renewals);
  const columns = new Map<string, number>();
  for (const column of resolution.columns)
    if (column.field !== null && column.status === "resolved")
      columns.set(column.field, column.index);
  const cellAt = (range: string) => {
    const match = /!([A-Z]+)(\d+)(?::[A-Z]+\d+)?$/.exec(range);
    if (!match) throw new Error(`unexpected range ${range}`);
    return { column: letterIndex(match[1]!), row: Number(match[2]) };
  };
  const evidence = (value: string) => ({
    value: { stringValue: value },
    formattedValue: value,
    numberFormat: null,
    checkbox: false,
  });
  const writer: SheetWritebackWriter = {
    async getCellEvidence(_id, range) {
      const cell = cellAt(range);
      return evidence(cell.row === 1 ? HEADER[cell.column]! : (row[cell.column] ?? ""));
    },
    async getValues(_id, range) {
      if (range.endsWith("A1:AZ1")) return [HEADER];
      const cell = cellAt(range);
      return [[row[cell.column] ?? ""]];
    },
    async getSheetIdByTitle() {
      return 7;
    },
    async appendRowWithNote() {
      throw new Error("No append in a combined review.");
    },
    async deleteExactRow() {
      throw new Error("No deletion.");
    },
    async getColumnNotes() {
      return [{ rowNumber: 2, value: TENANT, note: "" }];
    },
    async replaceCellIfExactMatch(_id, range, before, after) {
      const cell = cellAt(range);
      writes.push({ range, before, after });
      if ((row[cell.column] ?? "") !== before) return false;
      row[cell.column] = after;
      return true;
    },
  };
  const store = new MemoryExternalExecutionStore();
  const dependencies: SheetWritebackDependencies = {
    descriptor: {
      environmentKind: "production",
      dataContext: "live",
      source: "explicit",
    } as never,
    store,
    createWriter: () => writer,
    gateFor: () => ({ isExecutable: async () => true, run: async (effect) => effect() }),
    writeFlagEnabled: () => true,
    runtimeBinding: () => RUNTIME_BINDING,
    claimLeaseScopedFieldUpdate: async (input) => {
      claims.push(input.effectHash);
      return store.claim(input.executionId, input.previewHash);
    },
    now: () => NOW,
  };
  /** A fresh read of the lease's one row, as the resolver builds it. */
  const context = (): FreshOperatingSheetLeaseContext => ({
    leaseId: "115",
    propertyId: "84",
    tenantName: TENANT,
    sourceReadAtIso: new Date(NOW).toISOString(),
    header: HEADER,
    columns,
    tenantColumnIndex: 2,
    association: { kind: "exact_link", rowNumber: 2 },
    row: {
      rowNumber: 2,
      rowKey: null,
      anchorTenantName: row[2]!,
      currentRentValue: row[4]!,
      fieldValues: Object.fromEntries(
        [...columns].map(([field, index]) => [field, row[index] ?? ""]),
      ),
      formulaFields: [],
      cellEvidence: Object.fromEntries(
        INTENTS.map((intent) => [
          intent.field,
          evidence(row[columns.get(intent.field)!] ?? ""),
        ]),
      ),
      currentRentSourceTriggerKey: null,
      currentRentCandidateFingerprint: null,
    },
  });
  const proposal: SheetWritebackProposal = buildSheetWritebackProposal({
    runtimeBinding: RUNTIME_BINDING,
    generationId: "proposal-set-12345678",
    spreadsheetId: "sheet-1",
    tabTitle: "Lease Renewal",
    headerHash: hashSheetHeader(HEADER, columns),
    headerWidth: HEADER.length,
    tenantColumnIndex: 2,
    scope: { kind: "lease_workspace", leaseId: "115", propertyId: "84" },
    actorUid: "editor-1",
    actorEmail: "editor@pmikcmetro.com",
    actorRole: "Editor",
    sourceReadAtIso: new Date(NOW - 1_000).toISOString(),
    evidenceRef: `workspace:115:cycle:6f1c0d7e-2b9a-4c11-8d3e-5a7b9c1d2e3f:manual:set-${"e".repeat(64)}`,
    effects: INTENTS.map((intent) => effectForSheetFieldIntent(context(), intent)),
    nowMs: NOW,
  });
  const service = new SheetWritebackService(dependencies);
  return { row, writes, claims, store, columns, context, proposal, service };
}

type Harness = ReturnType<typeof harness>;
type Injection = {
  readonly at: number;
  readonly kind: "conflict" | "refusal" | "readback";
};

async function run(h: Harness, injection?: Injection) {
  return runSheetUpdateSet({
    proposal: h.proposal,
    effectHashes: h.proposal.effects.map((effect) => effect.effectHash),
    recheck: async () => recheckSheetSet(h.proposal, h.context()),
    executeOne: async (entry: ValidatedSheetWritebackEffect) => {
      const here = injection && entry.index === injection.at ? injection.kind : null;
      // A collaborator changed this cell after the recheck: the compare-and-swap refuses it.
      if (here === "conflict" && entry.effect.kind === "field_update")
        h.row[h.columns.get(entry.effect.field)!] = "Changed by a collaborator";
      return h.service.executeEffect({
        proposal: h.proposal,
        effectHash: entry.effectHash,
        confirmation: {
          previewHash: h.proposal.previewHash,
          effectHash: entry.effectHash,
          confirmedAtIso: new Date(NOW).toISOString(),
        },
        revalidateBeforeEffect: async () => {
          if (here === "refusal")
            throw new SheetWritebackServiceError("authorization_stale");
          assertProposalMatchesFreshLeaseContext(
            h.proposal,
            h.context(),
            null,
            false,
            entry.effectHash,
          );
        },
        revalidateAfterEffect: async () => {
          if (here === "readback")
            throw new SheetWritebackServiceError("provider_readback_mismatch");
          assertProposalMatchesFreshLeaseContext(
            h.proposal,
            h.context(),
            null,
            true,
            entry.effectHash,
          );
        },
      });
    },
    describeError: (error) =>
      error instanceof SheetWritebackServiceError
        ? { message: `Refused (${error.code}).`, type: error.code }
        : { message: String(error), type: "unknown" },
  });
}

async function receipted(h: Harness, index: number) {
  const record = await h.store.get(
    sheetWritebackExecutionId(h.proposal, h.proposal.effects[index]!),
  );
  return record?.state === "succeeded" && Boolean(record.receipt);
}

describe("S278 ARCH-S278-3: one confirmation, one claim, write, read-back and receipt per cell", () => {
  it("BEH-S278-4 / AC-S278-4: five cells take one confirmation and leave five claims, five one-cell writes and five receipts", async () => {
    const h = harness();
    const outcome = await run(h);
    expect(outcome.state).toBe("ran");
    if (outcome.state !== "ran") return;
    expect(outcome.results.map((result) => result.state)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
    ]);
    expect(h.claims).toEqual(h.proposal.effects.map((effect) => effect.effectHash));
    expect(h.writes).toHaveLength(5);
    // Each write carries exactly one field's cell, in list order.
    expect(h.writes.map((write) => write.range)).toEqual([
      "'Lease Renewal'!A2",
      "'Lease Renewal'!B2",
      "'Lease Renewal'!F2",
      "'Lease Renewal'!G2",
      "'Lease Renewal'!H2",
    ]);
    for (let index = 0; index < 5; index++) expect(await receipted(h, index)).toBe(true);
    expect(outcome.summary).toEqual([SHEET_SET_WORDS.allWritten(5)]);
    expect(h.row[5]).toBe("1500");
  });

  it("BEH-S278-5 / AC-S278-4: a value changed between the preview and the confirmation refuses the whole confirmation with the field named, and nothing is written", async () => {
    const h = harness();
    h.row[5] = "1475";
    const outcome = await run(h);
    expect(outcome).toEqual({
      state: "refused",
      changed: ["Market value"],
      message:
        "The Sheet changed since this preview: Market value. Review the updates again.",
    });
    expect(h.writes).toHaveLength(0);
    expect(h.claims).toHaveLength(0);
  });

  it("AC-S278-4: a changed row identity refuses the whole confirmation", async () => {
    const h = harness();
    h.row[2] = "Another Tenant";
    const outcome = await run(h);
    expect(outcome).toMatchObject({ state: "refused", changed: ["the lease's row"] });
    expect(h.writes).toHaveLength(0);
  });

  describe.each(["conflict", "refusal", "readback"] as const)(
    "R-S278-5: a %s stops the run",
    (kind) => {
      it.each([0, 2, 4])(
        "at position %i: cells before it hold receipts, cells after it are unattempted, and the list names each group",
        async (at) => {
          const h = harness();
          const outcome = await run(h, { at, kind });
          expect(outcome.state).toBe("ran");
          if (outcome.state !== "ran") return;
          const states = outcome.results.map((result) => result.state);
          expect(states.slice(0, at)).toEqual(Array(at).fill("done"));
          expect(states[at]).toBe("failed");
          expect(states.slice(at + 1)).toEqual(Array(4 - at).fill("unattempted"));
          for (let index = 0; index < at; index++)
            expect(await receipted(h, index)).toBe(true);
          // Nothing after the failing cell was claimed or written.
          for (let index = at + 1; index < 5; index++) {
            expect(
              await h.store.get(
                sheetWritebackExecutionId(h.proposal, h.proposal.effects[index]!),
              ),
            ).toBeNull();
            expect(h.claims).not.toContain(h.proposal.effects[index]!.effectHash);
          }
          // A failed read-back follows its own write; a conflict or refusal writes nothing.
          expect(h.writes).toHaveLength(kind === "readback" ? at + 1 : at);
          const groups = sheetSetGroups(outcome.results);
          const labels = outcome.results.map((result) => result.label);
          expect(groups.written).toEqual(labels.slice(0, at));
          expect(groups.stopped?.label).toBe(labels[at]);
          expect(groups.unattempted).toEqual(labels.slice(at + 1));
          expect(outcome.summary).toContain(SHEET_SET_WORDS.stopNote);
          if (at > 0)
            expect(outcome.summary).toContain(
              SHEET_SET_WORDS.written(labels.slice(0, at)),
            );
          if (at < 4)
            expect(outcome.summary).toContain(
              SHEET_SET_WORDS.unattempted(labels.slice(at + 1)),
            );
        },
      );
    },
  );

  it("R-S278-5: nothing retries on its own; another attempt needs a fresh preview", async () => {
    const h = harness();
    await run(h, { at: 2, kind: "refusal" });
    const writes = h.writes.length;
    expect(writes).toBe(2);
    // The same preview confirmed again is refused by the whole-set read: the cells this run wrote
    // no longer hold the previewed values, so nothing is written again.
    const again = await run(h);
    expect(again).toMatchObject({
      state: "refused",
      changed: ["Owner pricing confirmed", "Renewal letter sent"],
    });
    expect(h.writes).toHaveLength(writes);
  });
});
