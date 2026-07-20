import type { AuthenticatedUser } from "@/lib/auth/session";
import type { ConsoleDataMode } from "@/lib/console/environment";
import { createRentvineConsoleProvider } from "@/lib/console/rentvine-live-provider";

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

// F-CONS-4: on the Console landing view a linked message is shown only as a presence indicator. Its
// subject, sender, recipients, and snippet never reach the front door; the full message is read under
// the workflow's authorized communication panel (reached via "Open workflow"). Only the message's own
// timestamp — which is not message content — rides along so the front door can say when it arrived.
export interface ConsoleMessagePresence {
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

// The front-door projection keeps every operational fact from the provider row but reduces the linked
// message to a presence indicator (see ConsoleMessagePresence).
export type ConsoleFrontDoorRow = Omit<ConsoleOperationalRow, "message"> & {
  message?: ConsoleField<ConsoleMessagePresence>;
};

export interface ConsoleSourceHealth {
  guidance: string;
  source: ConsoleSourceName;
  state: ConsoleFieldState;
}

export interface ConsoleProjection {
  mode: ConsoleDataMode;
  rows: ConsoleFrontDoorRow[];
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

const defaultFactories: ConsoleProviderFactories = {
  // This module is server-only through ConsoleView. The provider performs one bounded,
  // cached Rentvine read and never substitutes Test rows on failure.
  createLive: () => createRentvineConsoleProvider(),
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

// F-CONS-4: reduce the linked message to a presence indicator for the landing view. Subject, sender,
// recipients, and snippet are dropped here so they never serialize to the client; the workflow's own
// communication panel is the only place the full message is read.
function minimizeConsoleRow(row: ConsoleOperationalRow): ConsoleFrontDoorRow {
  const { message, ...rest } = row;
  return {
    ...rest,
    message: message
      ? {
          ...message,
          value: message.value ? { timestamp: message.value.timestamp } : undefined,
        }
      : undefined,
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
