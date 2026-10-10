import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { validateOperationsProgramRegister } from "@/lib/operations/program-register";
function inputs() {
  const ledger = JSON.parse(
    readFileSync(
      "docs/evidence/operations-communications-maintenance-2026-10.json",
      "utf8",
    ),
  );
  return {
    ledger,
    readme: readFileSync("docs/feature-suites/README.md", "utf8"),
    specifications: new Map<string, string>(
      ledger.suites.map((s: { specification: string }) => [
        s.specification,
        readFileSync(s.specification, "utf8"),
      ]),
    ),
  };
}
it("checks all actual registered requirements and retains the five incomplete contracts and material dependencies", () => {
  const result = validateOperationsProgramRegister(inputs());
  expect(result.mappedRequirements).toBe(238);
  expect(result.pendingContracts).toEqual(["S208", "S217", "S218", "S220", "S221"]);
  expect(result.missingExternal).toHaveLength(5);
  expect(result.state).toBe("incomplete");
});
it("cannot mark a still-pending specification ready only by changing its ledger", () => {
  const value = inputs();
  value.ledger.suites.find((s: { suite: string }) => s.suite === "S208").contract =
    "ready";
  expect(() => validateOperationsProgramRegister(value)).toThrow(
    "Contract readiness differs",
  );
});
it("refuses a dropped actual registration, changed requirement identity or missing completion dependency", () => {
  const missing = inputs();
  missing.readme = missing.readme.replace(/^\| S208[^\n]+\n/m, "");
  expect(() => validateOperationsProgramRegister(missing)).toThrow("registration");
  const changed = inputs();
  changed.ledger.requirements.find((r: { id: string }) => r.id === "R-S183-1").id =
    "R-S183-99";
  expect(() => validateOperationsProgramRegister(changed)).toThrow(
    "Requirement declarations differ",
  );
  const external = inputs();
  external.ledger.completionPrerequisites.pop();
  expect(() => validateOperationsProgramRegister(external)).toThrow("cannot be removed");
});
