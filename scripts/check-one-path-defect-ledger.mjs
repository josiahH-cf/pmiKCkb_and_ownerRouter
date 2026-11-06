#!/usr/bin/env node
// S252 ARCH-S252-2: check the one-path defect ledger and staff walkthrough matrix
// (scripts/lib/one-path-walkthrough/defect-ledger.json) against the specification on this tree.
//
//   node scripts/check-one-path-defect-ledger.mjs                       the ledger on the tree
//   node scripts/check-one-path-defect-ledger.mjs --journey <journey.json>
//                                    also L60: no verified row is contradicted by that journey run
//
// journey.json is the journey driver's result in the rehearsal's private run directory
// (~/.local/state/pmi-kc-one-path-rehearsal/<run>/journey.json); it never goes to Git.
import { readFileSync } from "node:fs";

import {
  checkDefectLedger,
  readDefectLedger,
} from "./lib/one-path-walkthrough/ledger-check.mjs";

const argv = process.argv.slice(2);
const at = argv.indexOf("--journey");
const journey = at >= 0 ? JSON.parse(readFileSync(argv[at + 1], "utf8")) : null;
const ledger = readDefectLedger();
const problems = checkDefectLedger(ledger, { journey });
if (problems.length) {
  process.stderr.write(
    `One-path defect ledger check failed:\n- ${problems.join("\n- ")}\n`,
  );
  process.exitCode = 1;
} else {
  const verified = ledger.rows.filter((row) => row.result.state === "verified").length;
  process.stdout.write(
    `One-path defect ledger check passed: ${ledger.rows.length} rows (${verified} verified, ${ledger.rows.length - verified} open with a reason), ${ledger.matrix.length} walkthrough matrix rows${journey ? `, none contradicted by run ${journey.runId}` : ""}.\n`,
  );
}
