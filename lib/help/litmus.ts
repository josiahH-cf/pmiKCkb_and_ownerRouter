// S245 R-S245-3 / ARCH-S245-2 / BEH-S245-2: the help hub litmus report template and its validator.
// A report lists every check L01..L34 once with its verdict (Yes, No or UNVERIFIED), concise
// observed evidence, the repair made (or none) and the remaining blocker (or none). UNVERIFIED
// must name the evidence gap. A report is accepted only when no check is No and every UNVERIFIED
// names a gap outside the runner's control.

export const LITMUS_SPEC_PATH = "docs/feature-suites/staff-help-hub-adversary-litmus.md";
export const LITMUS_VERDICTS = ["Yes", "No", "UNVERIFIED"] as const;
export type LitmusVerdict = (typeof LITMUS_VERDICTS)[number];

export interface LitmusRow {
  readonly check: string;
  readonly verdict: string;
  readonly evidence: string;
  readonly repair: string;
  readonly blocker: string;
}

/** The paste-ready handoff section of the S245 spec. */
export function litmusHandoff(spec: string): string {
  const start = spec.indexOf("## Litmus handoff (paste-ready)");
  if (start < 0) throw new Error("The S245 spec has no paste-ready litmus handoff.");
  return spec.slice(start);
}

/** Check ids in handoff order, for example L01 to L34. */
export function litmusCheckIds(spec: string): string[] {
  return [...litmusHandoff(spec).matchAll(/^- (L\d{2}) /gm)].map((match) => match[1]);
}

export const LITMUS_REPORT_TEMPLATE = (checks: readonly string[], commit = "<commit>") =>
  [
    "# Staff help hub litmus report",
    "",
    `Commit: ${commit}`,
    "Run: <run number>",
    "Accepted: <Yes or No>",
    "",
    "| Check | Verdict | Evidence | Repair | Blocker |",
    "| ----- | ------- | -------- | ------ | ------- |",
    ...checks.map(
      (check) =>
        `| ${check} | <Yes, No or UNVERIFIED> | <observed evidence> | none | none |`,
    ),
    "",
  ].join("\n");

export function parseLitmusReport(markdown: string) {
  const accepted = markdown.match(/^Accepted: (.+)$/m)?.[1]?.trim() ?? "";
  const commit = markdown.match(/^Commit: (.+)$/m)?.[1]?.trim() ?? "";
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
  return { accepted, commit, rows };
}

/** Problems with a report; an accepted report must have none. */
export function validateLitmusReport(
  markdown: string,
  checks: readonly string[],
): string[] {
  const problems: string[] = [];
  const { accepted, commit, rows } = parseLitmusReport(markdown);
  if (!/^[a-f0-9]{7,40}$/.test(commit)) problems.push("The report names no commit.");
  if (!["Yes", "No"].includes(accepted))
    problems.push("The report does not say whether it is accepted.");
  for (const check of checks) {
    const found = rows.filter((row) => row.check === check);
    if (found.length !== 1) problems.push(`${check} must appear exactly once.`);
  }
  for (const row of rows) {
    if (!checks.includes(row.check)) problems.push(`${row.check} is not a litmus check.`);
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
  return problems;
}
