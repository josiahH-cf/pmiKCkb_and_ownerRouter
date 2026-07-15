// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LeaseExecutionReadiness } from "@/components/lease-renewal/LeaseExecutionReadiness";
import { MaintenanceExecutionReadiness } from "@/components/maintenance/MaintenanceExecutionReadiness";
import {
  EXECUTION_ACTION_POLICIES,
  hasExecutionActionPolicy,
} from "@/lib/execution/risk-policy";
import type { ExternalActionDefinition } from "@/lib/external-execution/types";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { LEASE_EXECUTION_DEFINITIONS } from "@/lib/lease-renewal/execution/matrix";
import { MAINTENANCE_EXECUTION_DEFINITIONS } from "@/lib/maintenance/execution/matrix";

afterEach(cleanup);

describe.each([
  ["Lease", LeaseExecutionReadiness, LEASE_EXECUTION_DEFINITIONS],
  ["Maintenance", MaintenanceExecutionReadiness, MAINTENANCE_EXECUTION_DEFINITIONS],
] as const)("%s execution readiness", (_lane, Component, definitions) => {
  it("renders actionable, production-safe readiness for every action", () => {
    const { container } = render(<Component />);
    const actionCards = container.querySelectorAll("[data-action-key]");

    expect(actionCards).toHaveLength(definitions.length);

    for (const definition of definitions) {
      assertActionReadiness(container, definition);
    }
  });
});

function assertActionReadiness(
  container: HTMLElement,
  definition: ExternalActionDefinition,
) {
  const action = container.querySelector<HTMLElement>(
    `[data-action-key="${definition.key}"]`,
  );
  const registry = ACTION_REGISTRY_SEED.find((entry) => entry.key === definition.key);
  const immutableRisk = hasExecutionActionPolicy(definition.key)
    ? EXECUTION_ACTION_POLICIES[definition.key].defaultRisk
    : definition.risk;

  expect(action, `missing ${definition.key}`).not.toBeNull();
  expect(field(action!, "action-key")).toHaveTextContent(definition.key);
  expect(field(action!, "risk")).toHaveTextContent(immutableRisk);
  expect(field(action!, "registry-readiness")).toHaveTextContent(
    registry?.readiness ?? "Not registered",
  );
  expect(field(action!, "registry-evidence-status")).toHaveTextContent(
    registry?.evidence_status ?? "No evidence record",
  );
  expect(field(action!, "registry-evidence")).not.toBeEmptyDOMElement();
  expect(field(action!, "correction")).toHaveTextContent(definition.correction);

  const dependencyText = field(action!, "dependencies").textContent ?? "";
  if (definition.dependsOn.length === 0) {
    expect(dependencyText).toContain("None");
  } else {
    for (const dependency of definition.dependsOn) {
      expect(dependencyText).toContain(dependency);
    }
  }

  expect(field(action!, "production-gate")).toHaveTextContent(
    registry?.production_allowed === true
      ? "Registry-eligible — production_allowed=true"
      : "Closed",
  );
  expect(field(action!, "recommended-default")).toHaveTextContent(
    "Keep closed until the exact real contract, mapping, connection, permission, per-action live authority",
  );
  expect(field(action!, "local-evidence-limit")).toHaveTextContent(
    "local/emulator-only evidence",
  );
}

function field(action: HTMLElement, name: string): HTMLElement {
  const result = action.querySelector<HTMLElement>(`[data-readiness-field="${name}"]`);
  expect(result, `missing field ${name}`).not.toBeNull();
  return result!;
}
