import {
  operationsProgramVerdict,
  type OperationsProgramEvidence,
  type OperationsExternalPrerequisite,
} from "./program-verdict";
export const completionPrerequisiteIds = [
  "B-VENDOROO-CONTRACT",
  "B-ACQUISITION-CONTRACT",
  "B-NATIVE-ANSWERING-CONTRACT",
  "B-COMMUNICATIONS-RUNTIME",
  "B-DOTLOOP-A1",
] as const;
/** Compare the native ledger with the actual selected specification declarations and register. */
export function validateOperationsProgramRegister(input: {
  ledger: OperationsProgramEvidence & {
    completionPrerequisites: OperationsExternalPrerequisite[];
  };
  readme: string;
  specifications: Map<string, string>;
}) {
  const { ledger, readme, specifications } = input;
  const registrations = new Map<string, { path: string; status: string }>();
  for (const match of readme.matchAll(/^\|\s*(S\d+)\s*\|\s*`([^`]+)`\s*\|([^\n]+)$/gm)) {
    if (!ledger.suites.some((s) => s.suite === match[1])) continue;
    if (registrations.has(match[1]))
      throw Error(`Duplicate program registration: ${match[1]}.`);
    registrations.set(match[1], { path: match[2], status: match[3] });
  }
  for (const suite of ledger.suites) {
    const path = (suite as typeof suite & { specification: string }).specification,
      registration = registrations.get(suite.suite),
      text = specifications.get(path);
    if (
      !registration ||
      registration.path !== path ||
      !text ||
      !text.includes(
        "<!-- feature-handoff: operations-communications-maintenance-2026-10 -->",
      ) ||
      !new RegExp(`^# ${suite.suite}\\b`, "m").test(text)
    )
      throw Error(`Missing or mismatched specification registration: ${suite.suite}.`);
    const status = /^> (?:Status|Intake): (READY|PENDING CLARIFICATION)\b/m.exec(
      text,
    )?.[1];
    const ready = status === "READY";
    if (
      !status ||
      (suite.contract === "ready") !== ready ||
      (ready
        ? !/^\s*READY\b/.test(registration.status)
        : !/^\s*PENDING CLARIFICATION\b/.test(registration.status))
    )
      throw Error(
        `Contract readiness differs from its specification/register: ${suite.suite}.`,
      );
    const declared = [
        ...text.matchAll(/^\|\s*(?:\*\*)?(R-S\d+-\d+)(?:\*\*)?(?:\s*:|\s+\u2014)/gm),
      ].map((m) => m[1]),
      mapped = ledger.requirements
        .filter((r) => r.suite === suite.suite)
        .map((r) => r.id);
    if (
      declared.length !== suite.requirements ||
      new Set(declared).size !== declared.length ||
      declared.some((id) => !mapped.includes(id)) ||
      mapped.some((id) => !declared.includes(id))
    )
      throw Error(
        `Requirement declarations differ from the native ledger: ${suite.suite}.`,
      );
  }
  const prerequisites = ledger.completionPrerequisites;
  if (
    !Array.isArray(prerequisites) ||
    prerequisites.length !== completionPrerequisiteIds.length ||
    new Set(prerequisites.map((p) => p.id)).size !== prerequisites.length ||
    completionPrerequisiteIds.some((id) => !prerequisites.some((p) => p.id === id))
  )
    throw Error(
      "Required program completion dependencies cannot be removed or duplicated.",
    );
  for (const p of prerequisites)
    if (
      p.requiredForCompletion !== true ||
      !p.suites.length ||
      p.suites.some((s) => !registrations.has(s)) ||
      !["pending_contract", "missing_input", "ready", "verified"].includes(p.state)
    )
      throw Error(`Invalid completion prerequisite: ${p.id}.`);
  return operationsProgramVerdict(ledger, prerequisites);
}
