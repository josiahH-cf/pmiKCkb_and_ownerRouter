import { AskForm, type ProcessOption } from "@/components/ask/AskForm";
import {
  ConsoleActionDeck,
  type ConsoleDeckCard,
} from "@/components/console/ConsoleActionDeck";
import {
  ConsoleProcessStrip,
  type ConsoleProcessItem,
} from "@/components/console/ConsoleProcessStrip";
import type { ConnectionStatus } from "@/components/ui";
import { gatherNeedsDecisionInbox } from "@/lib/approval/needs-decision-gather";
import {
  resolveConnectionsState,
  resolveCoverageState,
} from "@/lib/ask/app-state-context";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { readConnectorPresence } from "@/lib/connections/connector-presence";
import { listProcessDefinitions } from "@/lib/firestore/workflows";
import {
  SPACE_CARD_STATE_LABEL,
  computeSpaceCardState,
  type SpaceCardState,
} from "@/lib/space-card-state";
import { launchSpaces, spaceHref } from "@/lib/spaces";

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
  const canStartSimulation = can(user.role, "edit");
  // One definitions read serves the process picker, the coverage card, and the process strip.
  let definitions: Awaited<ReturnType<typeof listProcessDefinitions>> = [];
  try {
    definitions = await listProcessDefinitions(user);
  } catch {
    definitions = [];
  }
  const processes: ProcessOption[] = canStartSimulation
    ? definitions.map((definition) => ({
        id: definition.id,
        name: definition.name,
        status: definition.status,
      }))
    : [];

  const definitionIds = new Set(definitions.map((definition) => definition.id));
  const presence = readConnectorPresence();

  // Value-free app-state, gathered once and rendered server-side into the always-visible deck (no
  // click-to-reveal, no client refetch). Approvals come from the SAME merged needs-decision gather
  // every other surface answers from; every read is read-only and non-fatal.
  const inbox = await gatherNeedsDecisionInbox(user);
  const connections = resolveConnectionsState();
  const coverage = await resolveCoverageState(user, definitionIds);

  const cards: ConsoleDeckCard[] = [
    {
      key: "approvals",
      title: "Needs your decision",
      count: inbox.counts.total,
      rows: inbox.rows.map((row) => ({
        label: row.label,
        detail: row.detail,
        href: row.href,
      })),
      emptyLabel: "Nothing needs your decision right now.",
      seeAllHref: "/approval-queue",
    },
    {
      key: "connections",
      title: "Connections to set up",
      count: connections.items.length,
      rows: connections.items.map((item) => ({
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
      count: coverage.items.length,
      rows: coverage.items.map((item) => ({
        label: item.label,
        detail: item.detail,
        href: item.href,
      })),
      emptyLabel: "Every space has its process and connections.",
      seeAllHref: "/spaces",
    },
  ];

  const processItems: ConsoleProcessItem[] = launchSpaces
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

  return (
    <section className="content console">
      <h1 className="section-title">Console</h1>
      <p className="muted">
        See what needs your attention, ask a grounded question, or start a process as a
        test run. Answers cite approved sources, and a test run never touches a system of
        record.
      </p>
      <ConsoleActionDeck cards={cards} />
      <AskForm canStartSimulation={canStartSimulation} processes={processes} />
      <ConsoleProcessStrip items={processItems} />
    </section>
  );
}
