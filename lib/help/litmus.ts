// S245 R-S245-3 / ARCH-S245-2 / BEH-S245-2 and S254 R-S254-5 / R-S254-7 / R-S254-9 /
// ARCH-S254-1 / ARCH-S254-2: the litmus report template and validator shared by the two
// outside-session handoffs, the staff help hub litmus (S245) and the one-path renewal litmus
// (S254).
//
// A run lists every check once with its verdict (Yes, No or UNVERIFIED), concise observed
// evidence, the repair made (or none) and the remaining blocker (or none). UNVERIFIED must name
// the evidence gap. A run is accepted only when no check is No.
//
// Everything a handoff adds to that table is read from its specification, so no rule here is
// bound to one specification path: the checks, the goal group table (a run names the groups it
// covers, and a run that names only some of them is a progress run that is never accepted), the
// starting commit a candidate is compared with, and the checks whose evidence states a count for
// both commits.

export const LITMUS_VERDICTS = ["Yes", "No", "UNVERIFIED"] as const;
export type LitmusVerdict = (typeof LITMUS_VERDICTS)[number];

export interface LitmusSuite {
  readonly id: string;
  /** The specification whose last section is the paste-ready handoff. */
  readonly specPath: string;
  /** The report heading; a dated report appends a comma and its date. */
  readonly reportTitle: string;
  /** Reports are committed as `docs/evidence/<prefix>-<date>.md`. */
  readonly reportFilePrefix: string;
  /** What the handoff verifies, for the report's opening line. */
  readonly subject: string;
  /**
   * True when the report document is under contract beyond its run tables: the human verdict
   * line, the four sections, the failure and repair history, and nothing a machine run cannot
   * prove. The S245 reports were committed before that contract existed; their runs validate.
   */
  readonly documentContract: boolean;
  /** Every aggregate engineering check must pass. External observations are recorded separately. */
  readonly requireAllYes?: boolean;
}

export const HELP_HUB_LITMUS: LitmusSuite = {
  id: "S245",
  specPath: "docs/feature-suites/staff-help-hub-adversary-litmus.md",
  reportTitle: "Staff help hub litmus report",
  reportFilePrefix: "help-hub-litmus",
  subject: "the staff help hub (S242 to S244)",
  documentContract: false,
};

export const RENEWAL_ONE_PATH_LITMUS: LitmusSuite = {
  id: "S254",
  specPath: "docs/feature-suites/renewal-one-path-adversary-litmus.md",
  reportTitle: "One-path renewal litmus report",
  reportFilePrefix: "renewal-one-path-litmus",
  subject: "the lease renewal one-path batch (S246 to S253)",
  documentContract: true,
};

export const RENEWAL_USABILITY_LITMUS: LitmusSuite = {
  id: "S259",
  specPath: "docs/feature-suites/renewal-usability-final-journey-litmus.md",
  reportTitle: "November 7 renewal usability litmus report",
  reportFilePrefix: "renewal-usability-litmus",
  subject: "the November 7 lease renewal usability batch",
  documentContract: true,
  requireAllYes: true,
};

export const LITMUS_SUITES: readonly LitmusSuite[] = [
  HELP_HUB_LITMUS,
  RENEWAL_ONE_PATH_LITMUS,
  RENEWAL_USABILITY_LITMUS,
];

/** The S245 specification path, kept for the callers that predate the shared suite list. */
export const LITMUS_SPEC_PATH = HELP_HUB_LITMUS.specPath;

export const LITMUS_EVIDENCE_DIR = "docs/evidence";
export const LITMUS_REPORT_SECTIONS = [
  "Initial failures",
  "Repairs",
  "Final observations",
  "Remaining blockers",
] as const;

/** Matches a committed report's file name, for example `help-hub-litmus-2026-11-04.md`. */
export function litmusReportFilePattern(suite: LitmusSuite): RegExp {
  const prefix = suite.reportFilePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${prefix}-\\d{4}-\\d{2}-\\d{2}\\.md$`);
}

/** Where a run's sanitized report is committed. */
export function litmusReportPath(suite: LitmusSuite, date: string): string {
  return `${LITMUS_EVIDENCE_DIR}/${suite.reportFilePrefix}-${date}.md`;
}

export interface LitmusRow {
  readonly check: string;
  readonly verdict: string;
  readonly evidence: string;
  readonly repair: string;
  readonly blocker: string;
}

/** The paste-ready handoff section of a litmus specification. */
export function litmusHandoff(spec: string): string {
  const start = spec.indexOf("## Litmus handoff (paste-ready)");
  if (start < 0) throw new Error("The specification has no paste-ready litmus handoff.");
  return spec.slice(start);
}

function handoffChecks(spec: string): { check: string; text: string }[] {
  return [...litmusHandoff(spec).matchAll(/^- (L\d{2}) (.*)$/gm)].map((match) => ({
    check: match[1],
    text: match[2],
  }));
}

/** Check ids in handoff order, for example L01 to L34. */
export function litmusCheckIds(spec: string): string[] {
  return handoffChecks(spec).map((entry) => entry.check);
}

export interface LitmusGoalGroup {
  readonly goal: string;
  readonly checks: readonly string[];
  readonly suites: readonly string[];
}

const numbered = (letter: string, n: number, width: number) =>
  `${letter}${String(n).padStart(width, "0")}`;

/** "L01 to L03, L07" or "S246 to S248, S250" as ids; any other wording names none. */
function idList(cell: string, letter: "L" | "S", width: number): string[] {
  const one = new RegExp(`^${letter}(\\d{${width}})$`);
  const span = new RegExp(`^${letter}(\\d{${width}}) to ${letter}(\\d{${width}})$`);
  const ids: string[] = [];
  for (const part of cell.split(",").map((entry) => entry.trim())) {
    const range = part.match(span);
    const single = part.match(one);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n += 1)
        ids.push(numbered(letter, n, width));
    } else if (single) ids.push(numbered(letter, Number(single[1]), width));
  }
  return ids;
}

/** Compare the versioned preservation crosswalk to both immutable handoff inventories. */
export function litmusPreservationProblems(
  profile: string,
  originalSpec: string,
  currentSpec: string,
): string[] {
  const before = litmusCheckIds(originalSpec);
  const after = litmusCheckIds(currentSpec);
  const mappings = [...profile.matchAll(/^\|\s*(L\d{2})\s*\|([^|]*)\|([^|]+)\|$/gm)];
  const current = mappings.map((row) => row[1]);
  const preserved = mappings.flatMap((row) => idList(row[2], "L", 2));
  const problems = [];
  if (current.join(",") !== after.join(","))
    problems.push(
      "The preservation profile needs each current journey exactly once in order.",
    );
  if ([...preserved].sort().join(",") !== before.join(","))
    problems.push("The preservation profile needs each original check exactly once.");
  if (mappings.some((row) => !row[3].trim()))
    problems.push("Each journey needs its current expectation.");
  return problems;
}

/** The goal group table of a specification (S254 R-S254-7), in table order; empty without one. */
export function litmusGoalGroups(spec: string): LitmusGoalGroup[] {
  const lines = spec.split("\n").map((line) => line.trim());
  const header = lines.findIndex((line) => /^\|\s*Goal group\s*\|/.test(line));
  if (header < 0) return [];
  const groups: LitmusGoalGroup[] = [];
  for (const line of lines.slice(header + 1)) {
    if (!line.startsWith("|")) break;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 3 || /^-+$/.test(cells[0])) continue;
    groups.push({
      goal: cells[0],
      checks: idList(cells[1], "L", 2),
      suites: idList(cells[2], "S", 3),
    });
  }
  return groups;
}

/** The suites the handoff says it verifies, for example S246 to S253; empty when it names none. */
export function litmusSuitesUnderTest(spec: string): string[] {
  const named = litmusHandoff(spec).match(
    /\bsuites (S\d{3}(?: to S\d{3})?(?:, S\d{3}(?: to S\d{3})?)*)/,
  );
  return named ? idList(named[1], "S", 3) : [];
}

/**
 * S254 ARCH-S254-1 / AC-S254-1: what keeps the handoff and its goal group table from covering
 * each other. The handoff numbers its checks in order, every check is in exactly one group, every
 * group names checks the handoff lists, and every suite under test is in at least one group.
 */
export function litmusCoverageProblems(spec: string): string[] {
  const problems: string[] = [];
  const checks = litmusCheckIds(spec);
  if (!checks.length) problems.push("The handoff lists no checks.");
  const misnumbered = checks.findIndex(
    (check, index) => check !== numbered("L", index + 1, 2),
  );
  if (misnumbered >= 0)
    problems.push(
      `The handoff numbers ${checks[misnumbered]} where ${numbered("L", misnumbered + 1, 2)} belongs.`,
    );
  const groups = litmusGoalGroups(spec);
  if (!groups.length) {
    problems.push("The specification has no goal group table.");
    return problems;
  }
  for (const group of groups) {
    if (!group.checks.length)
      problems.push(`Goal group "${group.goal}" names no checks.`);
    for (const check of group.checks)
      if (!checks.includes(check))
        problems.push(
          `Goal group "${group.goal}" names ${check}, which the handoff does not list.`,
        );
  }
  for (const check of checks) {
    const holders = groups.filter((group) => group.checks.includes(check));
    if (!holders.length) problems.push(`${check} is in no goal group.`);
    if (holders.length > 1)
      problems.push(
        `${check} is in more than one goal group (${holders.map((group) => group.goal).join("; ")}).`,
      );
  }
  for (const suite of litmusSuitesUnderTest(spec))
    if (!groups.some((group) => group.suites.includes(suite)))
      problems.push(`${suite} is under test in no goal group.`);
  return problems;
}

/** The starting commit the handoff compares the candidate with, or null when it names none. */
export function litmusStartingCommit(spec: string): string | null {
  return litmusHandoff(spec).match(/starting commit `([a-f0-9]{40})`/)?.[1] ?? null;
}

const REPORT_STATES = "The report states";

/** The checks whose text asks the report to state a count for both commits (S254 R-S254-3). */
export function litmusBeforeAfterChecks(spec: string): string[] {
  return handoffChecks(spec)
    .filter((entry) => entry.text.includes(REPORT_STATES))
    .map((entry) => entry.check);
}

/** How a before-and-after check words one commit's count in the template. */
function countWording(text: string): string {
  if (text.includes("deliberate actions")) return "<n> actions in <n> tabs";
  if (text.includes("rows")) return "<n> rows";
  return "<n>";
}

export interface LitmusRunRules {
  readonly requireAllYes?: boolean;
  /** Every check of the handoff, in order. */
  readonly checks: readonly string[];
  /**
   * Present when the handoff is run by goal (S254 R-S254-7). A run then names the goal groups it
   * covers, and only a run that covers every check on its own commit can be accepted.
   */
  readonly goalGroups?: readonly LitmusGoalGroup[];
  /** Present when the handoff compares the candidate with a named starting commit. */
  readonly startingCommit?: string;
  /** Checks whose evidence states the count for both commits. */
  readonly beforeAfterChecks?: readonly string[];
  /** The template's wording of one commit's count, by before-and-after check. */
  readonly beforeAfterCounts?: Readonly<Record<string, string>>;
}

/** The rules one run of a handoff is validated against, read from its specification. */
export function litmusRunRules(spec: string, suite?: LitmusSuite): LitmusRunRules {
  const goalGroups = litmusGoalGroups(spec);
  const startingCommit = litmusStartingCommit(spec);
  const beforeAfter = handoffChecks(spec).filter((entry) =>
    entry.text.includes(REPORT_STATES),
  );
  return {
    checks: litmusCheckIds(spec),
    ...(suite?.requireAllYes ? { requireAllYes: true } : {}),
    ...(goalGroups.length ? { goalGroups } : {}),
    ...(startingCommit ? { startingCommit } : {}),
    ...(beforeAfter.length
      ? {
          beforeAfterChecks: beforeAfter.map((entry) => entry.check),
          beforeAfterCounts: Object.fromEntries(
            beforeAfter.map((entry) => [entry.check, countWording(entry.text)]),
          ),
        }
      : {}),
  };
}

export interface LitmusRunTemplateOptions {
  readonly commit?: string;
  readonly run?: number | string;
  /** The checks this run lists; a progress run lists the checks of the groups it names. */
  readonly checks?: readonly string[];
}

/** One run block: its header lines and the check table. Both handoffs use this template. */
export function litmusRunTemplate(
  rules: LitmusRunRules,
  options: LitmusRunTemplateOptions = {},
): string {
  const evidence = (check: string) => {
    const count = rules.beforeAfterCounts?.[check];
    return count
      ? `Starting commit: ${count}. Candidate: ${count}. <observed evidence>`
      : "<observed evidence>";
  };
  return [
    `Commit: ${options.commit ?? "<commit>"}`,
    ...(rules.startingCommit ? [`Starting commit: ${rules.startingCommit}`] : []),
    `Run: ${options.run ?? "<run number>"}`,
    ...(rules.goalGroups ? ["Goal groups: all"] : []),
    "Accepted: <Yes or No>",
    "",
    "| Check | Verdict | Evidence | Repair | Blocker |",
    "| ----- | ------- | -------- | ------ | ------- |",
    ...(options.checks ?? rules.checks).map(
      (check) =>
        `| ${check} | <Yes, No or UNVERIFIED> | ${evidence(check)} | none | none |`,
    ),
    "",
  ].join("\n");
}

/** The S245 single-run report: the shared run template under the help hub heading. */
export const LITMUS_REPORT_TEMPLATE = (checks: readonly string[], commit = "<commit>") =>
  `# ${HELP_HUB_LITMUS.reportTitle}\n\n${litmusRunTemplate({ checks }, { commit })}`;

export function parseLitmusReport(markdown: string) {
  const field = (name: string) =>
    markdown.match(new RegExp(`^${name}: (.+)$`, "m"))?.[1]?.trim() ?? "";
  const rows: LitmusRow[] = [];
  for (const line of markdown.split("\n")) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 5 || !/^L\d{2}$/.test(cells[0])) continue;
    const [check, verdict, evidence, repair, blocker] = cells;
    rows.push({ check, verdict, evidence, repair, blocker });
  }
  return {
    accepted: field("Accepted"),
    commit: field("Commit"),
    run: field("Run"),
    startingCommit: field("Starting commit"),
    goalGroups: field("Goal groups"),
    rows,
  };
}

const PROGRESS_RUN_ACCEPTED =
  "A progress run that names only some goal groups cannot be accepted; acceptance needs one run that covers every check on one commit.";
const GOAL_GROUPS_MISSING =
  "The run does not say which goal groups it covers (Goal groups: all, or the group names separated by semicolons).";

/** Other runs and other commits an evidence cell cites. */
function citations(evidence: string) {
  const runs = [...evidence.matchAll(/\bRun (\d+)\b/g)].map((match) => match[1]);
  const commits = (evidence.match(/\b[a-f0-9]{7,40}\b/g) ?? []).filter(
    (token) => /[a-f]/.test(token) && /\d/.test(token),
  );
  return { runs, commits };
}

/** Problems with one run; an accepted run must have none. */
export function validateLitmusRun(markdown: string, rules: LitmusRunRules): string[] {
  const problems: string[] = [];
  const report = parseLitmusReport(markdown);
  const { accepted, commit, rows } = report;

  if (rules.startingCommit) {
    if (!/^[a-f0-9]{40}$/.test(commit))
      problems.push("The run names no full 40-character candidate commit.");
    if (report.startingCommit !== rules.startingCommit)
      problems.push(`The run does not name the starting commit ${rules.startingCommit}.`);
    else if (commit === rules.startingCommit)
      problems.push(
        "The candidate commit is the starting commit, so nothing is compared.",
      );
  } else if (!/^[a-f0-9]{7,40}$/.test(commit))
    problems.push("The report names no commit.");
  if (!["Yes", "No"].includes(accepted))
    problems.push("The report does not say whether it is accepted.");

  // Run by goal: which checks this run answers for.
  let expected: readonly string[] = rules.checks;
  let scopeKnown = true;
  if (rules.goalGroups) {
    const groups = rules.goalGroups;
    if (!report.goalGroups) problems.push(GOAL_GROUPS_MISSING);
    else if (report.goalGroups.toLowerCase() !== "all") {
      const names = report.goalGroups
        .split(";")
        .map((name) => name.trim())
        .filter(Boolean);
      const unknown = names.filter(
        (name) => !groups.some((group) => group.goal === name),
      );
      for (const name of unknown)
        problems.push(`"${name}" is not a goal group of the handoff.`);
      scopeKnown = unknown.length === 0;
      const covered = groups
        .filter((group) => names.includes(group.goal))
        .flatMap((group) => group.checks);
      if (scopeKnown) expected = rules.checks.filter((check) => covered.includes(check));
    }
  }
  const progress = expected.length < rules.checks.length;

  if (scopeKnown)
    for (const check of expected) {
      const found = rows.filter((row) => row.check === check);
      if (found.length !== 1) problems.push(`${check} must appear exactly once.`);
    }
  for (const row of rows) {
    if (!rules.checks.includes(row.check))
      problems.push(`${row.check} is not a litmus check.`);
    else if (scopeKnown && !expected.includes(row.check))
      problems.push(`${row.check} is outside the goal groups this run names.`);
    if (!(LITMUS_VERDICTS as readonly string[]).includes(row.verdict))
      problems.push(`${row.check} has no verdict (Yes, No or UNVERIFIED).`);
    if (row.evidence.length < 8 || /^</.test(row.evidence))
      problems.push(`${row.check} has no observed evidence.`);
    if (!row.repair) problems.push(`${row.check} has no repair field.`);
    if (
      row.verdict === "UNVERIFIED" &&
      (!row.blocker || row.blocker.toLowerCase() === "none")
    )
      problems.push(`${row.check} is UNVERIFIED without naming the evidence gap.`);
  }
  const no = rows.filter((row) => row.verdict === "No");
  if (accepted === "Yes" && no.length)
    problems.push(
      `The report cannot be accepted while ${no.map((row) => row.check).join(", ")} is No.`,
    );

  if (rules.requireAllYes && accepted === "Yes") {
    const gaps = rows.filter((row) => row.verdict === "UNVERIFIED");
    if (gaps.length)
      problems.push(
        `The engineering run cannot be accepted while ${gaps.map((row) => row.check).join(", ")} is UNVERIFIED.`,
      );
  }
  if (rules.goalGroups && accepted === "Yes") {
    if (progress && scopeKnown) problems.push(PROGRESS_RUN_ACCEPTED);
    // Acceptance needs every check observed on this run's own commit.
    for (const row of rows) {
      const cited = citations(row.evidence);
      for (const run of new Set(cited.runs))
        if (Number(run) !== Number(report.run))
          problems.push(
            `${row.check} cites Run ${run}; an accepted run observes every check on its own commit.`,
          );
      for (const sha of new Set(cited.commits))
        if (!commit.startsWith(sha) && !(rules.startingCommit ?? "").startsWith(sha))
          problems.push(
            `${row.check} cites commit ${sha}; an accepted run observes every check on its own commit.`,
          );
    }
  }
  for (const check of rules.beforeAfterChecks ?? []) {
    const row = rows.find((entry) => entry.check === check);
    if (!row || (row.verdict !== "Yes" && row.verdict !== "No")) continue;
    if (
      !/Starting commit: \d+/.test(row.evidence) ||
      !/Candidate: \d+/.test(row.evidence)
    )
      problems.push(
        `${check} does not state the count for both commits (Starting commit: <n>. Candidate: <n>.).`,
      );
  }
  return problems;
}

/** Problems with a single-run report (the S245 shape); an accepted report must have none. */
export function validateLitmusReport(
  markdown: string,
  checks: readonly string[],
): string[] {
  return validateLitmusRun(markdown, { checks });
}

export interface LitmusRunBlock {
  /** The number in the block's "## Run N" heading. */
  readonly number: number;
  /** The block below its heading, up to the next second-level heading. */
  readonly body: string;
}

/** The run blocks of a report document, in document order. */
export function splitLitmusRuns(markdown: string): LitmusRunBlock[] {
  return markdown
    .split(/^## Run /m)
    .slice(1)
    .map((block) => {
      const end = block.search(/^## /m);
      const text = end < 0 ? block : block.slice(0, end);
      const newline = text.indexOf("\n");
      return {
        number: Number.parseInt(text, 10),
        body: newline < 0 ? "" : text.slice(newline + 1),
      };
    });
}

/** True when the document's last run says it is accepted. Validity is a separate question. */
export function litmusDocumentAccepted(markdown: string): boolean {
  const last = splitLitmusRuns(markdown).at(-1);
  return last ? parseLitmusReport(last.body).accepted === "Yes" : false;
}

export interface LitmusDocumentTemplateOptions {
  /** The report date, YYYY-MM-DD; the file is `<prefix>-<date>.md`. */
  readonly date: string;
  readonly commit?: string;
}

/**
 * The report document both handoffs use: the heading, the human verdict, the four sections that
 * keep initial failures, repairs, final observations and remaining blockers apart, and one block
 * per run. A later run is appended as another "## Run N" block from `litmusRunTemplate`.
 */
export function litmusDocumentTemplate(
  suite: LitmusSuite,
  spec: string,
  options: LitmusDocumentTemplateOptions,
): string {
  return [
    `# ${suite.reportTitle}, ${options.date}`,
    "",
    `Machine-run ${suite.id} litmus of ${suite.subject}, following the paste-ready handoff in \`${suite.specPath}\`. Every check ran in the isolated synthetic rehearsal. This report infers no human acceptance.`,
    "",
    "Human verdict: NOT RUN",
    "Staff session: none",
    "",
    "## Initial failures",
    "",
    "<each check that was No when first observed, with what was seen, or None.>",
    "",
    "## Repairs",
    "",
    "<each repair made inside the suites under test, by check, or None.>",
    "",
    "## Final observations",
    "",
    "<what the last run observed>",
    "",
    "## Remaining blockers",
    "",
    "<each check still No or UNVERIFIED, with the exact question or evidence gap, or None.>",
    "",
    "## Run 1",
    "",
    litmusRunTemplate(litmusRunRules(spec, suite), { commit: options.commit, run: 1 }),
  ].join("\n");
}

// S254 R-S254-9: what a machine run cannot prove. Each entry is a claim the report never makes.
const UNPROVEN_CLAIMS: readonly { claim: string; patterns: readonly RegExp[] }[] = [
  {
    claim: "that staff find the work easy",
    patterns: [
      /\bstaff\b.*\b(?:find|finds|found)\b.*\b(?:easy|easier|simple|simpler)\b/i,
      /\b(?:easy|easier|simple|simpler)\b.*\bfor (?:the )?staff\b/i,
    ],
  },
  {
    claim: "that a real message was delivered or answered",
    patterns: [
      /\breal\b.*\b(?:message|email|mail|reply)\b.*\b(?:delivered|answered|received|replied)\b/i,
    ],
  },
  {
    claim: "that a billed comparison ran",
    patterns: [
      /\bbilled\b.*\b(?:comparisons?|lookups?)\b.*\b(?:ran|run|completed|succeeded|returned)\b/i,
    ],
  },
  {
    claim: "that a document was signed",
    patterns: [/\b(?:was|were|is|are|been|got)\s+(?:fully\s+|counter)?signed\b/i],
  },
  {
    claim: "that RentVine or the operating Sheet was updated",
    patterns: [
      /\b(?:RentVine|operating Sheet)\b.*\b(?:was|were|is|are|been)\s+updated\b/i,
    ],
  },
  {
    claim: "that production data is accurate",
    patterns: [/\bproduction data\b.*\b(?:is|are|was|were)\s+(?:accurate|correct)\b/i],
  },
];

// A sentence that denies or defers the outcome is the report saying what stays unproven.
const DENIES_OR_DEFERS =
  /\b(?:no|not|never|none|neither|nor|nothing|without|cannot|unproven|unverified|whether)\b|n't\b/i;

/** Sentences of a report: paragraphs are rejoined, table rows are read cell by cell. */
function reportSentences(text: string): string[] {
  const blocks: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push(paragraph.join(" "));
    paragraph = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith("|")) {
      flush();
      blocks.push(...line.split("|"));
    } else {
      if (/^(?:#|[-*] |\d+\. )/.test(line)) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks
    .flatMap((block) => block.split(/(?<=[.;!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function unprovenClaims(text: string): { claim: string; sentence: string }[] {
  const found: { claim: string; sentence: string }[] = [];
  for (const sentence of reportSentences(text)) {
    if (DENIES_OR_DEFERS.test(sentence)) continue;
    for (const { claim, patterns } of UNPROVEN_CLAIMS)
      if (patterns.some((pattern) => pattern.test(sentence)))
        found.push({ claim, sentence });
  }
  return found;
}

/** The claims of R-S254-9 a text makes, each named once. A machine run can prove none of them. */
export function litmusForbiddenClaims(text: string): string[] {
  const made = new Set(unprovenClaims(text).map((entry) => entry.claim));
  return UNPROVEN_CLAIMS.map((entry) => entry.claim).filter((claim) => made.has(claim));
}

/** The text under every second-level heading that is the name or starts with it, or null. */
function sectionText(markdown: string, name: string): string | null {
  const parts = markdown
    .split(/^## /m)
    .slice(1)
    .filter((part) => {
      const heading = part.split("\n", 1)[0].trim();
      return heading === name || heading.startsWith(`${name} `);
    });
  if (!parts.length) return null;
  return parts.map((part) => part.slice(part.indexOf("\n") + 1)).join("\n");
}

const namesCheck = (text: string | null, check: string) =>
  text !== null && new RegExp(`\\b${check}\\b`).test(text);

const SYNTHETIC_ADDRESS = /@example\.invalid$|^local-demo[a-z-]*@pmikcmetro\.com$/i;

/**
 * Problems with a whole report document. Every run block is validated against the handoff's
 * rules. A suite under the document contract (S254) also needs the human verdict line (NOT RUN
 * unless a staff session is recorded), the four sections, each initial failure, repair and
 * remaining blocker named where it belongs, no claim a machine run cannot prove, no picture and
 * no address that is not a synthetic example address.
 */
export function validateLitmusDocument(
  markdown: string,
  suite: LitmusSuite,
  spec: string,
): string[] {
  const problems: string[] = [];
  const rules = litmusRunRules(spec, suite);
  const heading = markdown.trimStart().split("\n", 1)[0].trim();
  if (
    heading !== `# ${suite.reportTitle}` &&
    !heading.startsWith(`# ${suite.reportTitle},`)
  )
    problems.push(`The report does not start with the heading ${suite.reportTitle}.`);
  const runs = splitLitmusRuns(markdown).map((block) => ({
    ...block,
    report: parseLitmusReport(block.body),
  }));
  if (!runs.length) problems.push("The report has no run.");

  const sections = new Map<string, string | null>(
    LITMUS_REPORT_SECTIONS.map((name) => [name, sectionText(markdown, name)]),
  );
  if (suite.documentContract) {
    const verdict = markdown.match(/^Human verdict: (.+)$/m)?.[1]?.trim();
    const session = markdown.match(/^Staff session: (.+)$/m)?.[1]?.trim() ?? "";
    if (!verdict)
      problems.push(
        "The report does not state the human verdict (Human verdict: NOT RUN).",
      );
    else if (!/^NOT RUN\b/.test(verdict) && !/^\d{4}-\d{2}-\d{2}\b/.test(session))
      problems.push(
        `The human verdict reads ${verdict}, but no staff session is recorded; it stays NOT RUN until staff hold one (Staff session: YYYY-MM-DD).`,
      );
    for (const name of LITMUS_REPORT_SECTIONS) {
      const text = sections.get(name) ?? null;
      if (text === null) problems.push(`The report has no ${name} section.`);
      else if (!text.trim() || text.trim().startsWith("<"))
        problems.push(
          `The ${name} section is empty; write None when there is nothing to record.`,
        );
    }
  }

  for (const run of runs) {
    if (!Number.isInteger(run.number)) {
      problems.push("A run heading has no number (## Run 1).");
      continue;
    }
    for (const problem of validateLitmusRun(run.body, rules))
      problems.push(`Run ${run.number}: ${problem}`);
    if (suite.documentContract && Number(run.report.run) !== run.number)
      problems.push(
        `Run ${run.number}: The run header reads Run: ${run.report.run || "nothing"}.`,
      );
  }
  if (!suite.documentContract) return problems;

  // BEH-S254-1: an initial failure, its repair and what is still open are each written down.
  const last = runs.at(-1);
  for (const check of rules.checks) {
    const seen = runs.flatMap((run) => {
      const verdict = run.report.rows.find((row) => row.check === check)?.verdict;
      return verdict ? [{ number: run.number, verdict }] : [];
    });
    const firstNo = seen.find((entry) => entry.verdict === "No");
    if (firstNo && !namesCheck(sections.get("Initial failures") ?? null, check))
      problems.push(
        `${check} was No in Run ${firstNo.number} and is missing from Initial failures.`,
      );
    const repaired = seen.find(
      (entry, index) =>
        entry.verdict === "Yes" &&
        seen.slice(0, index).some((earlier) => earlier.verdict === "No"),
    );
    if (repaired && !namesCheck(sections.get("Repairs") ?? null, check))
      problems.push(
        `${check} went from No to Yes in Run ${repaired.number} and is missing from Repairs.`,
      );
    const latest = seen.at(-1);
    if (
      latest &&
      (latest.verdict === "No" || latest.verdict === "UNVERIFIED") &&
      !namesCheck(sections.get("Remaining blockers") ?? null, check)
    )
      problems.push(
        latest.number === last?.number
          ? `${check} is ${latest.verdict} in the last run and is missing from Remaining blockers.`
          : `${check} is ${latest.verdict} in Run ${latest.number}, its latest run, and is missing from Remaining blockers.`,
      );
  }

  for (const { claim, sentence } of unprovenClaims(markdown))
    problems.push(
      `The report claims ${claim}, which a machine run cannot prove (R-S254-9): "${sentence}"`,
    );
  if (/!\[[^\]]*\]\(|<img\b|data:image\//i.test(markdown))
    problems.push("The report embeds a picture; raw screenshots stay outside Git.");
  const addresses = markdown.match(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g,
  );
  for (const address of new Set(addresses ?? []))
    if (!SYNTHETIC_ADDRESS.test(address))
      problems.push(
        `The report contains an address that is not a synthetic example address (${address}).`,
      );
  return problems;
}
