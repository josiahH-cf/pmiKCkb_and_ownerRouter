import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ApprovalQueueAdminPanel } from "@/components/admin/ApprovalQueueAdminPanel";
import { PublicationPolicyAdminPanel } from "@/components/admin/PublicationPolicyAdminPanel";
import { requirePageCapability } from "@/lib/auth/page-guards";
import {
  type AdminObservability,
  adminObservabilityUnavailableMessage,
  readAdminObservability,
  readDemoAdminObservability,
} from "@/lib/admin/observability";
import { readServerConfig } from "@/lib/config/server";
import {
  listApprovalQueueEmailSettings,
  readApprovalQueueNotificationHealth,
  readDefaultApprovalQueueEmailSettings,
} from "@/lib/firestore/approval-queue-notifications";
import type { ApprovalQueueNotificationHealth } from "@/lib/firestore/types";
import { listPublicationPolicies } from "@/lib/publication/policy";
import type { PublicationPolicyRecord } from "@/lib/publication/types";
import { launchSpaces } from "@/lib/spaces";

// Admin is re-sectioned (console overhaul Slice D) into three clearly-labeled areas so the operator
// knows what the tab is for: People & Access (who can use the app), Activity & Logs (usage +
// notification health), and App Info & Readiness (config + migration + connected-service consoles).
export default async function AdminPage() {
  const user = await requirePageCapability("manageAdmin");
  const config = readServerConfig();
  let observability: AdminObservability | undefined;
  let observabilityNote: string | undefined;
  let queueEmailSettings = readDefaultApprovalQueueEmailSettings();
  let queueHealth: ApprovalQueueNotificationHealth | undefined;
  let queueAdminNote: string | undefined;
  let publicationPolicies: PublicationPolicyRecord[] = [];
  let publicationPolicyNote: string | undefined;

  try {
    observability = await readAdminObservability({ config });
  } catch {
    observabilityNote = adminObservabilityUnavailableMessage(config);
    observability = config.askDemoMode
      ? readDemoAdminObservability({ config })
      : undefined;
  }
  try {
    publicationPolicies = await listPublicationPolicies(user);
  } catch {
    publicationPolicyNote =
      "Publication policies are unavailable. No source can publish until Firestore and a required scanner are configured.";
  }
  try {
    [queueEmailSettings, queueHealth] = await Promise.all([
      listApprovalQueueEmailSettings(user),
      readApprovalQueueNotificationHealth({ actor: user, config }),
    ]);
  } catch {
    queueAdminNote = config.askDemoMode
      ? "Using default queue email settings because Firestore notification health is not available in this session."
      : "Approval Queue notification health is unavailable. Refresh Google credentials or check Firestore setup before relying on notification status.";
  }
  const hasMetrics = Boolean(observability);

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Admin</h1>

        <section aria-label="People and access" className="admin-section">
          <h2 className="section-subtitle">People and Access</h2>
          <p className="muted">Who can use the app and what they can do.</p>
          <div className="grid two">
            <article className="panel">
              <h2>Access</h2>
              <p className="muted">
                Anyone who signs in with a {config.allowedHostedDomain} Google account
                starts as an Editor. Promote a teammate to Approver or Admin to let them
                approve work.
              </p>
              <p>
                <Link href="/admin/users">Manage users and roles</Link>
              </p>
              <p className="muted">
                The terminal command <code>npm run firebase:set-role</code> stays as a
                break-glass path for the first Admin.
              </p>
            </article>
            <article className="panel">
              <h2>Domain</h2>
              <p>{config.allowedHostedDomain}</p>
              <p className="muted">
                The only Google Workspace domain allowed to sign in.
              </p>
            </article>
          </div>
        </section>

        <section aria-label="Activity and logs" className="admin-section">
          <h2 className="section-subtitle">Activity and Logs</h2>
          <p className="muted">
            Recent usage, approval-queue depth, and notification health.
          </p>
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
                        Source target: {space.sourceTargetConfigured ? "set" : "missing"}{" "}
                        - Data store: {space.dataStoreConfigured ? "set" : "missing"} -
                        Source records: {space.sourceMetaCount}
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
          <ApprovalQueueAdminPanel
            initialHealth={queueHealth}
            initialSettings={queueEmailSettings}
            unavailableNote={queueAdminNote}
          />
        </section>

        <section aria-label="App info and readiness" className="admin-section">
          <h2 className="section-subtitle">App Info and Readiness</h2>
          <p className="muted">
            Configuration, migration readiness, and connected-service consoles.
          </p>
          <div className="grid three">
            <article className="panel">
              <h2>Approval Label</h2>
              <p>{config.kbApprovalLabel}</p>
              <p className="muted">
                Gmail delivery is disabled by governance. Approval attention stays in-app;
                configuration cannot activate the legacy sender.
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
            <article className="panel">
              <h2>Migration Readiness</h2>
              <p className="muted">
                Read-only cutover, environment, source-corpus, Action Registry, and
                notification posture.
              </p>
              <Link href="/admin/migration">Open migration console</Link>
            </article>
          </div>
          <article className="panel">
            <h2>Workflow Communications</h2>
            <p className="muted">
              Governance view for workflow-linked Gmail status, the approved label
              taxonomy, and synthetic rule/template examples. Gmail runtime stays
              action-gated.
            </p>
            <Link href="/admin/gmail-inbox-zero">Open communication governance</Link>
          </article>
          <PublicationPolicyAdminPanel
            initialPolicies={publicationPolicies}
            spaces={launchSpaces.filter((space) => !space.readOnly)}
            unavailableNote={publicationPolicyNote}
          />
        </section>
      </section>
    </AppShell>
  );
}
