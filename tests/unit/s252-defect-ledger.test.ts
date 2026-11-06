// S252 ARCH-S252-2, AC-S252-2, AC-S252-5 and L60 to L62: the defect ledger and the staff
// walkthrough matrix are checked data. The committed ledger passes the check, and each way of
// falsifying it fails the check for the stated reason.
import { describe, expect, it } from "vitest";

import {
  checkDefectLedger,
  HUMAN_NOT_RUN,
  readDefectLedger,
  specRows,
} from "@/scripts/lib/one-path-walkthrough/ledger-check.mjs";

type Ledger = ReturnType<typeof readDefectLedger>;
const committed = (): Ledger => JSON.parse(JSON.stringify(readDefectLedger()));
const rowOf = (ledger: Ledger, id: string) =>
  ledger.rows.find((row: { id: string }) => row.id === id)!;
const resultOf = (ledger: Ledger, id: string) => rowOf(ledger, id).result!;

describe("S252 defect ledger", () => {
  it("the committed ledger passes: twenty November 4 rows, two outside rows, seven reported rows", () => {
    const ledger = committed();
    expect(checkDefectLedger(ledger)).toEqual([]);
    const kinds = ledger.rows.map((row: { kind: string }) => row.kind);
    expect(kinds.filter((kind: string) => kind === "november-4")).toHaveLength(20);
    expect(kinds.filter((kind: string) => kind === "outside")).toHaveLength(2);
    expect(kinds.filter((kind: string) => kind === "reported")).toHaveLength(7);
    // The rows are the specification's own, with its owning ids exactly.
    expect(specRows().november4).toHaveLength(20);
    expect(specRows().reported).toHaveLength(7);
  });

  it("AC-S252-2: removing a row fails the check", () => {
    const ledger = committed();
    ledger.rows = ledger.rows.filter((row: { id: string }) => row.id !== "N4-07");
    expect(checkDefectLedger(ledger).join("\n")).toMatch(
      /missing the november-4 row "A finished comparison had to be run again to reach the message"/,
    );
  });

  it("AC-S252-2: pointing a row at an unknown requirement fails the check", () => {
    const ledger = committed();
    rowOf(ledger, "N4-07").owners = ["R-S249-99"];
    const problems = checkDefectLedger(ledger).join("\n");
    expect(problems).toMatch(/R-S249-99 is not a requirement or suite defined/);
    expect(problems).toMatch(/differ from the specification's/);
  });

  it("AC-S252-2: an empty result, or an open result with no reason, fails the check", () => {
    const empty = committed();
    rowOf(empty, "N4-01").result = null;
    expect(checkDefectLedger(empty).join("\n")).toMatch(/N4-01: the result is empty/);
    const silent = committed();
    rowOf(silent, "OUT-1").result = { state: "open", reason: "" };
    expect(checkDefectLedger(silent).join("\n")).toMatch(
      /OUT-1: an open result has no reason/,
    );
    const closed = committed();
    rowOf(closed, "N4-02").result = { state: "closed" };
    expect(checkDefectLedger(closed).join("\n")).toMatch(/neither verified nor open/);
  });

  it("AC-S252-5: a reported row with no check result fails the check", () => {
    const ledger = committed();
    rowOf(ledger, "REP-4").checkResult = "";
    expect(checkDefectLedger(ledger).join("\n")).toMatch(
      /REP-4: a reported item has no check result/,
    );
  });

  it("a verified row must name evidence that exists: a journey step, a builder check or a test", () => {
    const step = committed();
    resultOf(step, "N4-16").evidence = [{ journey: "journey.no-such-step" }];
    expect(checkDefectLedger(step).join("\n")).toMatch(/no step journey\.no-such-step/);
    const builder = committed();
    resultOf(builder, "N4-09").evidence = [
      { phase: "s249-kickoff", check: "L99: a check nobody wrote" },
    ];
    expect(checkDefectLedger(builder).join("\n")).toMatch(/has no check named "L99/);
    const test = committed();
    resultOf(test, "N4-04").evidence = [{ test: "tests/unit/no-such.test.ts" }];
    expect(checkDefectLedger(test).join("\n")).toMatch(/does not exist/);
    const none = committed();
    resultOf(none, "N4-04").evidence = [];
    expect(checkDefectLedger(none).join("\n")).toMatch(/names no journey step or test/);
  });

  it("L60: a verified row whose evidence the journey observed failing fails the check", () => {
    const ledger = committed();
    const journey = {
      runId: "synthetic-run",
      budgets: [{ id: "journey.kickoff-budget", passed: false }],
      checks: [
        { id: "journey.desk-batch", name: "desk", passed: true },
        { id: "journey.open-lease", name: "open", passed: true },
      ],
    };
    const problems = checkDefectLedger(ledger, { journey }).join("\n");
    expect(problems).toMatch(
      /N4-05: run synthetic-run observed journey\.kickoff-budget failing/,
    );
    expect(problems).toMatch(/did not observe journey\.reload-continuity/);
  });

  it("L62: the matrix has a row for each budget and each ledger row, and the human column reads NOT RUN", () => {
    const missing = committed();
    missing.matrix = missing.matrix.filter((row: { row: string }) => row.row !== "REP-7");
    expect(checkDefectLedger(missing).join("\n")).toMatch(/no row for REP-7/);
    const budget = committed();
    budget.matrix = budget.matrix.filter(
      (row: { row: string }) => row.row !== "journey.owner-decision",
    );
    expect(checkDefectLedger(budget).join("\n")).toMatch(
      /no row for journey\.owner-decision/,
    );
    const invented = committed();
    invented.matrix[0].human = "pass: staff found the batch at once";
    expect(checkDefectLedger(invented).join("\n")).toMatch(
      /has a human result while no staff session is recorded/,
    );
    const verdict = committed();
    verdict.humanVerdict = "Human verdict: PASS";
    expect(checkDefectLedger(verdict).join("\n")).toMatch(/human verdict is not NOT RUN/);
    expect(committed().humanVerdict).toBe(HUMAN_NOT_RUN);
  });

  it("R-S252-9 and R-S252-10: the first full case and the approval handoff are never recorded as done without their inputs", () => {
    const fullCase = committed();
    fullCase.firstFullCase = { state: "PASS" };
    expect(checkDefectLedger(fullCase).join("\n")).toMatch(
      /first full case is recorded as run/,
    );
    const approval = committed();
    approval.approvalHandoff = { state: "approved by Dan" };
    expect(checkDefectLedger(approval).join("\n")).toMatch(
      /approval handoff is recorded/,
    );
  });
});
