// S242 R-S242-3 / ARCH-S242-2: runtime validation of every help content module. The schema test
// loads the whole manual through this validator; the gates reuse it. A malformed guide (a step with
// no expected result, an unknown section, a duplicate id) fails with its location named.
import { SECTION_HELP_IDS } from "@/lib/lease-renewal/section-help";
import { HELP_SECTION_IDS } from "@/lib/help/sections";
import type {
  HelpChangelogEntry,
  HelpControlRef,
  HelpControlRole,
  HelpGlossaryTerm,
  HelpGuide,
  HelpScreenReference,
} from "@/lib/help/types";
import { HELP_VERSION_PATTERN } from "@/lib/help/version";

export interface HelpManualInput {
  readonly guides: readonly HelpGuide[];
  readonly screens: readonly HelpScreenReference[];
  readonly glossary: readonly HelpGlossaryTerm[];
  readonly changelog: readonly HelpChangelogEntry[];
}

export const HELP_CONTROL_ROLES: readonly HelpControlRole[] = [
  "article",
  "button",
  "checkbox",
  "columnheader",
  "combobox",
  "complementary",
  "dialog",
  "group",
  "heading",
  "img",
  "label",
  "link",
  "list",
  "navigation",
  "option",
  "phase",
  "radio",
  "region",
  "row",
  "status",
  "summary",
  "switch",
  "tab",
  "table",
  "textbox",
];

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EFFECTS = new Set([
  "reads",
  "saves-in-app",
  "copies",
  "unsent-draft",
  "exact-confirmation",
  "explicit-send",
]);
const AUDIENCES = new Set(["All staff", "Renewal staff", "Approver or Admin", "Admin"]);

/** Returns every problem found; an empty list means the manual is well formed. */
export function validateHelpManual(manual: HelpManualInput): string[] {
  const problems: string[] = [];
  const guideIds = new Set<string>();
  const screenIds = new Set<string>();
  const sectionIds = new Set<string>(HELP_SECTION_IDS);
  const aboutIds = new Set<string>(SECTION_HELP_IDS);

  const text = (value: unknown, where: string) => {
    if (typeof value !== "string" || !value.trim()) problems.push(`${where} is empty.`);
  };
  const control = (value: HelpControlRef | undefined, where: string) => {
    if (!value) {
      problems.push(`${where} names no control.`);
      return;
    }
    text(value.label, `${where} control label`);
    if (!HELP_CONTROL_ROLES.includes(value.role))
      problems.push(
        `${where} control role "${String(value.role)}" is not a semantic role.`,
      );
    if (!["required", "conditional"].includes(value.availability))
      problems.push(`${where} control availability must be required or conditional.`);
    if (!Array.isArray(value.source) || !value.source.length)
      problems.push(`${where} control names no source file for its label.`);
    if (value.aboutId && !aboutIds.has(value.aboutId))
      problems.push(`${where} names unknown About id ${value.aboutId}.`);
  };

  for (const guide of manual.guides) {
    const where = `guide ${guide.id}`;
    if (!ID.test(guide.id)) problems.push(`${where} id is not kebab-case.`);
    if (guideIds.has(guide.id)) problems.push(`Duplicate guide id ${guide.id}.`);
    guideIds.add(guide.id);
    if (!sectionIds.has(guide.section))
      problems.push(`${where} is in unknown section ${guide.section}.`);
    text(guide.title, `${where} title`);
    text(guide.purpose, `${where} purpose`);
    text(guide.result, `${where} result`);
    if (!AUDIENCES.has(guide.audience))
      problems.push(`${where} audience "${guide.audience}" is not a role label.`);
    if (!ISO_DATE.test(guide.lastUpdated))
      problems.push(`${where} last updated date is not an ISO date.`);
    if (!guide.steps.length) problems.push(`${where} has no steps.`);
    if (!guide.doesNotDo.length)
      problems.push(`${where} has no "What this does not do" lines.`);
    for (const line of guide.doesNotDo)
      text(line, `${where} "What this does not do" line`);
    const stepIds = new Set<string>();
    guide.steps.forEach((step, index) => {
      const stepWhere = `${where} step ${index + 1} (${step.id})`;
      if (!ID.test(step.id)) problems.push(`${stepWhere} id is not kebab-case.`);
      if (stepIds.has(step.id)) problems.push(`${stepWhere} id is duplicated.`);
      stepIds.add(step.id);
      text(step.action, `${stepWhere} action`);
      text(step.result, `${stepWhere} expected result`);
      text(step.where, `${stepWhere} place`);
      if (!step.route?.startsWith("/"))
        problems.push(`${stepWhere} route is not a path.`);
      if (!EFFECTS.has(step.effect))
        problems.push(`${stepWhere} effect "${String(step.effect)}" is unknown.`);
      control(step.control, stepWhere);
      if (
        step.effect === "exact-confirmation" &&
        !/confirm/i.test(`${step.action} ${step.result} ${step.control.label}`)
      )
        problems.push(`${stepWhere} changes a source but names no exact confirmation.`);
      if (
        step.effect === "explicit-send" &&
        !/\b(send|schedule|resume)\b/i.test(`${step.action} ${step.control.label}`)
      )
        problems.push(`${stepWhere} sends but names no explicit Send or Schedule.`);
    });
  }

  for (const screen of manual.screens) {
    const where = `screen ${screen.id}`;
    if (!ID.test(screen.id)) problems.push(`${where} id is not kebab-case.`);
    if (screenIds.has(screen.id)) problems.push(`Duplicate screen id ${screen.id}.`);
    screenIds.add(screen.id);
    text(screen.title, `${where} title`);
    text(screen.summary, `${where} summary`);
    if (!AUDIENCES.has(screen.who))
      problems.push(`${where} who "${screen.who}" is not a role label.`);
    if (!ISO_DATE.test(screen.lastUpdated))
      problems.push(`${where} last updated date is not an ISO date.`);
    if (!screen.routes.length) problems.push(`${where} documents no route.`);
    for (const route of screen.routes)
      if (!route.startsWith("/")) problems.push(`${where} route ${route} is not a path.`);
    if (!screen.controls.length) problems.push(`${where} lists no controls.`);
    const labels = new Set<string>();
    screen.controls.forEach((entry, index) => {
      const controlWhere = `${where} control ${index + 1} (${entry.label})`;
      control(entry, controlWhere);
      text(entry.does, `${controlWhere} description`);
      if (!AUDIENCES.has(entry.who))
        problems.push(`${controlWhere} who "${entry.who}" is not a role label.`);
      const key = `${entry.region ?? ""}|${entry.role}|${entry.label}`;
      if (labels.has(key)) problems.push(`${controlWhere} is listed twice.`);
      labels.add(key);
    });
  }

  for (const guide of manual.guides) {
    for (const related of guide.relatedGuides)
      if (!guideIds.has(related))
        problems.push(`guide ${guide.id} links unknown guide ${related}.`);
    for (const related of guide.relatedScreens)
      if (!screenIds.has(related))
        problems.push(`guide ${guide.id} links unknown screen ${related}.`);
  }
  for (const screen of manual.screens)
    for (const guide of screen.guides)
      if (!guideIds.has(guide))
        problems.push(`screen ${screen.id} names unknown guide ${guide}.`);

  const termIds = new Set<string>();
  for (const term of manual.glossary) {
    if (!ID.test(term.id)) problems.push(`glossary ${term.id} id is not kebab-case.`);
    if (termIds.has(term.id)) problems.push(`Duplicate glossary id ${term.id}.`);
    termIds.add(term.id);
    text(term.term, `glossary ${term.id} term`);
    text(term.definition, `glossary ${term.id} definition`);
    for (const guide of term.relatedGuides ?? [])
      if (!guideIds.has(guide))
        problems.push(`glossary ${term.id} links unknown guide ${guide}.`);
  }

  if (!manual.changelog.length) problems.push("The changelog has no entry.");
  manual.changelog.forEach((entry, index) => {
    const where = `changelog entry ${index + 1}`;
    if (!HELP_VERSION_PATTERN.test(entry.version))
      problems.push(`${where} version ${entry.version} is not V<major>.<minor>.`);
    if (!ISO_DATE.test(entry.date)) problems.push(`${where} date is not an ISO date.`);
    text(entry.summary, `${where} summary`);
    if (!/^[a-f0-9]{64}$/.test(entry.contentDigest))
      problems.push(`${where} records no content digest.`);
    for (const guide of entry.affectedGuides)
      if (!guideIds.has(guide)) problems.push(`${where} names unknown guide ${guide}.`);
  });

  return problems;
}
