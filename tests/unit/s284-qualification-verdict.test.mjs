import { format } from "prettier";
import { describe, expect, it } from "vitest";
import {
  COMPILED_MAIL_IDENTITY,
  HUMAN_NOT_RUN,
  KNOWN_HARNESS_REFUSAL_HOSTS,
  MATRIX_VERSION,
  N1002_STAFF_PATH_FILES,
  NO,
  S260_REPLAY_ROWS,
  S271_REPLAY_ROWS,
  UNVERIFIED,
  W12_JOURNEYS,
  W12_MATRIX,
  YES,
  compiledMailProblem,
  renderQualificationReport,
  scoreQualification,
  scoreW12Matrix,
} from "../browser/one-path-november-12-qualification-verdict.mjs";

const source = "c".repeat(40);
const otherSource = "d".repeat(40);
const baselineSource = "7f4cf234c18c0b80a0ed88bc08d70e174ae9c311";
const buildId = "exact-build-0001";
const otherBuild = "other-build-0002";
const runId = "20261113T120000Z-cccccccc";
// The compiled synthetic mail's identity as rehearsal.json and the compiled log entry record it.
const mail = Object.fromEntries(
  COMPILED_MAIL_IDENTITY.map((key, index) => [key, String(index + 1).repeat(64)]),
);

const passing = ({ id, checks }) => ({
  id,
  source,
  buildId,
  checks: Object.fromEntries(checks.map((check) => [check, true])),
});
const completeRun = (overrides = {}) => ({
  servedSource: source,
  buildId,
  buildSource: source,
  harnessSource: source,
  overlay: false,
  harnessUncommitted: false,
  compiled: true,
  compiledMail: mail,
  buildCompiledMail: { ...mail },
  runId,
  only: null,
  results: W12_MATRIX.map(passing),
  refusedConnections: [],
  unresolvedEffects: [],
  ...overrides,
});
const withRow = (index, change) => {
  const results = W12_MATRIX.map(passing);
  results[index] = change(results[index]);
  return scoreW12Matrix(completeRun({ results }));
};
const verdicts = (result) =>
  Object.fromEntries(result.journeys.map(({ id, verdict }) => [id, verdict]));
const yesRows = (ids) => ids.map((id) => ({ id, verdict: YES, source, buildId }));
const replays = () => ({
  s260: { source, buildId, journeys: yesRows(S260_REPLAY_ROWS) },
  s271: { source, buildId, journeys: yesRows(S271_REPLAY_ROWS) },
  s252: {
    source,
    buildId,
    checks: [
      { id: "journey.reviews-and-confirmations", passed: true },
      { id: "named.first-screen-check-numbers", passed: false },
    ],
    budgets: [
      { id: "journey.kickoff-budget", passed: true },
      { id: "journey.owner-decision-budget", passed: false },
    ],
  },
});
const pins = [
  { pin: "journey.owner-decision-budget", suite: "S285" },
  { pin: "named.first-screen-check-numbers", suite: "S281" },
];
const cleanStaffPath = {
  source,
  files: [...N1002_STAFF_PATH_FILES, "tests/browser/one-path-november-12-journeys.mjs"],
  violations: [],
  unparsed: [],
};
// The report pads its tables as prettier does; rows are compared without that padding.
const flat = (report) => report.replace(/ {2,}/g, " ");

describe("ARCH-S284-1 the W12 matrix", () => {
  it("carries S284's fourteen journeys with their owning suites and acceptance check ids", () => {
    expect(MATRIX_VERSION).toBe("S284-2026-11-12.1");
    expect(
      W12_MATRIX.map(({ id, title, suite, intake, checks }) => [
        id,
        title,
        suite,
        intake,
        `${checks[0]} to ${checks.at(-1)}`,
        checks.length,
      ]),
    ).toEqual([
      [
        "W12-01",
        "Only the current offer goes out",
        "S272",
        150,
        "AC-S272-1 to AC-S272-6",
        6,
      ],
      ["W12-02", "See the held message", "S273", 151, "AC-S273-1 to AC-S273-6", 6],
      [
        "W12-03",
        "Send through a lease re-read",
        "S274",
        152,
        "AC-S274-1 to AC-S274-6",
        6,
      ],
      [
        "W12-04",
        "The reply reaches the decision",
        "S275",
        153,
        "AC-S275-1 to AC-S275-6",
        6,
      ],
      ["W12-05", "Record the tenant's answer", "S276", 154, "AC-S276-1 to AC-S276-7", 7],
      ["W12-06", "Know which rent this is", "S277", 155, "AC-S277-1 to AC-S277-6", 6],
      ["W12-07", "Finish the source updates", "S278", 156, "AC-S278-1 to AC-S278-6", 6],
      ["W12-08", "One status for everyone", "S279", 157, "AC-S279-1 to AC-S279-6", 6],
      ["W12-09", "What needs me", "S280", 158, "AC-S280-1 to AC-S280-7", 7],
      [
        "W12-10",
        "See what I need, where I landed",
        "S281",
        159,
        "AC-S281-1 to AC-S281-10",
        10,
      ],
      ["W12-11", "Clear an off-cycle hold", "S282", 160, "AC-S282-1 to AC-S282-5", 5],
      ["W12-12", "Plain, accurate screens", "S283", 161, "AC-S283-1 to AC-S283-8", 8],
      ["W12-13", "Ask once, record once", "S285", 163, "AC-S285-1 to AC-S285-5", 5],
      ["W12-14", "One place to work a renewal", "S286", 164, "AC-S286-1 to AC-S286-6", 6],
    ]);
    expect(W12_MATRIX.flatMap(({ checks }) => checks)).toHaveLength(90);
    expect(W12_MATRIX.map(({ suite }) => suite)).not.toContain("S284");
  });
});

describe("AC-S284-3 one exact build, scored complete only when it is", () => {
  it("records fourteen Yes verdicts with their check ids for a complete passing run", () => {
    const result = scoreW12Matrix(completeRun());
    expect(result).toMatchObject({
      version: MATRIX_VERSION,
      status: "complete",
      verdict: YES,
      bound: true,
      admissible: true,
      refusals: [],
      gaps: [],
      only: null,
    });
    expect(
      result.journeys.map(({ id, verdict, passed }) => [id, verdict, passed]),
    ).toEqual(W12_MATRIX.map(({ id, checks }) => [id, YES, [...checks]]));
    expect(result.counts).toEqual({
      journeys: 14,
      ran: 14,
      yes: 14,
      no: 0,
      unverified: 0,
      checks: 90,
      checksPassed: 90,
      unexpectedRefusals: 0,
      knownRefusals: 0,
      unresolvedEffects: 0,
    });
    expect(result.identities).toEqual({
      servedSource: source,
      buildId,
      buildSource: source,
      compiledMail: mail.adapter,
      runId,
    });
  });

  it("accepts checks recorded as a list of { id, passed }", () => {
    const results = W12_MATRIX.map(({ id, checks }) => ({
      id,
      checks: checks.map((check) => ({ id: check, passed: true })),
    }));
    expect(scoreW12Matrix(completeRun({ results })).verdict).toBe(YES);
  });

  it("scores a run limited with --only as incomplete, and the journeys outside it UNVERIFIED", () => {
    const only = ["W12-01", "W12-04"];
    const result = scoreW12Matrix(
      completeRun({
        only,
        results: W12_MATRIX.filter(({ id }) => only.includes(id)).map(passing),
      }),
    );
    expect(result).toMatchObject({ status: "incomplete", verdict: UNVERIFIED, only });
    expect(verdicts(result)).toEqual(
      Object.fromEntries(
        W12_JOURNEYS.map((id) => [id, only.includes(id) ? YES : UNVERIFIED]),
      ),
    );
    expect(result.journeys[1]).toMatchObject({ ran: false, outsideOnly: true });
    // A --only run is never the complete matrix, even when it names and passes all fourteen.
    const everything = scoreW12Matrix(completeRun({ only: W12_JOURNEYS.join(",") }));
    expect(everything).toMatchObject({
      status: "incomplete",
      verdict: UNVERIFIED,
      counts: { yes: 14 },
    });
  });

  it("refuses a build made from another source than the served one", () => {
    const refused = scoreW12Matrix(completeRun({ buildSource: otherSource }));
    expect(refused).toMatchObject({
      status: "refused",
      verdict: NO,
      bound: false,
      refusals: [{ code: "build-source" }],
      counts: { checksPassed: 0 },
    });
    // Nothing a refused run recorded counts for this build, so no journey reads Yes.
    expect(new Set(Object.values(verdicts(refused)))).toEqual(new Set([UNVERIFIED]));
  });

  it.each([
    [{ buildId: null }, "build-id"],
    [{ buildId: "x" }, "build-id"],
    [{ servedSource: "7f4cf234" }, "served-source"],
    [{ harnessSource: otherSource }, "harness-source"],
    [{ overlay: true }, "overlay"],
    [{ harnessUncommitted: true }, "harness-uncommitted"],
  ])("refuses a run whose binding is not exact (%o)", (overrides, code) => {
    const result = scoreW12Matrix(completeRun(overrides));
    expect(result).toMatchObject({ status: "refused", verdict: NO, bound: false });
    expect(result.refusals.map((reason) => reason.code)).toContain(code);
  });

  it("refuses a journey row bound to another build, recorded twice or outside the matrix", () => {
    const mixed = withRow(6, (row) => ({ ...row, buildId: otherBuild }));
    expect(mixed).toMatchObject({
      status: "refused",
      verdict: NO,
      refusals: [{ code: "mixed-build", journeys: ["W12-07"] }],
    });
    const twice = scoreW12Matrix(
      completeRun({ results: [...W12_MATRIX.map(passing), passing(W12_MATRIX[0])] }),
    );
    expect(twice.refusals).toEqual([{ code: "duplicate", journeys: ["W12-01"] }]);
    const outside = scoreW12Matrix(
      completeRun({
        results: [...W12_MATRIX.map(passing), { id: "N10-02", checks: {} }],
      }),
    );
    expect(outside.refusals).toEqual([{ code: "outside-matrix", count: 1 }]);
    expect(scoreW12Matrix(null)).toMatchObject({ status: "refused", verdict: NO });
  });

  it("reads a journey that did not run as UNVERIFIED, never Yes", () => {
    const result = scoreW12Matrix(
      completeRun({
        results: W12_MATRIX.filter(({ id }) => id !== "W12-07").map(passing),
      }),
    );
    expect(result).toMatchObject({
      status: "incomplete",
      verdict: UNVERIFIED,
      gaps: [{ code: "not-run", journeys: ["W12-07"] }],
      counts: { ran: 13, yes: 13, unverified: 1 },
    });
    expect(result.journeys[6]).toMatchObject({
      ran: false,
      outsideOnly: false,
      verdict: UNVERIFIED,
      passed: [],
      notRecorded: [...W12_MATRIX[6].checks],
    });
    expect(scoreW12Matrix(completeRun({ results: [] }))).toMatchObject({
      status: "incomplete",
      verdict: UNVERIFIED,
      counts: { yes: 0, unverified: 14 },
    });
  });

  it("never reads a failed, unrecorded or mislabeled check as Yes", () => {
    const failed = withRow(2, (row) => ({
      ...row,
      checks: { ...row.checks, "AC-S274-4": false },
    }));
    expect(failed.verdict).toBe(NO);
    expect(failed.journeys[2]).toMatchObject({ verdict: NO, failed: ["AC-S274-4"] });
    const missing = withRow(9, (row) => {
      const checks = { ...row.checks };
      delete checks["AC-S281-10"];
      return { ...row, checks };
    });
    expect(missing.verdict).toBe(UNVERIFIED);
    expect(missing.journeys[9]).toMatchObject({
      verdict: UNVERIFIED,
      notRecorded: ["AC-S281-10"],
    });
    // Only true is a pass.
    const truthy = withRow(0, (row) => ({
      ...row,
      checks: { ...row.checks, "AC-S272-1": "true", "AC-S272-2": 1 },
    }));
    expect(truthy.journeys[0]).toMatchObject({
      verdict: UNVERIFIED,
      notRecorded: ["AC-S272-1", "AC-S272-2"],
    });
    // Another suite's check id on a journey is a mislabeled record, not a pass.
    const mislabeled = withRow(1, (row) => ({
      ...row,
      checks: { ...row.checks, "AC-S272-1": true },
    }));
    expect(mislabeled.journeys[1]).toMatchObject({ verdict: NO, extraChecks: 1 });
    // A journey that stopped, or that its driver recorded No or UNVERIFIED, is never raised.
    expect(
      withRow(4, (row) => ({ ...row, error: "Timeout 20000ms" })).journeys[4],
    ).toMatchObject({ verdict: NO, stopped: true });
    expect(withRow(5, (row) => ({ ...row, verdict: NO })).journeys[5].verdict).toBe(NO);
    expect(
      withRow(5, (row) => ({ ...row, verdict: UNVERIFIED })).journeys[5].verdict,
    ).toBe(UNVERIFIED);
  });
});

describe("R-S284-3 one compiled build with the synthetic mail", () => {
  const withoutDraftStandIn = Object.fromEntries(
    Object.entries(mail).filter(([key]) => key !== "draftStandIn"),
  );

  it("binds the run to the compiled synthetic mail the build was compiled with", () => {
    expect(
      compiledMailProblem({
        compiled: true,
        compiledMail: mail,
        buildCompiledMail: { ...mail },
      }),
    ).toBeNull();
    expect(compiledMailProblem()).toBe("compiled");
    expect(COMPILED_MAIL_IDENTITY).toEqual([
      "adapter",
      "worker",
      "sourcePreview",
      "draftStandIn",
      "nextConfig",
      "isolatedNextConfig",
    ]);
  });

  it.each([
    [{ compiled: false }, "compiled"],
    [{ compiledMail: null }, "synthetic-mail"],
    [
      {
        compiledMail: { ...mail, adapter: "not-a-digest" },
        buildCompiledMail: { ...mail, adapter: "not-a-digest" },
      },
      "synthetic-mail",
    ],
    [
      { compiledMail: withoutDraftStandIn, buildCompiledMail: withoutDraftStandIn },
      "synthetic-mail",
    ],
    [{ buildCompiledMail: null }, "synthetic-mail-build"],
    [{ buildCompiledMail: { ...mail, worker: "f".repeat(64) } }, "synthetic-mail-build"],
  ])(
    "refuses a run that did not use the compiled synthetic mail build (%o)",
    (overrides, code) => {
      const result = scoreW12Matrix(completeRun(overrides));
      expect(result).toMatchObject({
        status: "refused",
        verdict: NO,
        bound: false,
        admissible: false,
        refusals: [{ code }],
        counts: { checksPassed: 0 },
      });
      expect(result.identities.compiledMail).toBeNull();
      expect(new Set(Object.values(verdicts(result)))).toEqual(new Set([UNVERIFIED]));
    },
  );

  it("never admits a development run or a run limited with --only", () => {
    const development = scoreW12Matrix(
      completeRun({
        buildId: null,
        buildSource: null,
        overlay: true,
        compiled: false,
        compiledMail: null,
        buildCompiledMail: null,
        runId: "20261113T120000Z-cccccccc-overlay",
        only: ["W12-03"],
        // A development server has no build id, so its rows record none.
        results: [{ ...passing(W12_MATRIX[2]), buildId: null }],
      }),
    );
    expect(development).toMatchObject({
      status: "refused",
      verdict: NO,
      bound: false,
      admissible: false,
    });
    expect(development.refusals.map(({ code }) => code)).toEqual([
      "build-id",
      "build-source",
      "overlay",
      "compiled",
    ]);
    expect(
      scoreW12Matrix(
        completeRun({ only: ["W12-03"], results: [passing(W12_MATRIX[2])] }),
      ),
    ).toMatchObject({ status: "incomplete", verdict: UNVERIFIED, admissible: false });
    expect(scoreW12Matrix(completeRun())).toMatchObject({
      status: "complete",
      admissible: true,
    });
  });

  it("states the compiled synthetic mail in the report", () => {
    const report = renderQualificationReport(scoreQualification({ run: completeRun() }));
    expect(report).toContain(`- Compiled synthetic mail adapter: \`${mail.adapter}\``);
    const refused = renderQualificationReport(
      scoreQualification({ run: completeRun({ compiledMail: null }) }),
    );
    expect(refused).toContain("- Compiled synthetic mail adapter: not recorded");
    expect(refused).toContain(
      "The run is refused: the run did not use the compiled synthetic mail. Nothing it recorded counts for this build.",
    );
    expect(
      renderQualificationReport(
        scoreQualification({ run: completeRun({ buildCompiledMail: null }) }),
      ),
    ).toContain(
      "The run is refused: the compiled synthetic mail is not the one compiled into the build.",
    );
  });
});

describe("BEH-S284-2 refused connections and unresolved effects", () => {
  it("reads No for a journey with a refused connection outside the harness's known ones", () => {
    const result = scoreW12Matrix(
      completeRun({
        refusedConnections: [
          {
            from: "server",
            refused: "fetch",
            host: "gmail.googleapis.com",
            journey: "W12-04",
          },
        ],
      }),
    );
    expect(result.verdict).toBe(NO);
    expect(result.journeys[3]).toMatchObject({ verdict: NO, refusedConnections: 1 });
    expect(result.counts).toMatchObject({ yes: 13, no: 1, unexpectedRefusals: 1 });
  });

  it("reads No for a journey with an unresolved effect", () => {
    const result = scoreW12Matrix(
      completeRun({ unresolvedEffects: [{ journey: "W12-01", kind: "send" }] }),
    );
    expect(result.verdict).toBe(NO);
    expect(result.journeys[0]).toMatchObject({ verdict: NO, unresolvedEffects: 1 });
  });

  it("leaves every journey unproven and the batch No when no journey owns one", () => {
    for (const run of [
      completeRun({
        refusedConnections: [{ refused: "rentvine_write", path: "/leases" }],
      }),
      completeRun({ unresolvedEffects: [{ kind: "send" }] }),
    ]) {
      const result = scoreW12Matrix(run);
      expect(result.verdict).toBe(NO);
      expect(new Set(Object.values(verdicts(result)))).toEqual(new Set([UNVERIFIED]));
    }
  });

  it("counts the harness's known refusals without holding the run", () => {
    const result = scoreW12Matrix(
      completeRun({
        refusedConnections: KNOWN_HARNESS_REFUSAL_HOSTS.map((host) => ({
          from: "server",
          refused: "fetch",
          host,
        })),
      }),
    );
    expect(result.verdict).toBe(YES);
    expect(result.counts).toMatchObject({ knownRefusals: 1, unexpectedRefusals: 0 });
  });
});

describe("AC-S284-1 the fail-first baseline", () => {
  it("flags a sequence that did not fail on the baseline and refuses a baseline on the build", () => {
    const scored = scoreQualification({
      run: completeRun(),
      baseline: {
        source: baselineSource,
        rows: [
          { id: "W12-03", reproduced: false },
          { id: "W12-01", reproduced: true },
        ],
      },
    });
    expect(scored.baseline).toEqual({
      status: "recorded",
      source: baselineSource,
      reproduced: 1,
      flagged: 1,
    });
    expect(scored.matrix.journeys.slice(0, 3).map(({ failFirst }) => failFirst)).toEqual([
      "reproduced",
      "not recorded",
      "did not reproduce",
    ]);
    expect(
      scoreQualification({ run: completeRun(), baseline: { source, rows: [] } }).baseline,
    ).toMatchObject({ status: "refused", reason: "same-source" });
    expect(scoreQualification({ run: completeRun() }).baseline.status).toBe("NOT RUN");
  });
});

describe("R-S284-6 cumulative qualification", () => {
  const baseline = {
    source: baselineSource,
    rows: W12_JOURNEYS.map((id) => ({ id, reproduced: id !== "W12-12" })),
  };
  const input = {
    run: completeRun(),
    baseline,
    staffPath: cleanStaffPath,
    replays: replays(),
    changedPins: pins,
  };

  it("requires the full baseline and all three preservation replays", () => {
    expect(scoreQualification(input).qualified).toBe(true);
    expect(scoreQualification({ ...input, baseline: null }).qualified).toBe(false);
    expect(
      scoreQualification({
        ...input,
        baseline: { ...baseline, rows: baseline.rows.slice(1) },
      }).qualified,
    ).toBe(false);
    expect(scoreQualification({ ...input, replays: {} }).qualified).toBe(false);
    expect(
      scoreQualification({
        ...input,
        replays: { s260: input.replays.s260, s271: input.replays.s271 },
      }).qualified,
    ).toBe(false);
  });
});

describe("AC-S284-4 preservation replays on the same build", () => {
  it("scores the S260, S271 and scoped S252 replays bound to the matrix's build", () => {
    const scored = scoreQualification({
      run: completeRun(),
      staffPath: cleanStaffPath,
      replays: replays(),
      changedPins: pins,
    });
    expect(scored.preservation.s260).toMatchObject({
      status: "scored",
      verdict: YES,
      buildId,
    });
    expect(scored.preservation.s260.rows).toHaveLength(12);
    expect(scored.preservation.s271).toMatchObject({
      status: "scored",
      verdict: YES,
      buildId,
    });
    expect(scored.preservation.s271.rows.map(({ id }) => id)).not.toContain("N10-06");
    expect(scored.preservation.s271.rows[1]).toEqual({
      id: "N10-02",
      ran: true,
      verdict: YES,
      staffPath: "staff path",
    });
    expect(scored.preservation.s252).toMatchObject({
      status: "scored",
      verdict: YES,
      checks: { passed: 1, total: 2 },
      budgets: { within: 1, total: 2 },
      scoped: [
        { id: "named.first-screen-check-numbers", suite: "S281" },
        { id: "journey.owner-decision-budget", suite: "S285" },
      ],
      unscoped: [],
    });
    const report = flat(renderQualificationReport(scored));
    expect(report).toContain(
      `| S260 ten journeys and three Help roles | \`${buildId}\` | 12 of 12 rows Yes | Yes |`,
    );
    expect(report).toContain("9 of 9 rows Yes; N10-02 on the staff path | Yes |");
    expect(report).toContain(
      "1 of 2 checks passed; 1 of 2 budgets within bounds; 2 scoped by changed pins | Yes |",
    );
    expect(report).toContain("| `journey.owner-decision-budget` | S285 |");
    expect(report).toContain("| `named.first-screen-check-numbers` | S281 |");
  });

  it("refuses replays bound to a different build id", () => {
    const moved = replays();
    for (const replay of Object.values(moved)) replay.buildId = otherBuild;
    const scored = scoreQualification({
      run: completeRun(),
      staffPath: cleanStaffPath,
      replays: moved,
      changedPins: pins,
    });
    for (const key of ["s260", "s271", "s252"])
      expect(scored.preservation[key]).toMatchObject({
        status: "refused",
        verdict: NO,
        reasons: ["build"],
      });
    expect(renderQualificationReport(scored)).toContain(
      "refused: bound to another build than the W12 matrix",
    );
    // A row from another build inside a replay, another source, or a matrix with no exact build.
    const row = replays();
    row.s260.journeys[0] = { ...row.s260.journeys[0], buildId: otherBuild };
    expect(
      scoreQualification({ run: completeRun(), replays: row }).preservation.s260,
    ).toMatchObject({ status: "refused", reasons: ["build"] });
    const elsewhere = replays();
    elsewhere.s271.source = otherSource;
    expect(
      scoreQualification({ run: completeRun(), replays: elsewhere }).preservation.s271
        .reasons,
    ).toEqual(["source"]);
    const unbound = scoreQualification({
      run: completeRun({ buildSource: otherSource }),
      replays: replays(),
    });
    expect(unbound.preservation.s260).toMatchObject({
      status: "refused",
      reasons: ["unbound-matrix"],
    });
    // A replay that did not run reads NOT RUN, never Yes.
    expect(scoreQualification({ run: completeRun() }).preservation.s260).toMatchObject({
      status: "NOT RUN",
      verdict: UNVERIFIED,
    });
  });

  it("holds N10-02 to the staff path", () => {
    const n1002 = (staffPath) =>
      scoreQualification({
        run: completeRun(),
        staffPath,
        replays: replays(),
        changedPins: pins,
      }).preservation.s271;
    // The starting tree: the seed and N10-02 post the sequences route's refresh directly.
    const starting = n1002({
      ...cleanStaffPath,
      violations: [
        { file: N1002_STAFF_PATH_FILES[0], line: 271, action: "refresh" },
        { file: N1002_STAFF_PATH_FILES[1], line: 585, action: "refresh" },
      ],
    });
    expect(starting.verdict).toBe(NO);
    expect(starting.rows[1]).toMatchObject({ verdict: NO, staffPath: "direct calls" });
    // No staff-path result, or one that did not scan both files, cannot show it.
    expect(n1002(null)).toMatchObject({ verdict: UNVERIFIED });
    expect(n1002(null).rows[1].staffPath).toBe("not shown");
    expect(
      n1002({ ...cleanStaffPath, files: [N1002_STAFF_PATH_FILES[1]] }).rows[1],
    ).toMatchObject({ verdict: UNVERIFIED, staffPath: "not shown" });
    // A direct call in a W12 file fails the staff-path gate, not N10-02.
    const w12 = scoreQualification({
      run: completeRun(),
      staffPath: {
        ...cleanStaffPath,
        violations: [
          {
            file: "tests/browser/one-path-november-12-journeys.mjs",
            line: 14,
            action: "send",
          },
        ],
      },
      replays: replays(),
    });
    expect(w12.staffPath).toMatchObject({
      status: "fail",
      byAction: { send: 1, refresh: 0 },
    });
    expect(w12.preservation.s271.verdict).toBe(YES);
    // A file the check could not parse cannot be shown clean.
    const unparsed = scoreQualification({
      run: completeRun(),
      staffPath: { ...cleanStaffPath, unparsed: [{ file: N1002_STAFF_PATH_FILES[0] }] },
      replays: replays(),
    });
    expect(unparsed.staffPath).toMatchObject({
      status: "fail",
      unparsed: 1,
      n1002: "not shown",
    });
    expect(unparsed.preservation.s271.rows[1].verdict).toBe(UNVERIFIED);
    // A scan of another tree is not bound to this build.
    expect(
      scoreQualification({
        run: completeRun(),
        staffPath: { ...cleanStaffPath, source: otherSource },
      }).staffPath.status,
    ).toBe("refused");
  });

  it("never raises a replay its own verdict module read No or UNVERIFIED", () => {
    const declared = replays();
    declared.s260.verdict = NO;
    declared.s271.verdict = UNVERIFIED;
    const scored = scoreQualification({
      run: completeRun(),
      staffPath: cleanStaffPath,
      replays: declared,
      changedPins: pins,
    });
    expect(scored.preservation.s260).toMatchObject({
      status: "scored",
      verdict: NO,
      reasons: ["module-no"],
    });
    expect(scored.preservation.s271).toMatchObject({
      status: "scored",
      verdict: UNVERIFIED,
      reasons: ["module-unverified"],
    });
    const report = flat(renderQualificationReport(scored));
    expect(report).toContain("12 of 12 rows Yes; its own verdict module read No | No |");
    expect(report).toContain(
      "9 of 9 rows Yes; N10-02 on the staff path; its own verdict module read UNVERIFIED | UNVERIFIED |",
    );
    // A module Yes leaves the rows to decide: a row that reads No still fails the replay.
    const rowNo = replays();
    rowNo.s271.verdict = YES;
    rowNo.s271.journeys[0] = { ...rowNo.s271.journeys[0], verdict: NO };
    expect(
      scoreQualification({
        run: completeRun(),
        staffPath: cleanStaffPath,
        replays: rowNo,
      }).preservation.s271,
    ).toMatchObject({ verdict: NO, reasons: [] });
  });

  it("passes an S252 result outside its bound only as a changed pin with its suite", () => {
    const unscoped = scoreQualification({
      run: completeRun(),
      replays: replays(),
      changedPins: [pins[0]],
    }).preservation.s252;
    expect(unscoped).toMatchObject({
      verdict: NO,
      unscoped: ["named.first-screen-check-numbers"],
      reasons: ["unscoped"],
    });
    // A pin that names no suite is not recorded and scopes nothing.
    const unnamed = scoreQualification({
      run: completeRun(),
      replays: replays(),
      changedPins: [pins[0], { pin: "named.first-screen-check-numbers" }],
    });
    expect(unnamed.preservation).toMatchObject({
      unrecordedPins: 1,
      s252: { verdict: NO },
    });
  });
});

describe("AC-S284-5 the report", () => {
  it("states the identities and fourteen verdicts with their acceptance check ids", () => {
    const report = flat(
      renderQualificationReport(
        scoreQualification({
          run: completeRun(),
          baseline: {
            source: baselineSource,
            rows: W12_JOURNEYS.map((id) => ({ id, reproduced: id !== "W12-03" })),
          },
          staffPath: cleanStaffPath,
          replays: replays(),
          changedPins: pins,
        }),
      ),
    );
    expect(report).toContain(`- Served source: \`${source}\``);
    expect(report).toContain(`- Compiled build: \`${buildId}\`, made from \`${source}\``);
    expect(report).toContain(`- Compiled synthetic mail adapter: \`${mail.adapter}\``);
    expect(report).toContain(`- Private run: \`${runId}\``);
    expect(report).toContain("Engineering verdict: **Yes** on the W12 matrix.");
    expect(report).toContain("Acceptance checks passed: 90 of 90.");
    expect(report).toContain(
      "| W12-10 | See what I need, where I landed | S281, intake 159 | AC-S281-1 to AC-S281-10 | 10 of 10 | reproduced | Yes |",
    );
    for (const { id, title, suite, checks } of W12_MATRIX) {
      expect(report).toContain(`| ${id} | ${title} | ${suite}, intake `);
      expect(report).toContain(
        `| ${checks[0]} to ${checks.at(-1)} | ${checks.length} of `,
      );
    }
    // AC-S284-1: a sequence that passed on the baseline is flagged, not dropped.
    expect(report).toContain(
      "| W12-03 | Send through a lease re-read | S274, intake 152 | AC-S274-1 to AC-S274-6 | 6 of 6 | did not reproduce | Yes |",
    );
    expect(report).toContain(
      `Fail-first baseline on \`${baselineSource}\`: 13 of 14 sequences failed as the audit recorded them; 1 did not reproduce (flagged).`,
    );
    expect(report).toContain(
      `Static staff-path check: **pass** on \`${source}\`: 3 file(s) scanned, no direct refresh, resume, send or schedule call of the sequences route.`,
    );
  });

  it("states a refused, an incomplete and a failing run with the checks that decide them", () => {
    const refused = renderQualificationReport(
      scoreQualification({ run: completeRun({ buildSource: otherSource }) }),
    );
    expect(refused).toContain(
      "The run is refused: the build was made from a different source than the served source. Nothing it recorded counts for this build.",
    );
    const incomplete = renderQualificationReport(
      scoreQualification({
        run: completeRun({ only: ["W12-01"], results: [passing(W12_MATRIX[0])] }),
      }),
    );
    expect(incomplete).toContain(
      `The run is incomplete: the run was limited with --only to W12-01; ${W12_JOURNEYS.slice(1).join(", ")} did not run.`,
    );
    expect(flat(incomplete)).toContain("| UNVERIFIED: outside the --only subset |");
    const results = W12_MATRIX.map(passing);
    results[2] = { ...results[2], checks: { ...results[2].checks, "AC-S274-4": false } };
    const failing = renderQualificationReport(
      scoreQualification({ run: completeRun({ results }) }),
    );
    expect(failing).toContain("Engineering verdict: **No** on the W12 matrix.");
    expect(flat(failing)).toContain("| 5 of 6 | not recorded | No: AC-S274-4 failed |");
  });

  it("is already in prettier's markdown form, so a committed report is the generated one", async () => {
    const baseline = {
      source: baselineSource,
      rows: W12_JOURNEYS.map((id) => ({ id, reproduced: id !== "W12-03" })),
    };
    const variants = [
      // Complete and passing, with every field NOT RUN apart from the matrix.
      { run: completeRun() },
      // Incomplete, with a failing staff path, a file it could not parse and a refused replay.
      {
        run: completeRun({
          results: W12_MATRIX.map(passing).filter(({ id }) => id !== "W12-14"),
        }),
        baseline,
        staffPath: {
          ...cleanStaffPath,
          violations: [{ file: N1002_STAFF_PATH_FILES[0], line: 271, action: "refresh" }],
          unparsed: [{ file: "tests/browser/one-path-november-12-journeys.mjs" }],
        },
        replays: { ...replays(), s252: { ...replays().s252, buildId: otherBuild } },
        changedPins: [...pins, { pin: "named.unattributed" }],
      },
      // Refused, with production reads and a human verdict under authorizing references.
      {
        run: completeRun({ buildSource: otherSource }),
        baseline: { source, rows: [] },
        staffPath: { ...cleanStaffPath, source: otherSource },
        production: {
          ownerSequenceReplies: { reference: "owner-launch-2026-11-20", withReply: 4 },
          sequenceConflicts: { reference: "owner-launch-2026-11-20", count: 12 },
        },
        human: { reference: "staff-session-2026-11-14", verdict: YES, buildId },
      },
      // Complete, with every replay passing, and a human verdict on the build.
      {
        run: completeRun(),
        baseline,
        staffPath: cleanStaffPath,
        replays: replays(),
        changedPins: pins,
        human: { reference: "staff-session-2026-11-14", verdict: NO, buildId },
      },
    ];
    for (const variant of variants) {
      const report = renderQualificationReport(scoreQualification(variant));
      expect(await format(report, { parser: "markdown", printWidth: 90 })).toBe(report);
    }
  });

  const leaked = [
    "1875",
    "$1,875.00",
    "101 Sample Pl",
    "owner.one@example.com",
    "Synthetic owner reply",
  ];

  it("holds no lease value, address, recipient or message text when observations carry them", () => {
    const observed = {
      rent: "$1,875.00",
      amount: 1875,
      address: "101 Sample Pl",
      recipient: "owner.one@example.com",
      message: "Synthetic owner reply: approved at a base rent of 1875 per month.",
    };
    const results = W12_MATRIX.map(passing).map((row) => ({
      ...row,
      observed,
      note: observed.message,
    }));
    results[3] = {
      ...results[3],
      checks: { ...results[3].checks, "AC-S275-2": observed.message },
      error: "Expected owner.one@example.com at 101 Sample Pl to read $1,875.00",
    };
    const scored = scoreQualification({
      run: completeRun({
        results,
        runId: "101 Sample Pl",
        refusedConnections: [
          {
            host: "gmail.googleapis.com",
            path: "/gmail/v1/users/owner.one@example.com/messages",
            journey: "W12-04",
          },
        ],
        unresolvedEffects: [
          { journey: "W12-01", detail: "Offer to 101 Sample Pl at $1,875.00" },
        ],
      }),
      baseline: {
        source: baselineSource,
        rows: W12_JOURNEYS.map((id) => ({ id, reproduced: true, observed })),
      },
      staffPath: {
        source,
        files: ["owner.one@example.com", ...N1002_STAFF_PATH_FILES],
        violations: [{ file: "101 Sample Pl", line: 12, action: observed.message }],
      },
      replays: {
        s252: {
          source,
          buildId,
          checks: [{ id: "101 Sample Pl", passed: false }],
          budgets: [],
        },
      },
      changedPins: [
        { pin: observed.message, suite: "S281" },
        { pin: "owner.one@example.com", suite: "S285" },
      ],
      production: {
        ownerSequenceReplies: { reference: "owner.one@example.com", withReply: 3 },
        sequenceConflicts: { reference: observed.message, count: 7 },
      },
      human: { reference: "101 Sample Pl", verdict: YES, buildId },
    });
    const report = renderQualificationReport(scored);
    const output = JSON.stringify(scored);
    for (const text of leaked) {
      expect(report).not.toContain(text);
      expect(output).not.toContain(text);
    }
    // The run still scores from what it recorded.
    expect(scored.matrix.journeys[3]).toMatchObject({
      verdict: NO,
      stopped: true,
      refusedConnections: 1,
    });
    expect(report.split("\n")).toContain(HUMAN_NOT_RUN);
  });

  it("renders nothing but checked values from a hand-built output", () => {
    const tampered = structuredClone(scoreQualification({ run: completeRun() }));
    tampered.matrix.identities.servedSource = "101 Sample Pl";
    tampered.matrix.identities.runId = "owner.one@example.com";
    tampered.matrix.verdict = "Synthetic owner reply: approved";
    tampered.matrix.counts.yes = "$1,875.00";
    tampered.matrix.refusals = [{ code: "101 Sample Pl" }];
    tampered.matrix.journeys[0] = {
      ...tampered.matrix.journeys[0],
      verdict: "No: owner.one@example.com",
      failed: ["$1,875.00"],
      failFirst: "Synthetic owner reply",
    };
    tampered.staffPath = {
      status: "fail",
      source,
      files: 2,
      violations: [{ file: "101 Sample Pl", line: "1875", action: "send" }],
      byAction: { send: 1 },
    };
    tampered.preservation.changedPins = [{ pin: "101 Sample Pl", suite: "S281" }];
    tampered.production.ownerSequenceReplies = {
      status: "run",
      reference: "owner.one@example.com",
      counts: { withReply: 1 },
    };
    tampered.human = {
      status: "run",
      reference: "Synthetic owner reply",
      verdict: YES,
      buildId,
    };
    const report = renderQualificationReport(tampered);
    for (const text of leaked) expect(report).not.toContain(text);
    expect(report).toContain("- Served source: not recorded");
    expect(report).toContain("Engineering verdict: **UNVERIFIED** on the W12 matrix.");
    expect(report.split("\n")).toContain(HUMAN_NOT_RUN);
  });

  it("reads production and human fields NOT RUN unless an authorizing reference is supplied", () => {
    const plain = renderQualificationReport(scoreQualification({ run: completeRun() }));
    expect(plain.split("\n")).toContain(HUMAN_NOT_RUN);
    expect(HUMAN_NOT_RUN).toBe("Human verdict: NOT RUN — no human observer");
    expect(plain).toContain(
      "- Completed owner sequences with and without a recorded inbound reply (finding A-03): NOT RUN\n",
    );
    expect(plain).toContain(
      "- Responses with status 409 on the sequences route in the last 30 days (finding A-04): NOT RUN\n",
    );
    // Counts or a verdict with no authorizing reference stay NOT RUN and are not shown.
    const unauthorized = scoreQualification({
      run: completeRun(),
      production: {
        ownerSequenceReplies: { withReply: 4, withoutReply: 9 },
        sequenceConflicts: { reference: "owner approved it", count: 12 },
      },
      human: { verdict: YES, buildId },
    });
    expect(unauthorized.production).toEqual({
      ownerSequenceReplies: {
        finding: "A-03",
        status: "NOT RUN",
        reference: null,
        counts: null,
      },
      sequenceConflicts: {
        finding: "A-04",
        status: "NOT RUN",
        reference: null,
        counts: null,
      },
    });
    expect(unauthorized.human.status).toBe("NOT RUN");
    const unauthorizedReport = renderQualificationReport(unauthorized);
    expect(unauthorizedReport).not.toMatch(/\b(?:4|9|12) (?:with|without|responses)\b/);
    expect(unauthorizedReport.split("\n")).toContain(HUMAN_NOT_RUN);
    // With the authorizing reference each field reads run, with that reference.
    const authorized = renderQualificationReport(
      scoreQualification({
        run: completeRun(),
        production: {
          ownerSequenceReplies: {
            reference: "owner-launch-2026-11-20",
            withReply: 4,
            withoutReply: 9,
          },
          sequenceConflicts: { reference: "owner-launch-2026-11-20", count: 12 },
        },
        human: { reference: "staff-session-2026-11-14", verdict: "Partial", buildId },
      }),
    );
    expect(authorized).toContain(
      "(finding A-03): run under `owner-launch-2026-11-20`: 4 with a recorded inbound reply, 9 without\n",
    );
    expect(authorized).toContain(
      "(finding A-04): run under `owner-launch-2026-11-20`: 12 responses\n",
    );
    expect(authorized.split("\n")).toContain(
      `Human verdict: Partial — run under \`staff-session-2026-11-14\` on build \`${buildId}\``,
    );
    // A staff record on another build is not counted.
    const elsewhere = scoreQualification({
      run: completeRun(),
      human: { reference: "staff-session-2026-11-14", verdict: YES, buildId: otherBuild },
    });
    expect(elsewhere.human).toMatchObject({ status: "NOT RUN", problems: ["build"] });
    expect(renderQualificationReport(elsewhere)).toContain(
      "Human verdict: NOT RUN — the record under `staff-session-2026-11-14` is not counted: it is not bound to this build",
    );
  });
});
