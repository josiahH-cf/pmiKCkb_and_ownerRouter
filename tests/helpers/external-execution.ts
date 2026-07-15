import type { ExecutionTechnicalGates } from "@/lib/execution/risk-policy";

/** Explicit test-only readiness facts for hermetic provider adapters. */
export function syntheticExternalTechnicalGates(
  overrides: Partial<ExecutionTechnicalGates> = {},
): ExecutionTechnicalGates {
  return {
    connectionReady: true,
    documentedEvidence: true,
    endpointDocumented: true,
    permissionGranted: true,
    productionAllowed: true,
    requiredValuesPresent: true,
    roleScopeAuthorized: true,
    sourceValidated: true,
    ...overrides,
  };
}
