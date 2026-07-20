import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  gatherNeedsDecisionInbox,
  renewalWaitingCount,
} from "@/lib/approval/needs-decision-gather";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { hasSpaceAccess } from "@/lib/auth/session";
import { readConnectorPresence } from "@/lib/connections/connector-presence";
import { listProcessDefinitions } from "@/lib/firestore/workflows";
import {
  SPACE_CARD_STATE_LABEL,
  SPACE_CARD_STATE_TONE,
  computeSpaceCardState,
} from "@/lib/space-card-state";
import { launchSpaces, spaceHref } from "@/lib/spaces";

export default async function SpacesPage() {
  const user = await requirePageCapability("read");
  const visibleSpaces = launchSpaces.filter(
    (space) =>
      user.scopes === undefined ||
      (space.scope !== undefined && hasSpaceAccess(user, space.scope)),
  );

  // Real card state (A-IA-V2): reflect whether each Space has its process and connections. Both reads
  // are read-only and degrade gracefully. FTU-4: if the definition read fails, mark it unavailable so
  // process-carrying cards read neutral "status unavailable" rather than a red "needs a process" wall.
  let definitionIds = new Set<string>();
  let definitionsUnavailable = false;
  try {
    const definitions = await listProcessDefinitions(user);
    definitionIds = new Set(definitions.map((definition) => definition.id));
  } catch {
    definitionIds = new Set();
    definitionsUnavailable = true;
  }
  const presence = readConnectorPresence();

  // Value-free "waiting on you" interlock (S13 B5): the same merged inbox the Approval Queue and the
  // Console answer from, gathered once per request, so a Space card never says all-quiet while its
  // queue holds work. Counts only — no values, no reasons.
  const inbox = hasSpaceAccess(user, "renewals")
    ? await gatherNeedsDecisionInbox(user)
    : undefined;
  const waitingBySpace: Record<string, number> = {
    "lease-renewals": inbox ? renewalWaitingCount(inbox) : 0,
  };

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Spaces</h1>
        <div className="grid three">
          {visibleSpaces.map((space) => {
            const state = computeSpaceCardState(
              space,
              definitionIds,
              presence,
              definitionsUnavailable,
            );
            const waiting = waitingBySpace[space.id] ?? 0;
            return (
              // The whole card is clickable (A-IA-V2), so the card has no nested interactive elements.
              <Link className="panel space-card" href={spaceHref(space)} key={space.id}>
                <h2>{space.name}</h2>
                <p className="muted">{space.processCategory}</p>
                <span
                  className="space-card-state-pill"
                  data-tone={SPACE_CARD_STATE_TONE[state]}
                >
                  {SPACE_CARD_STATE_LABEL[state]}
                </span>
                {waiting > 0 ? (
                  <span className="review-pill space-card-waiting">
                    {waiting} waiting on you
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
