import type { AuthenticatedUser } from "@/lib/auth/session";
import type { ConsoleDataMode } from "@/lib/console/environment";
import { boundConsoleSnippet } from "@/lib/console/snippet";

export type ConsoleFieldState = "fresh" | "stale" | "needs_review" | "unavailable";
export type ConsoleSourceName = "Rentvine" | "PMI KC workflow" | "Gmail";

export interface ConsoleField<T> {
  observedAt?: string;
  source: ConsoleSourceName;
  state: ConsoleFieldState;
  value?: T;
}

export interface ConsoleMessageMetadata {
  observedAt: string;
  recipients: readonly string[];
  sender: string;
  snippet: string;
  subject: string;
  timestamp: string;
}

export interface ConsoleOperationalRow {
  currentRent: ConsoleField<string>;
  leaseEnd: ConsoleField<string>;
  message?: ConsoleField<ConsoleMessageMetadata>;
  property: ConsoleField<string>;
  rowKey: string;
  spaceId: string;
  tenant: ConsoleField<string>;
  workflow: ConsoleField<string>;
  workflowHref: string;
}

export interface ConsoleSourceHealth {
  guidance: string;
  source: ConsoleSourceName;
  state: ConsoleFieldState;
}

export interface ConsoleProjection {
  mode: ConsoleDataMode;
  rows: ConsoleOperationalRow[];
  sourceHealth: ConsoleSourceHealth[];
}

export interface ConsoleDataProvider {
  load(actor: AuthenticatedUser): Promise<{
    rows: ConsoleOperationalRow[];
    sourceHealth: ConsoleSourceHealth[];
  }>;
}

export interface ConsoleProviderFactories {
  createLive(): ConsoleDataProvider;
  createTest(
    mode: Extract<ConsoleDataMode, { kind: "test" }>,
  ): Promise<ConsoleDataProvider>;
}

export async function loadConsoleProjection(
  actor: AuthenticatedUser,
  mode: ConsoleDataMode,
  factories: ConsoleProviderFactories = defaultFactories,
): Promise<ConsoleProjection> {
  const provider =
    mode.kind === "live" ? factories.createLive() : await factories.createTest(mode);
  try {
    const loaded = await provider.load(actor);
    return {
      mode,
      rows: loaded.rows.filter((row) => canSeeRow(actor, row)).map(minimizeConsoleRow),
      sourceHealth: loaded.sourceHealth,
    };
  } catch {
    return {
      mode,
      rows: [],
      sourceHealth: unavailableSourceHealth(),
    };
  }
}

class LiveConsoleProvider implements ConsoleDataProvider {
  async load() {
    // Live adapters are intentionally not inferred from demo/sample modules. Until the separately
    // approved Rentvine/Gmail reads are wired, production renders named unavailable states.
    return { rows: [], sourceHealth: unavailableSourceHealth() };
  }
}

const defaultFactories: ConsoleProviderFactories = {
  createLive: () => new LiveConsoleProvider(),
  createTest: async (mode) => {
    const { createConsoleFixtureProvider } =
      await import("@/lib/console/test-data-provider");
    return createConsoleFixtureProvider(mode);
  },
};

function canSeeRow(actor: AuthenticatedUser, row: ConsoleOperationalRow) {
  if (actor.scopes === undefined) return true;
  const requiredScope = row.spaceId === "lease-renewals" ? "renewals" : "maintenance";
  return actor.scopes.includes(requiredScope);
}

function minimizeConsoleRow(row: ConsoleOperationalRow): ConsoleOperationalRow {
  return {
    ...row,
    message: row.message?.value
      ? {
          ...row.message,
          value: {
            observedAt: row.message.value.observedAt,
            recipients: row.message.value.recipients.slice(0, 10),
            sender: row.message.value.sender,
            snippet: boundConsoleSnippet(row.message.value.snippet),
            subject: row.message.value.subject,
            timestamp: row.message.value.timestamp,
          },
        }
      : row.message,
  };
}

function unavailableSourceHealth(): ConsoleSourceHealth[] {
  return [
    {
      guidance:
        "Check the Rentvine read connection, then retry. Test data was not substituted.",
      source: "Rentvine",
      state: "unavailable",
    },
    {
      guidance: "Check Firestore workflow state, then retry.",
      source: "PMI KC workflow",
      state: "unavailable",
    },
    {
      guidance: "Check the workflow-linked Gmail read connection, then retry.",
      source: "Gmail",
      state: "unavailable",
    },
  ];
}
