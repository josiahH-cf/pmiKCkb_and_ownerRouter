import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { buildMigrationReadinessReport } from "@/lib/admin/migration-readiness";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { readServerConfig } from "@/lib/config/server";

function readinessPill(blockerCount: number, warningCount: number) {
  if (blockerCount > 0) {
    return "Action Required";
  }

  return warningCount > 0 ? "Needs Attention" : "Healthy";
}

export default async function AdminMigrationPage() {
  const user = await requirePageCapability("manageAdmin");
  const config = readServerConfig();
  const report = await buildMigrationReadinessReport({ actor: user, config });
  const registry = report.action_registry;
  // Governance is healthy when there is no UNEXPECTED executable entry; allow-listed executables (each
  // backed by a committed grant artifact) are fine.
  const registryGovernanceOk = registry.unexpected_production_allowed_keys.length === 0;
  const allowListedExecutable = registry.production_allowed_keys.filter(
    (key) => !registry.unexpected_production_allowed_keys.includes(key),
  );

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Migration Readiness</h1>
        <p className="muted">
          Read-only, preview-first mirror of <code>npm run cutover:report</code>. No cloud
          call is made from this page; in development it honestly shows the production
          blockers that remain. Generated {report.generated_at}.
          {report.away_mode_active ? " Remote Away Mode is active." : ""}{" "}
          <Link href="/admin">Back to Admin</Link>
        </p>

        <article className="panel">
          <h2>
            Cutover Blockers{" "}
            <span
              className="queue-pill"
              data-value={readinessPill(
                report.rollup.blockers.length,
                report.rollup.warnings.length,
              )}
            >
              {report.rollup.ok
                ? "No blockers"
                : `${report.rollup.blockers.length} blockers`}
            </span>
          </h2>
          {report.rollup.blockers.length === 0 ? (
            <p className="muted">No cutover blockers detected in this environment.</p>
          ) : (
            <ul className="compact-list">
              {report.rollup.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
          {report.owner_actions.length > 0 ? (
            <>
              <h3>Owner-side action required</h3>
              <p className="muted">
                These blockers need credentials, billing, real project ids, or a reviewed
                production manifest, so they cannot be cleared from this session.
              </p>
              <ul className="compact-list">
                {report.owner_actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </>
          ) : null}
          {report.rollup.warnings.length > 0 ? (
            <>
              <h3>Warnings</h3>
              <ul className="compact-list">
                {report.rollup.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </>
          ) : null}
        </article>

        <div className="grid two">
          <article className="panel">
            <h2>Environment Readiness</h2>
            {report.gcp.available ? (
              <>
                <p>Target project: {report.gcp.project_id ?? "not configured"}</p>
                <p className="muted">
                  {report.gcp.blockers.length} blockers, {report.gcp.warnings.length}{" "}
                  warnings from the GCP/Firebase/Firestore converge plan.
                </p>
              </>
            ) : (
              <p className="muted">{report.gcp.note}</p>
            )}
          </article>
          <article className="panel">
            <h2>Production Env Preflight</h2>
            {report.production_env.available ? (
              <>
                <p>
                  {report.production_env.ok
                    ? "Production configuration is complete."
                    : `${report.production_env.errors.length} required production values are missing or invalid.`}
                </p>
                <p className="muted">
                  Checked against the current process environment; expected to fail until
                  the client-owned production values exist.
                </p>
              </>
            ) : (
              <p className="muted">{report.production_env.note}</p>
            )}
          </article>
          <article className="panel">
            <h2>Source Corpus Readiness</h2>
            {report.corpus.available ? (
              <>
                <p>
                  {report.corpus.entry_count} manifest entries,{" "}
                  {report.corpus.blockers.length} blockers.
                </p>
                <p className="muted">From {report.corpus.manifest_path}.</p>
              </>
            ) : (
              <p className="muted">{report.corpus.note}</p>
            )}
          </article>
          <article className="panel">
            <h2>Budget &amp; Away Mode</h2>
            {report.budget.available ? (
              <>
                <p>
                  Posture: {report.budget.posture}, cap ${report.budget.cap_usd}.{" "}
                  <span
                    className="queue-pill"
                    data-value={report.budget.ok ? "Healthy" : "Action Required"}
                  >
                    {report.budget.ok ? "Guard passing" : "Guard failing"}
                  </span>
                </p>
                <p className="muted">
                  {report.away_mode_active
                    ? "Remote Away Mode is active; cost-bearing overrides stay blocked."
                    : "Away mode is not active."}
                </p>
              </>
            ) : (
              <p className="muted">{report.budget.note}</p>
            )}
          </article>
        </div>

        <article className="panel">
          <h2>
            Action Registry Readiness{" "}
            <span
              className="queue-pill"
              data-value={registryGovernanceOk ? "Healthy" : "Action Required"}
            >
              {!registryGovernanceOk
                ? "Governance violation"
                : allowListedExecutable.length === 0
                  ? "Non-executable"
                  : "Gate-controlled"}
            </span>
          </h2>
          {registry.note ? <p className="muted">{registry.note}</p> : null}
          <p>
            {!registryGovernanceOk
              ? `${registry.unexpected_production_allowed_keys.length} entries are production_allowed=true without a committed grant. Investigate before any cutover step.`
              : allowListedExecutable.length === 0
                ? `All ${registry.total} entries are production_allowed=false; no external write path exists.`
                : `${allowListedExecutable.length} allow-listed executable (${allowListedExecutable.join(", ")}, unsent draft only); the other ${registry.total - allowListedExecutable.length} are production_allowed=false.`}
          </p>
          <div className="grid two">
            <div>
              <h3>By readiness</h3>
              <ul className="compact-list">
                {Object.entries(registry.by_readiness).map(([state, count]) => (
                  <li key={state}>
                    {state}: {count}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>By evidence</h3>
              <ul className="compact-list">
                {Object.entries(registry.by_evidence).map(([state, count]) => (
                  <li key={state}>
                    {state}: {count}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {registry.gated.length > 0 ? (
            <>
              <h3>Gated entries</h3>
              <ul className="compact-list">
                {registry.gated.map((entry) => (
                  <li key={entry.key}>
                    {entry.key}: {entry.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </article>

        <article className="panel">
          <h2>Notification Posture</h2>
          {report.notifications.available ? (
            <>
              <p>
                Health:{" "}
                <span className="queue-pill" data-value={report.notifications.status}>
                  {report.notifications.status}
                </span>
              </p>
              <p className="muted">
                {report.notifications.settings_count} notification event settings;{" "}
                {report.notifications.disabled_event_types.length} event types have email
                disabled.
              </p>
            </>
          ) : (
            <p className="muted">{report.notifications.note}</p>
          )}
        </article>
      </section>
    </AppShell>
  );
}
