import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ATTENTION_LANE_META, type AttentionLane } from "@/lib/attention/lanes";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { loadNotificationHub } from "@/lib/notifications/hub";

// S17 B1 — the read-only /notifications hub. A SUPERSET of the Console: it renders the time-ordered event
// LOG plus the standing setup signals (connections + coverage) and, for an Admin, the value-free review
// digest, all from the ONE shared loader the bell uses (so the two never diverge). Read-gated and
// self-scoped; a scope-denied surface is not a concern here (a signed-in user always sees their own feed).
// Non-fatal: the loader degrades each read independently, so a hiccup thins the feed rather than erroring.
export default async function NotificationsPage() {
  const user = await requirePageCapability("read");
  const feed = await loadNotificationHub(user, { full: true, limit: 50 });

  const connectionSignals = feed.standing.filter(
    (signal) => signal.lane === "connection",
  );
  const coverageSignals = feed.standing.filter((signal) => signal.lane === "coverage");

  return (
    <AppShell user={user}>
      <section className="content notifications-hub">
        <h1 className="section-title">Notifications</h1>
        <p className="muted">
          Everything that needs your attention, newest first. The Console stays your
          at-a-glance home; this is the full log.
        </p>

        {feed.review ? (
          <section className="panel notifications-review" aria-label="Team review">
            <div className="notifications-lane-head">
              <span
                className="notifications-lane-badge"
                data-severity={feed.review.severity}
              >
                {ATTENTION_LANE_META.review.label}
              </span>
            </div>
            <Link href={feed.review.href}>{feed.review.label}</Link>
            <p className="muted">{feed.review.detail}</p>
          </section>
        ) : null}

        <section className="panel" aria-label="Needs your decision">
          <div className="notifications-lane-head">
            <h2>Needs your decision</h2>
            <span className="console-deck-count">{feed.decisions.count}</span>
          </div>
          {feed.decisions.count === 0 ? (
            <p className="muted">{ATTENTION_LANE_META.decision.allClear}</p>
          ) : (
            <ul className="notifications-standing-list">
              {feed.decisions.signals.map((signal) => (
                <li key={signal.signal_key} data-lane={signal.lane}>
                  <Link href={signal.href}>{signal.label}</Link>
                  <span className="muted">{signal.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-label="Recent activity">
          <h2>Recent activity</h2>
          {feed.notifications.length === 0 ? (
            <p className="muted">No recent event notifications.</p>
          ) : (
            <ol className="notifications-log">
              {feed.notifications.map((notification) => (
                <li key={`${notification.source}:${notification.id}`}>
                  <span
                    className="notifications-lane-badge"
                    data-severity={notification.severity}
                  >
                    {laneLabel(notification.lane)}
                  </span>
                  <Link href={notification.href}>{notification.title}</Link>
                  <span className="muted">{notification.message}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel" aria-label="Set-up">
          <h2>Set-up</h2>
          <StandingLane
            lane="connection"
            signals={connectionSignals.map((signal) => ({
              key: signal.signal_key,
              label: signal.label,
              detail: signal.detail,
              href: signal.href,
            }))}
          />
          <StandingLane
            lane="coverage"
            signals={coverageSignals.map((signal) => ({
              key: signal.signal_key,
              label: signal.label,
              detail: signal.detail,
              href: signal.href,
            }))}
          />
        </section>
      </section>
    </AppShell>
  );
}

function laneLabel(lane: AttentionLane): string {
  return ATTENTION_LANE_META[lane].label;
}

// One standing lane: its gaps, or the richer all-clear copy when empty (B6) — never a blank panel.
function StandingLane({
  lane,
  signals,
}: Readonly<{
  lane: AttentionLane;
  signals: readonly { key: string; label: string; detail: string; href: string }[];
}>) {
  const meta = ATTENTION_LANE_META[lane];
  return (
    <div className="notifications-standing-lane">
      <h3>{meta.label}</h3>
      {signals.length === 0 ? (
        <p className="muted">{meta.allClear}</p>
      ) : (
        <ul className="notifications-standing-list">
          {signals.map((signal) => (
            <li key={signal.key}>
              <Link href={signal.href}>{signal.label}</Link>
              <span className="muted">{signal.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
