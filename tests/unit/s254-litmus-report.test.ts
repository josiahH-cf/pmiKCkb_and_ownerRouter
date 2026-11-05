import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HELP_HUB_LITMUS,
  LITMUS_REPORT_TEMPLATE,
  LITMUS_SPEC_PATH,
  LITMUS_SUITES,
  RENEWAL_ONE_PATH_LITMUS,
  litmusCheckIds,
  litmusDocumentAccepted,
  litmusDocumentTemplate,
  litmusForbiddenClaims,
  litmusGoalGroups,
  litmusReportFilePattern,
  litmusRunRules,
  litmusRunTemplate,
  splitLitmusRuns,
  validateLitmusDocument,
  validateLitmusReport,
  validateLitmusRun,
} from "@/lib/help/litmus";

// S254 ARCH-S254-2 / BEH-S254-1 / BEH-S254-2 / BEH-S254-3 / AC-S254-2: one report template and
// validator serve the help hub litmus (S245) and the one-path renewal litmus (S254).

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const helpSpec = read(HELP_HUB_LITMUS.specPath);
const spec = read(RENEWAL_ONE_PATH_LITMUS.specPath);
const rules = litmusRunRules(spec);
const checks = litmusCheckIds(spec);
const groups = litmusGoalGroups(spec);
const CANDIDATE = "0123456789abcdef0123456789abcdef01234567";
const STARTING = "6491c06f3773e92c0bd811d4360371523e24d643";
const EVIDENCE = "Observed in the rehearsal on the candidate.";
const COUNTS: Record<string, string> = {
  L11: "Starting commit: 37 rows. Candidate: 9 rows. Closed leases are among the starting rows.",
  L24: "Starting commit: 11 actions in 3 tabs. Candidate: 3 actions in 1 tab.",
};

interface RunOptions {
  readonly run?: number;
  readonly accepted?: "Yes" | "No";
  readonly verdicts?: Record<string, string>;
  readonly evidence?: Record<string, string>;
  readonly repairs?: Record<string, string>;
  readonly only?: readonly string[];
  readonly goalGroups?: string;
  readonly commit?: string;
}

/** One filled run block built from the shared template. */
function run(options: RunOptions = {}) {
  const included = options.only ?? checks;
  return litmusRunTemplate(rules, {
    commit: options.commit ?? CANDIDATE,
    run: options.run ?? 1,
    checks: included,
  })
    .replace("Accepted: <Yes or No>", `Accepted: ${options.accepted ?? "Yes"}`)
    .replace(/^Goal groups: .*$/m, `Goal groups: ${options.goalGroups ?? "all"}`)
    .split("\n")
    .map((line) => {
      const check = line.match(/^\| (L\d{2}) /)?.[1];
      if (!check) return line;
      const verdict = options.verdicts?.[check] ?? "Yes";
      const evidence = options.evidence?.[check] ?? COUNTS[check] ?? EVIDENCE;
      const blocker =
        verdict === "UNVERIFIED" ? "Needs a staff session with real leases." : "none";
      return `| ${check} | ${verdict} | ${evidence} | ${options.repairs?.[check] ?? "none"} | ${blocker} |`;
    })
    .join("\n");
}

interface DocumentOptions {
  readonly runs?: readonly string[];
  readonly humanVerdict?: string;
  readonly staffSession?: string;
  readonly initialFailures?: string;
  readonly repairs?: string;
  readonly finalObservations?: string;
  readonly remainingBlockers?: string;
}

/** One report document built from the shared template, with its sections filled. */
function report(options: DocumentOptions = {}) {
  const runs = options.runs ?? [run()];
  const head = litmusDocumentTemplate(RENEWAL_ONE_PATH_LITMUS, spec, {
    date: "2026-11-06",
    commit: CANDIDATE,
  }).split(/^## Run /m)[0];
  const fill = (text: string, heading: string, body: string) =>
    text.replace(new RegExp(`(## ${heading}\\n\\n)[^\\n]*`), `$1${body}`);
  let filled = head
    .replace(
      /^Human verdict: .*$/m,
      `Human verdict: ${options.humanVerdict ?? "NOT RUN"}`,
    )
    .replace(/^Staff session: .*$/m, `Staff session: ${options.staffSession ?? "none"}`);
  filled = fill(filled, "Initial failures", options.initialFailures ?? "None.");
  filled = fill(filled, "Repairs", options.repairs ?? "None.");
  filled = fill(
    filled,
    "Final observations",
    options.finalObservations ?? "Every check was observed on the candidate.",
  );
  filled = fill(filled, "Remaining blockers", options.remainingBlockers ?? "None.");
  return `${filled}${runs.map((block, index) => `## Run ${index + 1}\n\n${block}`).join("\n")}`;
}

const problems = (markdown: string) =>
  validateLitmusDocument(markdown, RENEWAL_ONE_PATH_LITMUS, spec);

describe("S254 ARCH-S254-2: one template and validator for both litmus handoffs", () => {
  it("the shared module names both suites, and no single specification path binds it", () => {
    expect(LITMUS_SUITES.map((suite) => [suite.id, suite.specPath])).toEqual([
      ["S245", "docs/feature-suites/staff-help-hub-adversary-litmus.md"],
      ["S254", "docs/feature-suites/renewal-one-path-adversary-litmus.md"],
    ]);
    expect(LITMUS_SPEC_PATH).toBe(HELP_HUB_LITMUS.specPath);
    expect(
      litmusReportFilePattern(HELP_HUB_LITMUS).test("help-hub-litmus-2026-11-04.md"),
    ).toBe(true);
    expect(
      litmusReportFilePattern(RENEWAL_ONE_PATH_LITMUS).test(
        "renewal-one-path-litmus-2026-11-06.md",
      ),
    ).toBe(true);
    expect(
      litmusReportFilePattern(RENEWAL_ONE_PATH_LITMUS).test(
        "help-hub-litmus-repairs-delivery-2026-11-05.md",
      ),
    ).toBe(false);
  });

  it("both templates carry check, verdict, evidence, repair and blocker for every check", () => {
    const helpChecks = litmusCheckIds(helpSpec);
    const header = /\| Check \| Verdict \| Evidence \| Repair \| Blocker \|/;
    const help = LITMUS_REPORT_TEMPLATE(helpChecks);
    const onePath = litmusDocumentTemplate(RENEWAL_ONE_PATH_LITMUS, spec, {
      date: "2026-11-06",
    });
    expect(help).toMatch(header);
    expect(onePath).toMatch(header);
    for (const check of helpChecks) expect(help).toContain(`| ${check} |`);
    for (const check of checks) expect(onePath).toContain(`| ${check} |`);
    // The S245 template is the shared run template under the help hub title.
    expect(help).toBe(
      `# Staff help hub litmus report\n\n${litmusRunTemplate(litmusRunRules(helpSpec))}`,
    );
  });

  it("the one-path template has the run header and the four report sections", () => {
    const template = litmusDocumentTemplate(RENEWAL_ONE_PATH_LITMUS, spec, {
      date: "2026-11-06",
      commit: CANDIDATE,
    });
    expect(template).toMatch(/^# One-path renewal litmus report, 2026-11-06$/m);
    for (const line of [
      "Human verdict: NOT RUN",
      "Staff session: none",
      "## Initial failures",
      "## Repairs",
      "## Final observations",
      "## Remaining blockers",
      "## Run 1",
      `Commit: ${CANDIDATE}`,
      `Starting commit: ${STARTING}`,
      "Run: 1",
      "Goal groups: all",
      "Accepted: <Yes or No>",
    ])
      expect(template, line).toContain(line);
    // The two before-and-after checks ask for both counts in the template itself.
    expect(template).toMatch(
      /\| L11 \| [^|]+ \| Starting commit: <n> rows\. Candidate: <n> rows\./,
    );
    expect(template).toMatch(
      /\| L24 \| [^|]+ \| Starting commit: <n> actions in <n> tabs\. Candidate: <n> actions in <n> tabs\./,
    );
  });

  it("a filled one-path report validates", () => {
    expect(problems(report())).toEqual([]);
    expect(litmusDocumentAccepted(report())).toBe(true);
    expect(litmusDocumentAccepted(report({ runs: [run({ accepted: "No" })] }))).toBe(
      false,
    );
  });

  it("an unfilled template does not validate", () => {
    const template = litmusDocumentTemplate(RENEWAL_ONE_PATH_LITMUS, spec, {
      date: "2026-11-06",
      commit: CANDIDATE,
    });
    expect(problems(template)).toContain(
      "Run 1: The report does not say whether it is accepted.",
    );
    expect(problems(template)).toContain(
      "Run 1: L01 has no verdict (Yes, No or UNVERIFIED).",
    );
  });

  it("AC-S254-2: the committed S245 reports still validate unchanged", () => {
    const helpChecks = litmusCheckIds(helpSpec);
    const dir = join(process.cwd(), "docs/evidence");
    const files = readdirSync(dir).filter((file) =>
      litmusReportFilePattern(HELP_HUB_LITMUS).test(file),
    );
    expect(files).toContain("help-hub-litmus-2026-11-04.md");
    for (const file of files) {
      const text = readFileSync(join(dir, file), "utf8");
      // The document validator serves both suites; S245 reports are held to their run tables.
      expect(validateLitmusDocument(text, HELP_HUB_LITMUS, helpSpec), file).toEqual([]);
      const runs = splitLitmusRuns(text);
      expect(runs.length, file).toBeGreaterThan(0);
      for (const block of runs) {
        expect(validateLitmusReport(block.body, helpChecks), file).toEqual([]);
        expect(validateLitmusRun(block.body, litmusRunRules(helpSpec)), file).toEqual([]);
      }
    }
  });
});

describe("S254 BEH-S254-2 / AC-S254-2: what cannot be recorded as accepted", () => {
  it("a report missing any check fails", () => {
    const missing = run({ only: checks.filter((check) => check !== "L37") });
    expect(problems(report({ runs: [missing] }))).toContain(
      "Run 1: L37 must appear exactly once.",
    );
    const unaccepted = run({
      accepted: "No",
      only: checks.filter((check) => check !== "L37"),
    });
    expect(problems(report({ runs: [unaccepted] }))).toContain(
      "Run 1: L37 must appear exactly once.",
    );
  });

  it("a report with one No cannot be accepted", () => {
    const accepted = report({
      runs: [run({ verdicts: { L03: "No" } })],
      initialFailures: "L03: a closed lease is listed under This batch.",
      remainingBlockers: "L03: a closed lease is listed under This batch.",
    });
    expect(problems(accepted)).toEqual([
      "Run 1: The report cannot be accepted while L03 is No.",
    ]);
    const honest = report({
      runs: [run({ verdicts: { L03: "No" }, accepted: "No" })],
      initialFailures: "L03: a closed lease is listed under This batch.",
      remainingBlockers: "L03: a closed lease is listed under This batch.",
    });
    expect(problems(honest)).toEqual([]);
  });

  it("R-S254-7: a progress run that names only some goal groups is never accepted", () => {
    const first = groups[0];
    const progress = (accepted: "Yes" | "No") =>
      report({
        runs: [run({ only: first.checks, goalGroups: first.goal, accepted })],
        finalObservations: "Progress run for the first goal group only.",
      });
    expect(problems(progress("No"))).toEqual([]);
    expect(problems(progress("Yes"))).toEqual([
      "Run 1: A progress run that names only some goal groups cannot be accepted; acceptance needs one run that covers every check on one commit.",
    ]);
    // Naming two groups is still a progress run, and its own checks must all be there.
    const two = `${groups[0].goal}; ${groups[1].goal}`;
    const twoGroups = report({
      runs: [
        run({
          only: [...groups[0].checks, ...groups[1].checks].filter((c) => c !== "L15"),
          goalGroups: two,
          accepted: "No",
        }),
      ],
    });
    expect(problems(twoGroups)).toEqual(["Run 1: L15 must appear exactly once."]);
  });

  it("a run that claims every group but lists only one group's checks fails", () => {
    const partial = report({ runs: [run({ only: groups[0].checks, accepted: "No" })] });
    expect(problems(partial)).toContain("Run 1: L12 must appear exactly once.");
    expect(problems(partial)).toContain("Run 1: L71 must appear exactly once.");
  });

  it("a run must say which goal groups it covers, by the table's names", () => {
    const silent = run().replace(/^Goal groups: .*\n/m, "");
    expect(problems(report({ runs: [silent] }))).toContain(
      "Run 1: The run does not say which goal groups it covers (Goal groups: all, or the group names separated by semicolons).",
    );
    const unknown = run({
      goalGroups: "Targets",
      only: groups[0].checks,
      accepted: "No",
    });
    expect(problems(report({ runs: [unknown] }))).toContain(
      'Run 1: "Targets" is not a goal group of the handoff.',
    );
    const outside = run({
      only: [...groups[0].checks, "L12"],
      goalGroups: groups[0].goal,
      accepted: "No",
    });
    expect(problems(report({ runs: [outside] }))).toEqual([
      "Run 1: L12 is outside the goal groups this run names.",
    ]);
  });

  it("acceptance needs every check on one commit", () => {
    const cited = report({
      runs: [
        run({ accepted: "No", verdicts: { L09: "No" } }),
        run({
          run: 2,
          evidence: { L05: "Unchanged since Run 1; the inputs are byte-identical." },
        }),
      ],
      initialFailures: "L09: the lease left the list.",
      repairs: "L09: the status read failure keeps the row.",
    });
    expect(problems(cited)).toEqual([
      "Run 2: L05 cites Run 1; an accepted run observes every check on its own commit.",
    ]);
    const otherCommit = report({
      runs: [
        run({ evidence: { L05: "Observed on 89abcdef0123 before the last repair." } }),
      ],
    });
    expect(problems(otherCommit)).toEqual([
      "Run 1: L05 cites commit 89abcdef0123; an accepted run observes every check on its own commit.",
    ]);
    // A run that is not accepted may cite an earlier run, and the two named commits are allowed.
    const allowed = report({
      runs: [
        run({ accepted: "No", verdicts: { L09: "No" } }),
        run({
          run: 2,
          accepted: "No",
          verdicts: { L09: "No" },
          evidence: {
            L05: "Unchanged since Run 1.",
            L06: `Counted on ${CANDIDATE.slice(0, 12)} and on ${STARTING.slice(0, 8)}.`,
          },
        }),
      ],
      initialFailures: "L09: the lease left the list.",
      remainingBlockers: "L09: the lease still leaves the list.",
    });
    expect(problems(allowed)).toEqual([]);
  });

  it("a run names the full candidate commit and the handoff's starting commit", () => {
    expect(problems(report({ runs: [run({ commit: "0123456" })] }))).toEqual([
      "Run 1: The run names no full 40-character candidate commit.",
    ]);
    const noStart = run().replace(/^Starting commit: .*\n/m, "");
    expect(problems(report({ runs: [noStart] }))).toEqual([
      `Run 1: The run does not name the starting commit ${STARTING}.`,
    ]);
    const wrongStart = run().replace(STARTING, CANDIDATE);
    expect(problems(report({ runs: [wrongStart] }))).toContain(
      `Run 1: The run does not name the starting commit ${STARTING}.`,
    );
    expect(problems(report({ runs: [run({ commit: STARTING })] }))).toContain(
      "Run 1: The candidate commit is the starting commit, so nothing is compared.",
    );
  });

  it("R-S254-3: L11 and L24 state the count for both commits", () => {
    for (const check of ["L11", "L24"]) {
      const candidateOnly = report({
        runs: [
          run({
            evidence: { [check]: "Candidate: 9 rows. The starting list was longer." },
          }),
        ],
      });
      expect(problems(candidateOnly)).toEqual([
        `Run 1: ${check} does not state the count for both commits (Starting commit: <n>. Candidate: <n>.).`,
      ]);
    }
    // When the starting commit cannot be served, the check is UNVERIFIED with its gap.
    const unverified = report({
      runs: [
        run({
          verdicts: { L11: "UNVERIFIED" },
          evidence: { L11: "The starting commit did not build in the rehearsal." },
        }),
      ],
      remainingBlockers: "L11: the starting commit does not build in the rehearsal.",
    });
    expect(problems(unverified)).toEqual([]);
  });
});

describe("S254 BEH-S254-1: an initial failure and its repaired state are both recorded", () => {
  const first = run({ accepted: "No", verdicts: { L03: "No" } });
  const second = run({
    run: 2,
    repairs: { L03: "The batch excludes leases RentVine reports closed." },
  });

  it("a No that becomes Yes after a repair validates when both states are written down", () => {
    const recorded = report({
      runs: [first, second],
      initialFailures: "L03: a closed lease was listed under This batch.",
      repairs: "L03: the batch excludes leases RentVine reports closed.",
    });
    expect(problems(recorded)).toEqual([]);
    expect(litmusDocumentAccepted(recorded)).toBe(true);
  });

  it("leaving the initial failure or the repair out fails", () => {
    expect(
      problems(
        report({ runs: [first, second], repairs: "L03: the batch excludes them." }),
      ),
    ).toEqual(["L03 was No in Run 1 and is missing from Initial failures."]);
    expect(
      problems(report({ runs: [first, second], initialFailures: "L03: listed." })),
    ).toEqual(["L03 went from No to Yes in Run 2 and is missing from Repairs."]);
  });

  it("a check still No or UNVERIFIED in the last run is named under Remaining blockers", () => {
    const open = run({ accepted: "No", verdicts: { L44: "UNVERIFIED", L09: "No" } });
    expect(
      problems(report({ runs: [open], initialFailures: "L09: left the list." })),
    ).toEqual([
      "L09 is No in the last run and is missing from Remaining blockers.",
      "L44 is UNVERIFIED in the last run and is missing from Remaining blockers.",
    ]);
  });
});

describe("S254 BEH-S254-3: a run ends with a verdict for every check and no pause", () => {
  it("every check ends Yes, No or UNVERIFIED", () => {
    const waiting = run({ accepted: "No", verdicts: { L48: "Waiting for the owner" } });
    expect(problems(report({ runs: [waiting] }))).toContain(
      "Run 1: L48 has no verdict (Yes, No or UNVERIFIED).",
    );
  });

  it("a needed decision is a blocker row: UNVERIFIED names its evidence gap", () => {
    const silent = run({ verdicts: { L48: "UNVERIFIED" } }).replace(
      "Needs a staff session with real leases.",
      "none",
    );
    expect(
      problems(report({ runs: [silent], remainingBlockers: "L48: needs a decision." })),
    ).toEqual(["Run 1: L48 is UNVERIFIED without naming the evidence gap."]);
  });
});

describe("S254 R-S254-9: what a machine cannot prove stays unproven", () => {
  it("the human verdict reads NOT RUN unless a staff session was held", () => {
    expect(problems(report({ humanVerdict: "NOT RUN (no human observer)" }))).toEqual([]);
    expect(problems(report({ humanVerdict: "Pass" }))).toEqual([
      "The human verdict reads Pass, but no staff session is recorded; it stays NOT RUN until staff hold one (Staff session: YYYY-MM-DD).",
    ]);
    expect(
      problems(report({ humanVerdict: "Pass", staffSession: "2026-11-10" })),
    ).toEqual([]);
    expect(problems(report().replace(/^Human verdict: .*\n/m, ""))).toEqual([
      "The report does not state the human verdict (Human verdict: NOT RUN).",
    ]);
  });

  it.each([
    ["Staff find the work easy now.", "that staff find the work easy"],
    ["The new page is simpler for staff.", "that staff find the work easy"],
    [
      "The real owner message was delivered and answered.",
      "that a real message was delivered or answered",
    ],
    ["A billed comparison ran for each lease.", "that a billed comparison ran"],
    ["The renewal extension was signed by both tenants.", "that a document was signed"],
    [
      "RentVine was updated with the new end date.",
      "that RentVine or the operating Sheet was updated",
    ],
    [
      "The operating Sheet has been updated for the lease.",
      "that RentVine or the operating Sheet was updated",
    ],
    ["Production data is accurate for December.", "that production data is accurate"],
  ])("refuses the claim %s", (sentence, claim) => {
    expect(litmusForbiddenClaims(sentence)).toEqual([claim]);
    expect(problems(report({ finalObservations: sentence }))).toEqual([
      `The report claims ${claim}, which a machine run cannot prove (R-S254-9): "${sentence}"`,
    ]);
  });

  it.each([
    "Whether staff find the work easy is decided in their weekly session, not here.",
    "No real message was delivered or answered; sends went to the rehearsal's mail stand-in.",
    "The comparison stand-in answered one request per lease; no billed comparison ran.",
    "Staff recorded each signer result by hand; no document was signed.",
    "The RentVine and operating Sheet update previews were shown; neither source was updated.",
    "Production data was not read, so its accuracy is unproven.",
    "The stand-in accepted the send and the lease read Waiting on owner response.",
  ])("allows the statement %s", (sentence) => {
    expect(litmusForbiddenClaims(sentence)).toEqual([]);
    expect(problems(report({ finalObservations: sentence }))).toEqual([]);
  });

  it("the report holds no raw screenshot and no address outside the synthetic ones", () => {
    expect(problems(report({ finalObservations: "See ![desk](desk.png)." }))).toEqual([
      "The report embeds a picture; raw screenshots stay outside Git.",
    ]);
    expect(
      problems(
        report({ finalObservations: "The owner at pat.owner@gmail.com replied." }),
      ),
    ).toEqual([
      "The report contains an address that is not a synthetic example address (pat.owner@gmail.com).",
    ]);
    expect(
      problems(
        report({
          finalObservations:
            "The message to jordan.sample@example.invalid from local-demo-editor@pmikcmetro.com was accepted by the stand-in.",
        }),
      ),
    ).toEqual([]);
  });

  it("a report without its sections or runs fails", () => {
    const headless = report().replace("## Repairs", "## Fixes");
    expect(problems(headless)).toEqual(["The report has no Repairs section."]);
    expect(problems(report({ runs: [] }))).toEqual(["The report has no run."]);
    expect(problems(report().replace(/^# .*$/m, "# Notes"))).toEqual([
      "The report does not start with the heading One-path renewal litmus report.",
    ]);
  });
});

describe("committed one-path renewal litmus reports", () => {
  it("every committed renewal-one-path-litmus report is valid, and none is required yet", () => {
    const dir = join(process.cwd(), "docs/evidence");
    const pattern = litmusReportFilePattern(RENEWAL_ONE_PATH_LITMUS);
    const reports = existsSync(dir)
      ? readdirSync(dir).filter((file) => pattern.test(file))
      : [];
    for (const file of reports) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(validateLitmusDocument(text, RENEWAL_ONE_PATH_LITMUS, spec), file).toEqual(
        [],
      );
    }
    expect(reports.every((file) => pattern.test(file))).toBe(true);
  });
});
