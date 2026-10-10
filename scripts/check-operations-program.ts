import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateOperationsProgramRegister } from "../lib/operations/program-register";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  const ledger = JSON.parse(
    readFileSync(
      resolve(root, "docs/evidence/operations-communications-maintenance-2026-10.json"),
      "utf8",
    ),
  );
  const specifications = new Map<string, string>(
    ledger.suites.map((s: { specification: string }) => [
      s.specification,
      readFileSync(resolve(root, s.specification), "utf8"),
    ]),
  );
  const result = validateOperationsProgramRegister({
    ledger,
    readme: readFileSync(resolve(root, "docs/feature-suites/README.md"), "utf8"),
    specifications,
  });
  console.log(
    `Operations program ledger valid: 44 suites; ${result.mappedRequirements} mapped requirements; ${result.verifiedRequirements} verified; ${result.pendingContracts.length} pending contracts; ${result.missingExternal.length} unresolved completion prerequisites; program ${result.state}. Human: ${result.humanVerdict}.`,
  );
} catch (error) {
  console.error(
    `Operations program ledger invalid: ${error instanceof Error ? error.message : "invalid evidence"}`,
  );
  process.exitCode = 1;
}
