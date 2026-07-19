import { AskForm, type ProcessOption } from "@/components/ask/AskForm";
import {
  ConsoleActionDeck,
  type ConsoleDeckCard,
} from "@/components/console/ConsoleActionDeck";
import {
  ConsoleProcessStrip,
  type ConsoleProcessItem,
} from "@/components/console/ConsoleProcessStrip";
import { ConsoleAnticipatedWork } from "@/components/console/ConsoleAnticipatedWork";
import { ConsoleLiveDataPanel } from "@/components/console/ConsoleLiveDataPanel";
import type { ConnectionStatus } from "@/components/ui";
import {
  buildAnticipatedWork,
  type AnticipatedWorkGroup,
} from "@/lib/anticipation/projection";
import { gatherDecisionAttention } from "@/lib/attention/decision-backlog";
import {
  resolveConnectionsState,
  resolveCoverageState,
} from "@/lib/ask/app-state-context";
import { can } from "@/lib/auth/roles";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { readConnectorPresence } from "@/lib/connections/connector-presence";
import { listProcessDefinitions } from "@/lib/firestore/workflows";
import {
  SPACE_CONNECTOR_IDS,
  SPACE_CARD_STATE_LABEL,
  computeSpaceCardState,
  type SpaceCardState,
} from "@/lib/space-card-state";
import { launchSpaces, spaceHref } from "@/lib/spaces";
import { resolveConsoleDataModes } from "@/lib/console/environment";
import { loadConsoleProjection } from "@/lib/console/live-data";

// Map the read-only Space card state onto a connection-style dot. Slice A keeps this dot palette
// (connected / action / none); the richer green/red/amber/purple card-color scheme lands in Slice B.
function toDotStatus(state: SpaceCardState): ConnectionStatus {
  if (state === "has-a-process") return "connected";
  if (state === "reference") return "none";
  return "action";
}

/**
 * The Console body — the app's action-first front door. Rendered at both `/` (home) and `/ask`
 * (the preserved route), so the Console is reachable from the brand/home and its own URL. Callers
 * wrap it in <AppShell> (this returns only the inner section, never the shell).
 *
 * Assembles three zones from ONE read-only, non-fatal gather: an always-visible action deck (what
 * needs a decision / connections to set up / space coverage), the AI question + dictation box, and a
 * read-only strip of the live processes. Editors additionally get the process picker for a SAFE
 * simulation (no system-of-record write). Nothing here executes an approval, send, or write — those
 * stay on their own gated surfaces, reached via each card's deep link.
 */
export async function ConsoleView({ user }: { user: AuthenticatedUser }) {
  const consoleModes = resolveConsoleDataModes();
  const consoleProjections = await Promise.all(
    consoleModes.map((mode) => loadConsoleProjection(user, mode)),
  );
  const hasTestWorkspace = consoleModes.some((mode) => mode.kind === "test");
  const canStartSimulation = can(user.role, "edit");
  const canApprove = can(user.role, "approve");
  const canSeeRenewals = hasSpaceAccess(user, "renewals");
  const visibleSpaces = launchSpaces.filter(
    (space) =>
      user.scopes === undefined ||
      (space.scope !== undefined && hasSpaceAccess(user, space.scope)),
  );
  const visibleDefinitionIds = new Set(
    visibleSpaces.flatMap((space) =>
      space.processDefinitionId ? [space.processDefinitionId] : [],
    ),
  );
  // One definitions read serves the process picker, the coverage card, and the process strip.
  let definitions: Awaited<ReturnType<typeof listProcessDefinitions>> = [];
  try {
    definitions = await listProcessDefinitions(user);
  } catch {
    definitions = [];
  }
  const scopedDefinitions =
    user.scopes === undefined
      ? definitions
      : definitions.filter((definition) => visibleDefinitionIds.has(definition.id));
  const processes: ProcessOption[] = canStartSimulation
    ? scopedDefinitions.map((definition) => ({
        id: definition.id,
        name: definition.name,
        status: definition.status,
      }))
    : [];

  const definitionIds = new Set(scopedDefinitions.map((definition) => definition.id));
  const startableDefinitionIds = new Set(
    scopedDefinitions
      .filter((definition) => definition.status !== "Retired")
      .map((definition) => definition.id),
  );
  const presence = readConnectorPresence();

  // Value-free app-state, gathered once and rendered server-side into the always-visible deck (no
  // click-to-reveal, no client refetch). Approvals come from the SAME merged needs-decision gather
  // every other surface answers from; every read is read-only and non-fatal.
  const decision = canSeeRenewals
    ? await gatherDecisionAttention(user)
    : {
        attention: { count: 0, signals: [] },
        inbox: {
          rows: [],
          counts: { total: 0, renewalFlags: 0, writebacksAwaiting: 0, queueItems: 0 },
        },
      };
  const inbox = decision.inbox;
  const connections = resolveConnectionsState();
  const visibleConnectorIds = new Set(
    visibleSpaces.flatMap((space) => SPACE_CONNECTOR_IDS[space.id] ?? []),
  );
  const connectionItems =
    user.scopes === undefined
      ? connections.items
      : connections.items.filter((item) => {
          const connectorId = item.href.split("#connector-")[1];
          return connectorId !== undefined && visibleConnectorIds.has(connectorId);
        });
  const coverage = await resolveCoverageState(user, definitionIds);
  const visibleSpaceHrefs = new Set(visibleSpaces.map((space) => spaceHref(space)));
  const coverageItems =
    user.scopes === undefined
      ? coverage.items
      : coverage.items.filter((item) => visibleSpaceHrefs.has(item.href));

  // Each deck card speaks one shared attention lane (S17 B3/B7): the deck now uses the same vocabulary
  // as the /notifications hub + the renewal desk. This suite adds NO scope filter of its own — the
  // rows above are already S16-scope-filtered (AC-S16-4); B7 only stamps the lane.
  const cards: ConsoleDeckCard[] = [
    {
      key: "approvals",
      title: "Needs your decision",
      lane: "decision",
      count: decision.attention.count,
      rows: inbox.rows.map((row) => ({
        label: row.label,
        detail: row.detail,
        href: row.href,
        itemId: row.canApproveInline ? row.itemId : undefined,
      })),
      emptyLabel: "Nothing needs your decision right now.",
      seeAllHref: "/approval-queue",
    },
    {
      key: "connections",
      title: "Connections to set up",
      lane: "connection",
      count: connectionItems.length,
      rows: connectionItems.map((item) => ({
        label: item.label,
        detail: item.detail,
        href: item.href,
      })),
      emptyLabel: "Every connector is set up.",
      seeAllHref: "/connections",
    },
    {
      key: "coverage",
      title: "Space coverage",
      lane: "coverage",
      count: coverageItems.length,
      rows: coverageItems.map((item) => ({
        label: item.label,
        detail: item.detail,
        href: item.href,
      })),
      emptyLabel: "Every space has its process and connections.",
      seeAllHref: "/spaces",
    },
  ];

  const processItems: ConsoleProcessItem[] = visibleSpaces
    .filter((space) => space.processDefinitionId)
    .map((space) => {
      const state = computeSpaceCardState(space, definitionIds, presence);
      return {
        id: space.id,
        name: space.name,
        category: space.processCategory,
        stateLabel: SPACE_CARD_STATE_LABEL[state],
        status: toDotStatus(state),
        href: spaceHref(space),
      };
    });

  // Anticipated work — a read-only, request-computed projection of coming-up / due process work, each
  // one click from starting the existing human-run process. Renewals-scoped like the approvals gather;
  // pure + non-fatal. The sample module is dynamically imported only in server-selected test mode;
  // ordinary production never constructs it and renders live-provider failure state instead.
  let anticipatedGroups: AnticipatedWorkGroup[] = [];
  if (canSeeRenewals && hasTestWorkspace) {
    try {
      const { getRenewalDeskView, SAMPLE_NOTICE_REFERENCE_DATE } =
        await import("@/lib/lease-renewal/sample-desk");
      anticipatedGroups = buildAnticipatedWork({
        referenceDateIso: SAMPLE_NOTICE_REFERENCE_DATE,
        deskView: getRenewalDeskView(),
      }).groups;
    } catch {
      anticipatedGroups = [];
    }
  }

  return (
    <section className="content console">
      <h1 className="section-title">Console</h1>
      {/* CON-1 (Note 2 §E): the Ask-a-Question portal leads the Console as its primary action.
          SEU-2 (§A.1): the explanatory intro paragraph is removed — the titled Ask box, decks,
          process strip, and Live-operations badge make the surface self-descriptive. */}
      <AskForm canStartSimulation={canStartSimulation} processes={processes} />
      {/* Decks stay on the Console (owner decision D-3: keep here AND mirror in Notifications). */}
      <ConsoleActionDeck canApprove={canApprove} cards={cards} />
      <ConsoleAnticipatedWork
        groups={anticipatedGroups}
        canStart={canStartSimulation}
        startableDefinitionIds={startableDefinitionIds}
      />
      <ConsoleProcessStrip items={processItems} />
      {/* CON-2 (Note 2 §E): Live Operations moves to the bottom as reference detail below the
          action-first zones (progressive disclosure). */}
      {consoleProjections.map((projection) => (
        <ConsoleLiveDataPanel key={projection.mode.kind} projection={projection} />
      ))}
    </section>
  );
}
