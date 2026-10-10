import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import {
  operationsProgramVerdict,
  type OperationsProgramEvidence,
} from "@/lib/operations/program-verdict";
const original = () =>
  JSON.parse(
    readFileSync(
      "docs/evidence/operations-communications-maintenance-2026-10.json",
      "utf8",
    ),
  ) as OperationsProgramEvidence;
it("retains all actual mapped outcomes and five pending contracts without confusing authoring with delivery", () => {
  const result = operationsProgramVerdict(original(), []);
  expect(result.mappedRequirements).toBe(238);
  expect(result.pendingContracts).toEqual(["S208", "S217", "S218", "S220", "S221"]);
  expect(result.state).toBe("incomplete");
  expect(result.humanObserved).toBe(false);
});
it("a green deterministic app fixture remains incomplete with an unresolved Vendoroo or other required input", () => {
  const fixture = original();
  for (const r of fixture.requirements) {
    r.architecture = r.behavior = r.preservation = r.integration = "passed";
    r.evidence = ["synthetic model-verdict fixture only"];
    r.human = "not_run";
  }
  for (const s of fixture.suites) s.delivery = "verified_delivered";
  const hold = {
    id: "B-VENDOROO-CONTRACT",
    suites: ["S208"],
    state: "pending_contract" as const,
    requiredForCompletion: true,
  };
  let result = operationsProgramVerdict(fixture, [hold]);
  expect(result.applicationEvidenceComplete).toBe(true);
  expect(result.state).toBe("incomplete");
  fixture.suites.find((s) => s.suite === "S208")!.contract = "ready";
  result = operationsProgramVerdict(fixture, [hold]);
  expect(result.pendingContracts).toEqual(["S217", "S218", "S220", "S221"]);
  expect(result.missingExternal[0].id).toBe("B-VENDOROO-CONTRACT");
  fixture.state = "ALL_GATES_GREEN";
  expect(() => operationsProgramVerdict(fixture, [hold])).toThrow("cannot be complete");
});
it("refuses dropped/duplicated requirements and a delivered claim without implementation evidence", () => {
  const fixture = original();
  fixture.requirements[1] = { ...fixture.requirements[0] };
  expect(() => operationsProgramVerdict(fixture, [])).toThrow("duplicated");
  const next = original();
  next.state = "complete";
  for (const s of next.suites) {
    s.delivery = "verified_delivered";
    s.contract = "ready";
  }
  expect(() => operationsProgramVerdict(next, [])).toThrow("cannot be complete");
});
