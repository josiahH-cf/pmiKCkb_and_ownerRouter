// Decisions-to-golden distillation CLI (S13 Wave 3 H3). OFFLINE + in-boundary: it reads a golden
// WORKSHEET and a value-free DECISIONS export from the gitignored /golden-data/ tree, PRE-FILLS the
// worksheet's PENDING entries with suggestions, and writes it back. It NEVER auto-verifies (reviewed
// stays false; the team still confirms + runs golden:apply-labels) and prints COUNTS ONLY — no cell
// values, no client data. The decisions export is value-free by construction: [{fieldKey,
// resolution_kind}] only (produce it in-boundary with toDecisionSignals; never commit it).
//
//   npm run golden:distill -- --worksheet golden-data/worksheets/r3.json --decisions golden-data/decisions/r3.json

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import { GoldenWorksheetSchema } from "../lib/lease-renewal/golden/labeling";
import { distillDecisionsIntoWorksheet } from "../lib/lease-renewal/golden/distillation";

const DecisionSignalsSchema = z.array(
  z.object({
    fieldKey: z.string().min(1),
    resolution_kind: z.enum(["pick_source", "corrected_value", "flag_incorrect"]),
  }),
);

function readArg(name: string): string | undefined {
  const arg = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (arg) return arg.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

export function main(): void {
  const worksheetPath = resolve(readArg("--worksheet") ?? "");
  const decisionsPath = resolve(readArg("--decisions") ?? "");
  if (!worksheetPath || worksheetPath === resolve("")) {
    console.error(
      "golden:distill needs --worksheet <path to the golden worksheet JSON> and --decisions <path to the value-free decisions JSON>.",
    );
    process.exitCode = 1;
    return;
  }
  if (!decisionsPath || decisionsPath === resolve("")) {
    console.error(
      "golden:distill needs --decisions <path to the value-free decisions JSON: [{fieldKey, resolution_kind}]>.",
    );
    process.exitCode = 1;
    return;
  }

  const worksheet = GoldenWorksheetSchema.parse(
    JSON.parse(readFileSync(worksheetPath, "utf8")),
  );
  const signals = DecisionSignalsSchema.parse(
    JSON.parse(readFileSync(decisionsPath, "utf8")),
  );

  const { worksheet: prefilled, summary } = distillDecisionsIntoWorksheet(
    worksheet,
    signals,
  );

  // A worksheet holds real client cell values, so it must NEVER be written outside the gitignored
  // in-boundary golden-data/ tree (the redaction gate only guards that tree). Refuse an --out escape.
  const outPath = resolve(readArg("--out") ?? worksheetPath);
  const goldenRoot = resolve("golden-data");
  if (outPath !== goldenRoot && !outPath.startsWith(goldenRoot + sep)) {
    console.error(
      "Refusing to write the worksheet (it holds client cell values) outside the gitignored golden-data/ tree. Pass --out under golden-data/.",
    );
    process.exitCode = 1;
    return;
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(prefilled, null, 2), "utf8");

  console.log(
    "Distilled recorded decisions into the worksheet (counts only, no cell values):",
  );
  console.log(
    JSON.stringify(
      {
        entries: summary.entries,
        prefilledSuggestions: summary.prefilled,
        matchedFields: summary.matchedFields,
        ambiguousFields: summary.ambiguousFields,
        unmatchedFields: summary.unmatchedFields,
        alreadyDecided: summary.alreadyDecided,
        reviewed: prefilled.reviewed,
      },
      null,
      2,
    ),
  );
  console.log(
    `Pre-filled worksheet written to ${outPath} (gitignored, in-boundary). These are SUGGESTIONS ` +
      "only — the team still reviews each entry, confirms field meanings, sets reviewed:true, then runs golden:apply-labels.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
