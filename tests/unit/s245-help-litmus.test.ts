import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { HELP_GUIDES } from "@/lib/help";
import {
  LITMUS_REPORT_TEMPLATE,
  LITMUS_SPEC_PATH,
  litmusCheckIds,
  litmusHandoff,
  validateLitmusReport,
} from "@/lib/help/litmus";
import { HELP_SECTIONS } from "@/lib/help/sections";

// S245 ARCH-S245-1 / ARCH-S245-2 / BEH-S245-1 / BEH-S245-2 / AC-S245-1 / AC-S245-2.

const spec = readFileSync(join(process.cwd(), LITMUS_SPEC_PATH), "utf8");
const handoff = litmusHandoff(spec);
const checks = litmusCheckIds(spec);
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function guidesNamedIn(text: string) {
  const line = text.split("\n").find((entry) => entry.startsWith("- L08 "))!;
  return line
    .slice(line.indexOf(":") + 1)
    .replace(/\.$/, "")
    .split(";")
    .map((phrase) => normalize(phrase));
}

function guidesWithoutCheck(guides: readonly { title: string }[], text: string) {
  const phrases = guidesNamedIn(text);
  return guides.filter(
    (guide) =>
      !phrases.some(
        (phrase) =>
          normalize(guide.title).startsWith(phrase) ||
          phrase.startsWith(normalize(guide.title)),
      ),
  );
}

describe("S245 litmus handoff", () => {
  it("names L01 to L34 in order", () => {
    expect(checks).toEqual(
      Array.from({ length: 34 }, (_, i) => `L${String(i + 1).padStart(2, "0")}`),
    );
  });

  it("ARCH-S245-1: names every hub section and every guide in the content model", () => {
    const sectionsLine = handoff.split("\n").find((entry) => entry.startsWith("- L03 "))!;
    for (const title of [
      "Start here",
      ...HELP_SECTIONS.map((section) => section.title),
      "Reference",
      "Glossary",
      "What changed",
    ])
      expect(sectionsLine, title).toContain(title);
    expect(guidesWithoutCheck(HELP_GUIDES, handoff)).toEqual([]);
  });

  it("AC-S245-1: a guide with no litmus check fails the coverage test", () => {
    expect(
      guidesWithoutCheck(
        [...HELP_GUIDES, { title: "Reconcile a bank deposit" }],
        handoff,
      ).map((guide) => guide.title),
    ).toEqual(["Reconcile a bank deposit"]);
  });
});

describe("S245 report template and validator", () => {
  const filled = (verdicts: Record<string, string> = {}, accepted = "Yes") =>
    LITMUS_REPORT_TEMPLATE(checks, "0123456789abcdef0123456789abcdef01234567")
      .replace("Run: <run number>", "Run: 1")
      .replace("Accepted: <Yes or No>", `Accepted: ${accepted}`)
      .split("\n")
      .map((line) => {
        const id = line.match(/^\| (L\d{2}) /)?.[1];
        if (!id) return line;
        const verdict = verdicts[id] ?? "Yes";
        return `| ${id} | ${verdict} | Observed in the rehearsal at the named commit. | none | ${verdict === "UNVERIFIED" ? "Needs a human observer with a printer." : "none"} |`;
      })
      .join("\n");

  it("ARCH-S245-2: the template has check, verdict, evidence, repair and blocker for every check", () => {
    const template = LITMUS_REPORT_TEMPLATE(checks);
    expect(template).toMatch(/\| Check \| Verdict \| Evidence \| Repair \| Blocker \|/);
    for (const check of checks) expect(template).toContain(`| ${check} |`);
    expect(validateLitmusReport(filled(), checks)).toEqual([]);
  });

  it("a report missing a verdict for any check fails its own validator", () => {
    const missing = filled()
      .split("\n")
      .filter((line) => !line.startsWith("| L17 "))
      .join("\n");
    expect(validateLitmusReport(missing, checks)).toContain(
      "L17 must appear exactly once.",
    );
    expect(validateLitmusReport(filled({ L09: "Maybe" }), checks)).toContain(
      "L09 has no verdict (Yes, No or UNVERIFIED).",
    );
  });

  it("BEH-S245-2 / AC-S245-2: a report with one No cannot be accepted", () => {
    expect(validateLitmusReport(filled({ L12: "No" }), checks)).toContain(
      "The report cannot be accepted while L12 is No.",
    );
    expect(validateLitmusReport(filled({ L12: "No" }, "No"), checks)).toEqual([]);
  });

  it("an UNVERIFIED check must name its evidence gap", () => {
    expect(validateLitmusReport(filled({ L25: "UNVERIFIED" }), checks)).toEqual([]);
    const silent = filled({ L25: "UNVERIFIED" }).replace(
      "Needs a human observer with a printer.",
      "none",
    );
    expect(validateLitmusReport(silent, checks)).toContain(
      "L25 is UNVERIFIED without naming the evidence gap.",
    );
  });

  it("every committed help hub litmus report is complete, and an accepted one has no No", () => {
    const dir = join(process.cwd(), "docs/evidence");
    const reports = existsSync(dir)
      ? readdirSync(dir).filter((file) =>
          /^help-hub-litmus-\d{4}-\d{2}-\d{2}\.md$/.test(file),
        )
      : [];
    for (const file of reports) {
      const text = readFileSync(join(dir, file), "utf8");
      const runs = text.split(/^## Run /m).slice(1);
      expect(runs.length, file).toBeGreaterThan(0);
      for (const run of runs) expect(validateLitmusReport(run, checks), file).toEqual([]);
    }
  });
});
