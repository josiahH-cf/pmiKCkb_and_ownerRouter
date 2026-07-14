import { assertFixtureMode, type ConsoleDataMode } from "@/lib/console/environment";
import type { ConsoleDataProvider, ConsoleOperationalRow } from "@/lib/console/live-data";

const OBSERVED_AT = "2026-07-14T12:00:00.000Z";

export function createConsoleFixtureProvider(mode: ConsoleDataMode): ConsoleDataProvider {
  assertFixtureMode(mode);
  return {
    async load() {
      return {
        rows: fixtureRows(),
        sourceHealth: [
          {
            guidance: `Synthetic fixture provider (${mode.deploymentName}).`,
            source: "Rentvine" as const,
            state: "fresh" as const,
          },
          {
            guidance: `Synthetic fixture provider (${mode.deploymentName}).`,
            source: "PMI KC workflow" as const,
            state: "fresh" as const,
          },
          {
            guidance: `Synthetic fixture provider (${mode.deploymentName}).`,
            source: "Gmail" as const,
            state: "fresh" as const,
          },
        ],
      };
    },
  };
}

function fixtureRows(): ConsoleOperationalRow[] {
  return [
    fixtureRow("lease-renewals", "test-renewal", "Lease renewal test workflow"),
    fixtureRow(
      "maintenance-work-order-intake",
      "test-maintenance",
      "Maintenance test workflow",
    ),
  ];
}

function fixtureRow(
  spaceId: string,
  rowKey: string,
  workflowValue: string,
): ConsoleOperationalRow {
  return {
    currentRent: field("Rentvine", "$1,250"),
    leaseEnd: field("Rentvine", "2026-08-31"),
    message: {
      ...field("Gmail", {
        observedAt: OBSERVED_AT,
        recipients: ["fixture-recipient@example.test"],
        sender: "fixture-sender@example.test",
        snippet: "Synthetic workflow-linked message preview.",
        subject: "Synthetic test communication",
        timestamp: OBSERVED_AT,
      }),
    },
    property: field("Rentvine", "Fixture property · Unit 1"),
    rowKey,
    spaceId,
    tenant: field("Rentvine", "Fixture household"),
    workflow: field("PMI KC workflow", workflowValue),
    workflowHref: spaceId === "lease-renewals" ? "/lease-renewal" : "/maintenance",
  };
}

function field<T>(source: "Rentvine" | "PMI KC workflow" | "Gmail", value: T) {
  return { observedAt: OBSERVED_AT, source, state: "fresh" as const, value };
}
