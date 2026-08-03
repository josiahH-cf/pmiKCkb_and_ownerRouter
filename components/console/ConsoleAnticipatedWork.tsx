import Link from "next/link";
import { StartRunButton } from "@/components/console/StartRunButton";

import type {
  AnticipatedUrgency,
  AnticipatedWorkGroup,
} from "@/lib/anticipation/projection";

// Permanent, honest posture: the lane is computed on Console load, never on a timer, and never executes.
export const ANTICIPATION_CAPTION =
  "Computed on request · it runs only when you open the Console, and a person sends every message.";
export const ANTICIPATION_ALL_CLEAR = "All clear. Nothing is coming up right now.";

const URGENCY_LABEL: Record<AnticipatedUrgency, string> = {
  overdue: "Overdue",
  "due-soon": "Due soon",
  upcoming: "Upcoming",
  "all-clear": "All clear",
  "no-source-yet": "Waiting on a signal",
};

/**
 * The Console "Anticipated work" lane. A read-only projection of the coming-up / due work across the
 * owner-named processes. An Editor may start one ordinary app-plane run; other rows are read-only
 * deep links. Starting a run executes no provider, send, or system-of-record write.
 */
export function ConsoleAnticipatedWork({
  groups,
  canStart,
  startableDefinitionIds,
}: Readonly<{
  groups: readonly AnticipatedWorkGroup[];
  canStart: boolean;
  startableDefinitionIds: ReadonlySet<string>;
}>) {
  if (groups.length === 0) {
    return null;
  }
  const hasWork = groups.some((group) => group.count > 0);

  return (
    <section aria-label="Anticipated work" className="console-anticipated">
      <h2 className="console-strip-title">Anticipated work</h2>
      {hasWork ? null : <p className="muted">{ANTICIPATION_ALL_CLEAR}</p>}
      <div className="grid three">
        {groups.map((group) => (
          <article
            className="panel console-anticipated-item"
            data-urgency={group.urgency}
            key={group.spaceId}
          >
            <span className="console-anticipated-name">{group.spaceName}</span>
            <span className="muted">
              {group.category} · {URGENCY_LABEL[group.urgency]}
            </span>
            <span className="console-anticipated-summary">{group.summary}</span>
            {renderStartControl(group, canStart, startableDefinitionIds)}
          </article>
        ))}
      </div>
      <p className="muted console-anticipated-caption">{ANTICIPATION_CAPTION}</p>
    </section>
  );
}

function renderStartControl(
  group: AnticipatedWorkGroup,
  canStart: boolean,
  startableDefinitionIds: ReadonlySet<string>,
) {
  // No startable work: an un-fed (no-source-yet) or all-clear family shows its summary only.
  if (group.count === 0) {
    return null;
  }
  if (
    canStart &&
    group.processDefinitionId &&
    startableDefinitionIds.has(group.processDefinitionId)
  ) {
    return (
      <StartRunButton
        fallbackHref={group.startHref}
        processDefinitionId={group.processDefinitionId}
      />
    );
  }
  // Viewer, missing definition, or retired definition: read-only deep link.
  return (
    <Link className="console-anticipated-open" href={group.startHref}>
      Open the space
    </Link>
  );
}
