// S242 R-S242-10 / S243 R-S243-4 / S244 R-S244-4: the help content rules gate. Help describes only
// what exists and works today. It refuses em dashes and the rejected jargon from the copy-voice
// gate, and refuses roadmap and hold language: the phrases below, hold identifiers, references to
// the hold register or client decisions, and client names. It scans every guide, screen
// reference, glossary term and changelog entry, the renewal About panels and every in-app help
// text in the S244 disposition table. Verbatim interface labels (verified by the control-name
// gate) are exempt from the phrase rules only, because a guide must copy them exactly.
//
//   npm run verify:help-content
import { pathToFileURL } from "node:url";

import { HELP_MANUAL } from "@/lib/help";
import { HELP_COPY_DISPOSITIONS } from "@/lib/help/copy-disposition";
import { HELP_SCENE_MANIFEST } from "@/lib/help/scenes";
import { HELP_SECTIONS } from "@/lib/help/sections";
import { SECTION_HELP } from "@/lib/lease-renewal/section-help";
import { FORBIDDEN_JARGON } from "./check-copy-voice.mjs";

/** Roadmap and hold phrasing; a constant so it can be extended. Matched case-insensitively. */
export const HELP_FORBIDDEN_PHRASES = [
  "not yet",
  "future",
  "coming soon",
  "planned",
  "has not been proven",
  "pending client",
  "blocked on",
  "roadmap",
  "hold register",
  "client decision",
  "open blockers",
  "open-blockers",
];

/** Superseded process statements S244 removed; help copy must never say them again. */
export const HELP_STALE_STATEMENTS = [
  "Admin approval reason",
  "approval note",
  "Dan approves",
  "does not read them yet",
  "lets an Admin confirm each supported provider action",
];

/** Hold identifiers (B- codes and U1 to U9) and client names. */
export const HELP_FORBIDDEN_PATTERNS = [
  { rule: "hold identifier", pattern: /\bB-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\b/ },
  { rule: "hold identifier", pattern: /\bU[1-9]\b/ },
  { rule: "client name", pattern: /\b(?:Dan|Josiah)\b/ },
];

const EM_DASH = "—";

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every help string with its location; `label` strings are verbatim interface labels. */
export function collectHelpStrings(manual = HELP_MANUAL, extras = {}) {
  const strings = [];
  const add = (location, text, kind = "prose") => {
    if (typeof text === "string" && text.trim()) strings.push({ location, text, kind });
  };
  for (const section of manual.sections ?? HELP_SECTIONS) {
    add(`section ${section.id} title`, section.title);
    add(`section ${section.id} summary`, section.summary);
  }
  for (const guide of manual.guides) {
    const at = `guide ${guide.id}`;
    add(`${at} title`, guide.title);
    add(`${at} purpose`, guide.purpose);
    add(`${at} result`, guide.result);
    guide.prerequisites.forEach((line, i) => add(`${at} prerequisite ${i + 1}`, line));
    guide.doesNotDo.forEach((line, i) =>
      add(`${at} "What this does not do" ${i + 1}`, line),
    );
    for (const step of guide.steps) {
      add(`${at} step ${step.id} action`, step.action);
      add(`${at} step ${step.id} result`, step.result);
      add(`${at} step ${step.id} place`, step.where);
      add(`${at} step ${step.id} note`, step.note);
      add(`${at} step ${step.id} control`, step.control.label, "label");
    }
  }
  for (const screen of manual.screens) {
    const at = `screen ${screen.id}`;
    add(`${at} title`, screen.title);
    add(`${at} summary`, screen.summary);
    for (const control of screen.controls) {
      add(`${at} control ${control.label}`, control.label, "label");
      add(`${at} control ${control.label} description`, control.does);
    }
  }
  for (const term of manual.glossary) {
    add(`glossary ${term.id} term`, term.term);
    add(`glossary ${term.id} definition`, term.definition);
  }
  for (const entry of manual.changelog) add(`changelog ${entry.version}`, entry.summary);
  for (const scene of manual.scenes ?? HELP_SCENE_MANIFEST.scenes) {
    add(`scene ${scene.id} alt text`, scene.alt);
    add(`scene ${scene.id} caption`, scene.caption);
  }
  for (const [id, help] of Object.entries(extras.sectionHelp ?? SECTION_HELP)) {
    const at = `About panel ${id}`;
    add(`${at} label`, help.label, "label");
    add(`${at} purpose`, help.purpose);
    (help.steps ?? []).forEach((line, i) => add(`${at} step ${i + 1}`, line));
    add(`${at} saves`, help.saves);
    add(`${at} does not`, help.notDone);
    add(`${at} next`, help.next?.label);
  }
  for (const entry of extras.dispositions ?? HELP_COPY_DISPOSITIONS) {
    if (entry.disposition === "remove" || entry.kind === "about") continue;
    add(`in-app help ${entry.kind} (${entry.location})`, entry.text);
  }
  return strings;
}

/** Pure evaluation; returns problems naming the location and the rule. */
export function evaluateHelpContent(strings) {
  const problems = [];
  const labels = [
    ...new Set(
      strings.filter((entry) => entry.kind === "label").map((entry) => entry.text),
    ),
  ].sort((a, b) => b.length - a.length);
  for (const entry of strings) {
    if (entry.text.includes(EM_DASH)) problems.push(`${entry.location}: em dash.`);
    const lower = entry.text.toLowerCase();
    for (const term of FORBIDDEN_JARGON)
      if (lower.includes(term.toLowerCase()))
        problems.push(`${entry.location}: rejected jargon "${term}".`);
    for (const statement of HELP_STALE_STATEMENTS)
      if (lower.includes(statement.toLowerCase()))
        problems.push(`${entry.location}: superseded statement "${statement}".`);
    if (entry.kind === "label") continue;
    // A verbatim interface label quoted in prose is exempt from the phrase rules only.
    let prose = entry.text;
    for (const label of labels) prose = prose.replaceAll(label, " ");
    for (const phrase of HELP_FORBIDDEN_PHRASES)
      if (new RegExp(`\\b${escape(phrase)}\\b`, "i").test(prose))
        problems.push(`${entry.location}: roadmap or hold phrase "${phrase}".`);
    for (const { rule, pattern } of HELP_FORBIDDEN_PATTERNS) {
      const match = prose.match(pattern);
      if (match) problems.push(`${entry.location}: ${rule} "${match[0]}".`);
    }
  }
  return problems;
}

function main() {
  const strings = collectHelpStrings();
  const problems = evaluateHelpContent(strings);
  if (problems.length) {
    console.error(`Help content rules gate FAILED with ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    `Help content rules gate passed: ${strings.length} help strings, no em dash, jargon, roadmap or hold language. Forbidden phrases: ${HELP_FORBIDDEN_PHRASES.join(", ")}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
