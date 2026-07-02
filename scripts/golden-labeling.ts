// Golden-data labeling round-trip CLI (R3 math half). Turns a live-captured DRAFT into a reviewer
// WORKSHEET, and a team-reviewed worksheet into a VERIFIED golden set the harness gate enforces. Both the
// draft and the worksheet hold REAL client data, so they live only under the gitignored, in-boundary
// /golden-data/ tree and are NEVER committed; stdout here is counts-only (no cell values), mirroring
// scripts/capture-golden-data.ts. Ground truth is the team's review — never invented.
//
//   npm run golden:worksheet                                   # build a worksheet from the default draft
//   npm run golden:worksheet -- --in golden-data/captured/r3-bootstrap.json --out golden-data/worksheets/r3.json
//   # ...team reviews the worksheet JSON (decisions + field meanings, reviewed:true)...
//   npm run golden:apply-labels -- --worksheet golden-data/worksheets/r3.json   # write the verified set

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { CapturedScenarioSchema } from "../lib/lease-renewal/golden/load";
import {
  CapturedDraftSchema,
  GoldenWorksheetSchema,
  applyDecisions,
  buildWorksheet,
  summarizeDecisions,
} from "../lib/lease-renewal/golden/labeling";

const DEFAULT_DRAFT = "golden-data/captured/r3-bootstrap.json";
const DEFAULT_WORKSHEET_DIR = "golden-data/worksheets";

function readArg(name: string): string | undefined {
  const arg = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (arg) return arg.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function readDraft(path: string) {
  return CapturedDraftSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

function worksheetMode(): void {
  const inPath = resolve(readArg("--in") ?? DEFAULT_DRAFT);
  const draft = readDraft(inPath);
  const worksheet = buildWorksheet(draft);

  const outPath = resolve(
    readArg("--out") ?? join(DEFAULT_WORKSHEET_DIR, `${draft.name}.worksheet.json`),
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(worksheet, null, 2), "utf8");

  console.log("Golden worksheet built (counts only, no cell values):");
  console.log(
    JSON.stringify(
      {
        capturedName: worksheet.capturedName,
        candidateFlags: worksheet.entries.length,
        fieldsUnderReview: worksheet.fieldsUnderReview.length,
        reviewed: worksheet.reviewed,
      },
      null,
      2,
    ),
  );
  console.log(
    `Worksheet written to ${outPath} (gitignored, in-boundary). Review each entry with the team ` +
      "(decision + field meanings), set reviewed:true, then run golden:apply-labels.",
  );
}

function applyMode(): void {
  const worksheetPath = resolve(readArg("--worksheet") ?? "");
  if (!worksheetPath || worksheetPath === resolve("")) {
    console.error(
      "golden:apply-labels needs --worksheet <path to the reviewed worksheet JSON>.",
    );
    process.exitCode = 1;
    return;
  }
  const worksheet = GoldenWorksheetSchema.parse(
    JSON.parse(readFileSync(worksheetPath, "utf8")),
  );
  const inPath = resolve(
    readArg("--in") ?? join("golden-data/captured", `${worksheet.capturedName}.json`),
  );
  const draft = readDraft(inPath);

  const verified = applyDecisions(draft, worksheet);
  // Belt-and-suspenders: the written set must satisfy the harness loader's schema.
  CapturedScenarioSchema.parse(verified);

  const outPath = resolve(readArg("--out") ?? inPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(verified, null, 2), "utf8");

  const summary = summarizeDecisions(worksheet);
  console.log("Golden labels applied (counts only, no cell values):");
  console.log(
    JSON.stringify(
      {
        capturedName: verified.name,
        candidateFlags: summary.total,
        accepted: summary.accepted,
        rejectedAsFalsePositive: summary.rejected,
        severityCorrections: summary.severityCorrections,
        expectedFlags: verified.expectedFlags.length,
        labelsVerified: verified.labelsVerified,
      },
      null,
      2,
    ),
  );
  console.log(
    `Verified golden set written to ${outPath}. The harness gate (loadVerifiedCapturedScenarios) now ` +
      "enforces it; if any candidate was rejected, `npm test` will fail until the reconciliation math stops raising it.",
  );
}

function main(): void {
  const mode = process.argv[2];
  if (mode === "worksheet") {
    worksheetMode();
  } else if (mode === "apply") {
    applyMode();
  } else {
    console.error(
      "Usage: tsx scripts/golden-labeling.ts <worksheet|apply> [--in <draft>] [--out <path>] [--worksheet <path>]",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
