/** Honest native-ledger projection: local app verification never substitutes for a pending contract or live prerequisite. */
export interface OperationsRequirementEvidence {
  id: string;
  suite: string;
  architecture: string;
  behavior: string;
  preservation: string;
  integration: string;
  evidence: unknown[];
  live_effect: string;
  human: string;
  integrationNotApplicableReason?: string;
}
export interface OperationsSuiteEvidence {
  suite: string;
  contract: string;
  implementation: string;
  delivery: string;
  requirements: number;
}
export interface OperationsProgramEvidence {
  handoff: string;
  state: string;
  suites: OperationsSuiteEvidence[];
  requirements: OperationsRequirementEvidence[];
  humanVerdict?: string;
}
export interface OperationsExternalPrerequisite {
  id: string;
  suites: string[];
  state: "pending_contract" | "missing_input" | "ready" | "verified" | "not_required";
  requiredForCompletion: boolean;
}
const expected = Array.from({ length: 44 }, (_, i) => `S${183 + i}`),
  gates = ["architecture", "behavior", "preservation", "integration"] as const;
function verified(r: OperationsRequirementEvidence) {
  return (
    gates.every(
      (g) =>
        r[g] === "passed" ||
        (g === "integration" &&
          r.integration === "not_applicable" &&
          !!r.integrationNotApplicableReason?.trim()),
    ) && r.evidence.length > 0
  );
}
export function operationsProgramVerdict(
  ledger: OperationsProgramEvidence,
  external: OperationsExternalPrerequisite[],
) {
  if (
    ledger.handoff !== "operations-communications-maintenance-2026-10" ||
    ledger.suites.length !== 44 ||
    ledger.requirements.length !== 238
  )
    throw Error(
      "The named program must retain all 44 suites and 238 mapped requirements.",
    );
  const suites = new Map(ledger.suites.map((s) => [s.suite, s]));
  if (suites.size !== 44 || expected.some((id) => !suites.has(id)))
    throw Error("The native suite register is incomplete or duplicated.");
  const ids = new Set<string>();
  for (const r of ledger.requirements) {
    if (
      ids.has(r.id) ||
      !suites.has(r.suite) ||
      !new RegExp(`^R-${r.suite}-[1-9][0-9]*$`).test(r.id)
    )
      throw Error(
        "A requirement identity or suite registration is missing, duplicated or mismatched.",
      );
    ids.add(r.id);
  }
  for (const s of suites.values())
    if (ledger.requirements.filter((r) => r.suite === s.suite).length !== s.requirements)
      throw Error(`Requirement count drifted for ${s.suite}.`);
  const verifiedRequirements = ledger.requirements.filter(verified).length,
    pendingContracts = ledger.suites
      .filter((s) => s.contract !== "ready")
      .map((s) => s.suite),
    missingExternal = external.filter(
      (e) => e.requiredForCompletion && !["verified", "not_required"].includes(e.state),
    ),
    undelivered = ledger.suites
      .filter((s) => s.delivery !== "verified_delivered")
      .map((s) => s.suite),
    complete =
      verifiedRequirements === 238 &&
      !pendingContracts.length &&
      !missingExternal.length &&
      !undelivered.length;
  if ((ledger.state === "complete" || ledger.state === "ALL_GATES_GREEN") && !complete)
    throw Error(
      "The program cannot be complete while required evidence, delivery or external contracts remain unresolved.",
    );
  return {
    state: complete ? "complete" : "incomplete",
    mappedRequirements: 238,
    verifiedRequirements,
    unverifiedRequirements: 238 - verifiedRequirements,
    pendingContracts,
    missingExternal: missingExternal.map((e) => ({
      id: e.id,
      suites: e.suites,
      state: e.state,
    })),
    undelivered,
    applicationEvidenceComplete: verifiedRequirements === 238,
    humanObserved: ledger.requirements.every((r) => r.human === "passed"),
    humanVerdict: ledger.humanVerdict ?? "NOT RUN — no human observer",
  };
}
