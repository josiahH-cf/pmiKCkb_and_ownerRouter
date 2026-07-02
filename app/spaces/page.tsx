import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  gatherNeedsDecisionInbox,
  renewalWaitingCount,
} from "@/lib/approval/needs-decision-gather";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { readConnectorPresence } from "@/lib/connections/connector-presence";
import { listProcessDefinitions } from "@/lib/firestore/workflows";
import { SPACE_CARD_STATE_LABEL, computeSpaceCardState } from "@/lib/space-card-state";
import { launchSpaces, spaceHref } from "@/lib/spaces";

export default async function SpacesPage() {
  const user = await requirePageCapability("read");

  // Real card state (A-IA-V2): reflect whether each Space has its process and connections. Both reads
  // are read-only and degrade gracefully — if Firestore is unavailable the cards fall back to
  // "needs-a-process" rather than 500-ing the directory.
  let definitionIds = new Set<string>();
  try {
    const definitions = await listProcessDefinitions(user);
    definitionIds = new Set(definitions.map((definition) => definition.id));
  } catch {
    definitionIds = new Set();
  }
  const presence = readConnectorPresence();

  // Value-free "waiting on you" interlock (S13 B5): the same merged inbox the Approval Queue and the
  // Console answer from, gathered once per request, so a Space card never says all-quiet while its
  // queue holds work. Counts only — no values, no reasons.
  const inbox = await gatherNeedsDecisionInbox(user);
  const waitingBySpace: Record<string, number> = {
    "lease-renewals": renewalWaitingCount(inbox),
  };

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Spaces</h1>
        <div className="grid three">
          {launchSpaces.map((space) => {
            const state = computeSpaceCardState(space, definitionIds, presence);
            const waiting = waitingBySpace[space.id] ?? 0;
            return (
              // The whole card is clickable (A-IA-V2), so the card has no nested interactive elements.
              <Link className="panel space-card" href={spaceHref(space)} key={space.id}>
                <h2>{space.name}</h2>
                <p className="muted">{space.processCategory}</p>
                <span className="review-pill">{SPACE_CARD_STATE_LABEL[state]}</span>
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
