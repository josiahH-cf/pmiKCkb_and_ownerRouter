import Link from "next/link";

import { StartTestRunButton } from "@/components/console/StartTestRunButton";
import type {
  AnticipatedUrgency,
  AnticipatedWorkGroup,
} from "@/lib/anticipation/projection";

// Permanent, honest posture: the lane is computed on Console load, never on a timer, and never executes.
export const ANTICIPATION_CAPTION =
  "Computed on request · this never runs on a schedule and never sends.";
export const ANTICIPATION_ALL_CLEAR = "All clear — nothing is coming up right now.";

const URGENCY_LABEL: Record<AnticipatedUrgency, string> = {
  overdue: "Overdue",
  "due-soon": "Due soon",
  upcoming: "Upcoming",
  "all-clear": "All clear",
  "no-source-yet": "Waiting on a signal",
};

/**
 * The Console "Anticipated work" lane. A read-only projection of the coming-up / due work across the
 * owner-named processes, each ONE CLICK from starting the existing human-run process. Anticipation never
 * executes — the start control opens a SIMULATION test run; a family with no seeded process (or a viewer
 * who cannot start runs) gets a read-only deep link instead. There is no send or system-of-record write.
 */
export function ConsoleAnticipatedWork({
  groups,
  canStart,
}: Readonly<{ groups: readonly AnticipatedWorkGroup[]; canStart: boolean }>) {
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
            {renderStartControl(group, canStart)}
          </article>
        ))}
      </div>
      <p className="muted console-anticipated-caption">{ANTICIPATION_CAPTION}</p>
    </section>
  );
}

function renderStartControl(group: AnticipatedWorkGroup, canStart: boolean) {
  // No startable work: an un-fed (no-source-yet) or all-clear family shows its summary only.
  if (group.count === 0) {
    return null;
  }
  // Editor with a seeded process: one click starts a test run. Never a send/write.
  if (canStart && group.processDefinitionId) {
    return <StartTestRunButton processDefinitionId={group.processDefinitionId} />;
  }
  // Viewer, or a family with no seeded process: a read-only deep link, never a start control.
  return (
    <Link className="console-anticipated-open" href={group.startHref}>
      Open the space
    </Link>
  );
}
