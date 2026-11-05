import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  RENEWAL_ONE_PATH_LITMUS,
  litmusBeforeAfterChecks,
  litmusCheckIds,
  litmusCoverageProblems,
  litmusGoalGroups,
  litmusHandoff,
  litmusStartingCommit,
  litmusSuitesUnderTest,
} from "@/lib/help/litmus";

// S254 ARCH-S254-1 / AC-S254-1 / AC-S254-3: the one-path litmus handoff numbers its checks in
// order, its goal group table covers every check exactly once, and every suite from S246 to S253
// is under test in at least one group.

const spec = readFileSync(join(process.cwd(), RENEWAL_ONE_PATH_LITMUS.specPath), "utf8");
const SUITES = ["S246", "S247", "S248", "S249", "S250", "S251", "S252", "S253"];
const id = (n: number) => `L${String(n).padStart(2, "0")}`;
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => id(from + i));

/** The specification with one goal group row rewritten, or removed when the rewrite is null. */
function withGroupRow(
  source: string,
  goal: string,
  rewrite: ((row: string) => string) | null,
) {
  const lines = source.split("\n");
  const index = lines.findIndex((line) => line.trimStart().startsWith(`| ${goal} `));
  expect(index, `no goal group row for ${goal}`).toBeGreaterThan(-1);
  if (rewrite) lines[index] = rewrite(lines[index]);
  else lines.splice(index, 1);
  return lines.join("\n");
}

describe("S254 ARCH-S254-1: the handoff and its goal groups", () => {
  it("names L01 to L71 in order", () => {
    expect(litmusCheckIds(spec)).toEqual(range(1, 71));
  });

  it("reads the goal group table of R-S254-7 in table order", () => {
    expect(
      litmusGoalGroups(spec).map((group) => [group.goal, group.checks, group.suites]),
    ).toEqual([
      ["Targets are simple and accurate", range(1, 11), ["S246"]],
      ["One next step, nothing locked", range(12, 20), ["S247"]],
      [
        "The start is prepared and evidence moves the lease",
        range(21, 45),
        ["S248", "S249"],
      ],
      ["Variants keep one path", range(46, 52), ["S250", "S251"]],
      ["The whole path holds and nothing is lost", range(53, 59), SUITES],
      ["November 4 problems and the manual", range(60, 62), ["S252"]],
      ["Forms follow the client's answers", range(63, 70), ["S253"]],
      ["Cleanup", ["L71"], []],
    ]);
  });

  it("covers every check exactly once and every suite from S246 to S253", () => {
    expect(litmusSuitesUnderTest(spec)).toEqual(SUITES);
    expect(litmusCoverageProblems(spec)).toEqual([]);
    const grouped = litmusGoalGroups(spec).flatMap((group) => group.checks);
    expect([...grouped].sort()).toEqual(litmusCheckIds(spec));
  });

  it("names the starting commit and the two checks that report both commits", () => {
    expect(litmusStartingCommit(spec)).toBe("6491c06f3773e92c0bd811d4360371523e24d643");
    expect(litmusBeforeAfterChecks(spec)).toEqual(["L11", "L24"]);
  });
});

describe("S254 AC-S254-1: the coverage test fails when the handoff and the table drift", () => {
  it("removing a goal group's row leaves its checks outside every group", () => {
    const problems = litmusCoverageProblems(
      withGroupRow(spec, "One next step, nothing locked", null),
    );
    for (const check of range(12, 20))
      expect(problems).toContain(`${check} is in no goal group.`);
  });

  it("removing a goal group's checks from the handoff fails", () => {
    const without = spec
      .split("\n")
      .filter((line) => !/^- L(?:6[3-9]|70) /.test(line))
      .join("\n");
    const problems = litmusCoverageProblems(without);
    expect(problems).toContain("The handoff numbers L71 where L63 belongs.");
    expect(problems).toContain(
      'Goal group "Forms follow the client\'s answers" names L63, which the handoff does not list.',
    );
  });

  it("a check left outside every group fails", () => {
    const added = `${spec.trimEnd()}\n- L72 A new outcome the table does not cover.\n`;
    expect(litmusCheckIds(added)).toHaveLength(72);
    expect(litmusCoverageProblems(added)).toEqual(["L72 is in no goal group."]);
  });

  it("a check placed in two groups fails", () => {
    const overlapping = withGroupRow(spec, "One next step, nothing locked", (row) =>
      row.replace("L12 to L20", "L11 to L20"),
    );
    expect(litmusCoverageProblems(overlapping)).toContain(
      "L11 is in more than one goal group (Targets are simple and accurate; One next step, nothing locked).",
    );
  });

  it("dropping a suite from the table fails", () => {
    // S251 is under test in two groups; it has to leave both before the table loses it.
    const fromVariants = withGroupRow(spec, "Variants keep one path", (row) =>
      row.replace("S250, S251", "S250"),
    );
    expect(litmusCoverageProblems(fromVariants)).toEqual([]);
    const fromBoth = withGroupRow(
      fromVariants,
      "The whole path holds and nothing is lost",
      (row) => row.replace("S246 to S253", "S246 to S250, S252, S253"),
    );
    expect(litmusCoverageProblems(fromBoth)).toEqual([
      "S251 is under test in no goal group.",
    ]);
  });

  it("a group that names no checks fails", () => {
    const empty = withGroupRow(spec, "Cleanup", (row) => row.replace("L71", "none"));
    const problems = litmusCoverageProblems(empty);
    expect(problems).toContain('Goal group "Cleanup" names no checks.');
    expect(problems).toContain("L71 is in no goal group.");
  });

  it("a specification with no table fails", () => {
    expect(litmusCoverageProblems(litmusHandoff(spec))).toContain(
      "The specification has no goal group table.",
    );
  });
});

describe("S254 AC-S254-3: a count met by removing a review or a confirmation is No", () => {
  const check = (checkId: string) =>
    litmusHandoff(spec)
      .split("\n")
      .find((line) => line.startsWith(`- ${checkId} `)) ?? "";

  it("the send budget requires the exact review and the confirmation to be shown", () => {
    expect(check("L23")).toMatch(/at most three deliberate actions/);
    expect(check("L23")).toMatch(/the exact review and the confirmation are both shown/);
  });

  it("every send, schedule, draft and source update keeps its review and confirmation", () => {
    expect(check("L58")).toMatch(
      /showed its exact review and asked for its own confirmation/,
    );
    expect(check("L42")).toMatch(/still asks for its own exact confirmation/);
  });

  it("the handoff forbids removing a review or a confirmation to meet a count", () => {
    expect(litmusHandoff(spec)).toMatch(
      /never weaken a check, remove a review or a confirmation to meet a count/,
    );
  });
});
