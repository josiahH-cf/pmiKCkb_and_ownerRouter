// S242 R-S242-8 / ARCH-S242-4: the help control-name gate, deterministic layer. Every control a
// guide step or screen reference names must appear, as the exact label the interface renders, in
// the repository files the content cites for it; an About trigger must match its section help
// label. A renamed control fails with the guide, step and expected label named. The mounted test
// (tests/unit/s242-help-controls-mounted.test.tsx) checks role and accessible name inside the
// owning region for the surfaces a component test can render, and the rehearsal browser check
// (`bash scripts/run-help-rehearsal.sh --controls`) checks every control on the real pages.
//
//   npm run verify:help-controls                 deterministic source check
//   npx tsx scripts/check-help-controls.mjs --emit <file>   control list for the browser check
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { HELP_MANUAL } from "@/lib/help";
import { HELP_CONTROL_ROLES } from "@/lib/help/schema";
import { SECTION_HELP } from "@/lib/lease-renewal/section-help";

const ENTITIES = [
  [/&apos;|&#39;|&rsquo;|&#x27;/g, "'"],
  [/&quot;|&ldquo;|&rdquo;/g, '"'],
  [/&amp;/g, "&"],
  [/&nbsp;| /g, " "],
  [/&hellip;/g, "…"],
  [/&larr;/g, "←"],
  [/&rarr;/g, "→"],
];

/** Source text as rendered words: JSX spacing artifacts and entities removed, whitespace folded. */
export function normalizeSourceText(text) {
  let value = text.replace(/\{"\s*"\}|\{' '\}|\{` `\}/g, " ");
  for (const [pattern, replacement] of ENTITIES)
    value = value.replace(pattern, replacement);
  return value.replace(/\s+/g, " ");
}

const browserRole = (audience) =>
  audience === "Admin"
    ? "Admin"
    : audience === "Approver or Admin"
      ? "Approver"
      : "Editor";

/** Every control the manual names, with its owner and the browser-check context. */
export function collectHelpControls(manual = HELP_MANUAL) {
  const controls = [];
  for (const guide of manual.guides)
    for (const step of guide.steps)
      controls.push({
        owner: `guide ${guide.id}`,
        step: step.id,
        label: step.control.label,
        controlRole: step.control.role,
        region: step.control.region,
        availability: step.control.availability,
        source: step.control.source,
        sourceText: step.control.sourceText,
        aboutId: step.control.aboutId,
        actions: step.control.actions,
        route: step.route,
        role: browserRole(guide.audience),
      });
  for (const screen of manual.screens)
    screen.controls.forEach((control) =>
      controls.push({
        owner: `screen ${screen.id}`,
        step: null,
        label: control.label,
        controlRole: control.role,
        region: control.region,
        availability: control.availability,
        source: control.source,
        sourceText: control.sourceText,
        aboutId: control.aboutId,
        actions: control.actions,
        route: control.route ?? screen.routes[0],
        role: browserRole(control.who),
      }),
    );
  return controls;
}

/** Pure check over explicit inputs; `readFile(path)` returns text or null when the file is absent. */
export function checkHelpControlSources(controls, readFile, sectionHelp = SECTION_HELP) {
  const problems = [];
  const cache = new Map();
  const text = (path) => {
    if (!cache.has(path)) {
      const raw = readFile(path);
      cache.set(path, raw === null ? null : normalizeSourceText(raw));
    }
    return cache.get(path);
  };
  for (const control of controls) {
    const where = `${control.owner}${control.step ? ` step ${control.step}` : ""}`;
    if (!HELP_CONTROL_ROLES.includes(control.controlRole)) {
      problems.push(
        `${where}: "${control.label}" uses unknown role ${control.controlRole}.`,
      );
      continue;
    }
    if (control.aboutId) {
      const help = sectionHelp[control.aboutId];
      if (!help) {
        problems.push(`${where}: About id ${control.aboutId} does not exist.`);
        continue;
      }
      if (control.label !== `About ${help.label}`)
        problems.push(
          `${where}: expected the About trigger "About ${help.label}" but the guide names "${control.label}".`,
        );
      continue;
    }
    const missing = control.source.filter((path) => text(path) === null);
    if (missing.length) {
      problems.push(
        `${where}: "${control.label}" cites missing source ${missing.join(", ")}.`,
      );
      continue;
    }
    if (control.sourceText) {
      const template = normalizeSourceText(control.sourceText).trim();
      // The label carries the template's literal fragments in order; placeholders match any text.
      const pattern = new RegExp(
        template
          .split(/\$?\{[^}]*\}/)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join(".+?"),
      );
      if (!control.source.some((path) => text(path).includes(template)))
        problems.push(
          `${where}: the interface no longer renders "${control.label}" (${control.controlRole}): template "${control.sourceText}" is missing from ${control.source.join(", ")}.`,
        );
      else if (!pattern.test(normalizeSourceText(control.label).trim()))
        problems.push(
          `${where}: "${control.label}" does not match its source template "${control.sourceText}".`,
        );
      continue;
    }
    const label = normalizeSourceText(control.label).trim();
    if (!control.source.some((path) => text(path).includes(label)))
      problems.push(
        `${where}: the interface no longer renders "${control.label}" (${control.controlRole}) in ${control.source.join(", ")}.`,
      );
  }
  return problems;
}

export function runHelpControlSources(root = process.cwd()) {
  const controls = collectHelpControls();
  const problems = checkHelpControlSources(controls, (path) => {
    const full = join(root, path);
    return existsSync(full) ? readFileSync(full, "utf8") : null;
  });
  return { controls, problems };
}

function main() {
  const emitIndex = process.argv.indexOf("--emit");
  const { controls, problems } = runHelpControlSources();
  if (emitIndex >= 0) {
    const file = process.argv[emitIndex + 1];
    writeFileSync(file, `${JSON.stringify({ controls }, null, 2)}\n`);
    console.log(`Emitted ${controls.length} help controls to ${file}.`);
  }
  if (problems.length) {
    console.error(`Help control-name gate FAILED with ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    `Help control-name gate passed: ${controls.length} named controls match the labels the interface renders.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
