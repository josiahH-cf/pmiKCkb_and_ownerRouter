import { AppShell } from "@/components/layout/AppShell";
import { requirePageRole } from "@/lib/auth/page-guards";
import {
  type AdminObservability,
  adminObservabilityUnavailableMessage,
  readAdminObservability,
  readDemoAdminObservability,
} from "@/lib/admin/observability";
import { readServerConfig } from "@/lib/config/server";

export default async function AdminPage() {
  const user = await requirePageRole("Admin");
  const config = readServerConfig();
  let observability: AdminObservability | undefined;
  let observabilityNote: string | undefined;

  try {
    observability = await readAdminObservability({ config });
  } catch {
    observabilityNote = adminObservabilityUnavailableMessage(config);
    observability = config.askDemoMode
      ? readDemoAdminObservability({ config })
      : undefined;
  }
  const hasMetrics = Boolean(observability);

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Admin</h1>
        <div className="grid three">
          <article className="panel">
            <h2>Domain</h2>
            <p>{config.allowedHostedDomain}</p>
          </article>
          <article className="panel">
            <h2>Approval Label</h2>
            <p>{config.kbApprovalLabel}</p>
            <p className="muted">
              {config.kbApprovalNotificationsEnabled
                ? "Gmail send-only notifications are enabled."
                : "Gmail notifications are disabled until sender and recipients are configured."}
            </p>
          </article>
          <article className="panel">
            <h2>Indexing</h2>
            <p className="muted">
              {config.askDemoMode
                ? "Demo retrieval mode is active."
                : "Live retrieval mode expects configured Vertex data stores."}
            </p>
          </article>
        </div>
        {hasMetrics ? (
          <>
            {observabilityNote ? (
              <article className="panel">
                <h2>Observability</h2>
                <p className="muted">{observabilityNote}</p>
              </article>
            ) : null}
            <div className="grid three">
              <article className="panel">
                <h2>Ask Volume</h2>
                <p>{observability?.askLast7Days} in 7 days</p>
                <p className="muted">{observability?.askLast30Days} in 30 days</p>
              </article>
              <article className="panel">
                <h2>Approval Queue</h2>
                <p>{observability?.queueDepthByType.SOP} SOPs</p>
                <p className="muted">
                  {observability?.queueDepthByType.Template} templates,{" "}
                  {observability?.queueDepthByType.Placeholder} placeholders
                </p>
              </article>
              <article className="panel">
                <h2>Notification Failures</h2>
                <p>{observability?.notificationFailures}</p>
              </article>
            </div>
            <div className="grid two">
              <article className="panel">
                <h2>Top Spaces</h2>
                {observability?.topSpaces.length === 0 ? (
                  <p className="muted">No Ask logs in the last 30 days.</p>
                ) : (
                  <ul className="compact-list">
                    {observability?.topSpaces.map((space) => (
                      <li key={space.spaceId}>
                        {space.spaceName}: {space.count}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
              <article className="panel">
                <h2>Source States</h2>
                <ul className="compact-list">
                  {Object.entries(observability?.sourceStateCounts ?? {}).map(
                    ([state, count]) => (
                      <li key={state}>
                        {state}: {count}
                      </li>
                    ),
                  )}
                </ul>
              </article>
            </div>
            <article className="panel">
              <h2>Space Setup Health</h2>
              <div className="queue-list">
                {observability?.setupHealth.map((space) => (
                  <div className="compact-record" key={space.spaceId}>
                    <strong>{space.spaceName}</strong>
                    <p className="muted">
                      Source target: {space.sourceTargetConfigured ? "set" : "missing"} -
                      Data store: {space.dataStoreConfigured ? "set" : "missing"} - Source
                      records: {space.sourceMetaCount}
                      {space.readOnly ? " - read-only" : ""}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </>
        ) : (
          <article className="panel">
            <h2>Observability</h2>
            <p className="muted">{observabilityNote}</p>
          </article>
        )}
      </section>
    </AppShell>
  );
}
