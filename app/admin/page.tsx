import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { AdminActivityLogPanel } from "@/components/admin/AdminActivityLogPanel";
import { AdminTaskIndex } from "@/components/admin/AdminTaskIndex";
import { ApprovalQueueAdminPanel } from "@/components/admin/ApprovalQueueAdminPanel";
import { KbCorrectionsPanel } from "@/components/admin/KbCorrectionsPanel";
import { ModelConfigPanel } from "@/components/admin/ModelConfigPanel";
import { CommunicationsRetentionAdminPanel } from "@/components/admin/CommunicationsRetentionAdminPanel";
import { NoticeRulesAdminPanel } from "@/components/admin/NoticeRulesAdminPanel";
import { OperationalPageBuilderPanel } from "@/components/admin/OperationalPageBuilderPanel";
import { OwnerPolicyRulesAdminPanel } from "@/components/admin/OwnerPolicyRulesAdminPanel";
import { PublicationPolicyAdminPanel } from "@/components/admin/PublicationPolicyAdminPanel";
import { ReindexPanel } from "@/components/admin/ReindexPanel";
import { RenewalRehearsalSheetPanel } from "@/components/admin/RenewalRehearsalSheetPanel";
import { RuntimeSuspensionAdminPanel } from "@/components/admin/RuntimeSuspensionAdminPanel";
import { SupportReportsPanel } from "@/components/admin/SupportReportsPanel";
import { TransactionalDestinationPanel } from "@/components/admin/TransactionalDestinationPanel";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { type AdminActivityEntry, readAdminActivityLog } from "@/lib/admin/activity-log";
import { listAppUsers } from "@/lib/admin/users";
import {
  type AdminObservability,
  adminObservabilityUnavailableMessage,
  readAdminObservability,
  readDemoAdminObservability,
} from "@/lib/admin/observability";
import { readServerConfig } from "@/lib/config/server";
import { listAskCorrections } from "@/lib/firestore/ask-corrections";
import {
  listApprovalQueueEmailSettings,
  readApprovalQueueNotificationHealth,
  readDefaultApprovalQueueEmailSettings,
} from "@/lib/firestore/approval-queue-notifications";
import {
  defaultOwnerTransactionalDestination,
  readOwnerTransactionalDestination,
} from "@/lib/firestore/owner-transactional-destination";
import {
  readRenewalRehearsalSheetAdminConfig,
  type RenewalRehearsalSheetAdminConfig,
} from "@/lib/firestore/renewal-rehearsal-sheet-config";
import {
  type NoticeRuleSetRecord,
  readNoticeRuleConfigRecord,
} from "@/lib/firestore/lease-renewal-notice-rules";
import {
  listOwnerPolicyRules,
  type OwnerPolicyRule,
} from "@/lib/firestore/owner-policy-rules";
import {
  type ReindexRequest,
  listReindexRequests,
} from "@/lib/firestore/reindex-requests";
import { listSupportReports } from "@/lib/firestore/support-reports";
import {
  type RuntimeSuspensionAdminSnapshot,
  listRuntimeActionSuspensions,
  listRuntimeSuspensionActionOptions,
} from "@/lib/firestore/runtime-action-suspensions";
import { gatherSupportAttention } from "@/lib/attention/support-lane";
import type {
  ApprovalQueueNotificationHealth,
  AskCorrectionRecord,
  SupportReportRecord,
} from "@/lib/firestore/types";
import { listPublicationPolicies } from "@/lib/publication/policy";
import type { PublicationPolicyRecord } from "@/lib/publication/types";
import { resolveRenewalSheetBindings } from "@/lib/lease-renewal/rehearsal-sheet";
import { launchSpaces } from "@/lib/spaces";
import { listAdminAccessRequests } from "@/lib/access/request-service";

// Admin is re-sectioned (console overhaul Slice D) into three clearly-labeled areas so the operator
// knows what the tab is for: People & Access (who can use the app), Activity & Logs (usage +
// notification health), and App Info & Readiness (config + migration + connected-service consoles).
export default async function AdminPage() {
  const user = await requirePageCapability("manageAdmin");
  const config = readServerConfig();
  // S32: Proposed answer corrections awaiting Admin review (harden-the-app loop). Nothing self-modifies.
  // Guarded like every other read below: an unreachable Firestore degrades this one panel instead of
  // failing the whole Admin page, which previously returned 500 for the entire route.
  let proposedCorrections: AskCorrectionRecord[] = [];
  let proposedCorrectionsNote: string | undefined;
  let observability: AdminObservability | undefined;
  let observabilityNote: string | undefined;
  let queueEmailSettings = readDefaultApprovalQueueEmailSettings();
  let queueHealth: ApprovalQueueNotificationHealth | undefined;
  let queueAdminNote: string | undefined;
  let publicationPolicies: PublicationPolicyRecord[] = [];
  let publicationPolicyNote: string | undefined;
  let transactionalDestination = defaultOwnerTransactionalDestination();
  let transactionalDestinationNote: string | undefined;
  const environmentSheetBindings = resolveRenewalSheetBindings();
  let rehearsalSheetConfig: RenewalRehearsalSheetAdminConfig = {
    operating: environmentSheetBindings.operating,
    rehearsal:
      environmentSheetBindings.rehearsal.status === "ready"
        ? { ...environmentSheetBindings.rehearsal, source: "environment" }
        : { status: "not_configured", configured: false },
  };
  let rehearsalSheetNote: string | undefined;
  let supportReports: SupportReportRecord[] = [];
  let supportReportsNote: string | undefined;
  let supportReporterDirectory: Record<string, string> = {};
  // S39: the badge counts come from the SAME gatherSupportAttention the /notifications hub reads, so the
  // panel and the hub can never show different numbers (never a separate ad-hoc count over the list).
  let supportAttention = { newCount: 0, followUpDueCount: 0 };
  let noticeRules: NoticeRuleSetRecord | undefined;
  let noticeRulesNote: string | undefined;
  let ownerPolicyRules: OwnerPolicyRule[] = [];
  let activityEntries: AdminActivityEntry[] = [];
  let activityNote: string | undefined;
  let runtimeSuspensionActions = listRuntimeSuspensionActionOptions();
  let runtimeSuspensionSnapshot: RuntimeSuspensionAdminSnapshot = {
    suspensions: [],
    unreadableActionKeys: [],
    hasUnknownRecords: false,
  };
  let runtimeSuspensionNote: string | undefined;
  let reindexRequests: ReindexRequest[] = [];
  let accessRequestPendingCount: number | null = null;

  // These panels are independent. Resolve them concurrently so an unavailable Firestore session
  // costs one bounded dependency wait instead of serially multiplying that wait across Admin.
  await Promise.all([
    listAskCorrections(user, { status: "Proposed" })
      .then((records) => {
        proposedCorrections = records;
      })
      .catch(() => {
        proposedCorrectionsNote =
          "Proposed answer corrections are unavailable right now. Try again in a minute; new corrections may not be saving either.";
      }),
    readAdminObservability({ config })
      .then((result) => {
        observability = result;
      })
      .catch(() => {
        observabilityNote = adminObservabilityUnavailableMessage(config);
        observability = config.askDemoMode
          ? readDemoAdminObservability({ config })
          : undefined;
      }),
    listPublicationPolicies(user)
      .then((records) => {
        publicationPolicies = records;
      })
      .catch(() => {
        publicationPolicyNote =
          "Publication policies are unavailable. No source can publish until Firestore and a required scanner are configured.";
      }),
    Promise.all([
      listApprovalQueueEmailSettings(user),
      readApprovalQueueNotificationHealth({ actor: user }),
    ])
      .then(([settings, health]) => {
        queueEmailSettings = settings;
        queueHealth = health;
      })
      .catch(() => {
        queueAdminNote = config.askDemoMode
          ? "Using default queue email settings because Firestore notification health is not available in this session."
          : "Notification health isn't available right now. Try again in a minute before relying on notification status.";
      }),
    readOwnerTransactionalDestination(user)
      .then((destination) => {
        transactionalDestination = destination;
      })
      .catch(() => {
        transactionalDestinationNote =
          "Showing the seeded default; the saved destination is unavailable until Firestore is reachable in this session.";
      }),
    readRenewalRehearsalSheetAdminConfig(user)
      .then((savedConfig) => {
        rehearsalSheetConfig = savedConfig;
      })
      .catch(() => {
        rehearsalSheetNote =
          "Saved rehearsal-copy configuration is unavailable. No Sheet proof can run from this panel.";
      }),
    listAppUsers()
      .then((users) => {
        supportReporterDirectory = Object.fromEntries(
          users.map((managedUser) => [managedUser.uid, managedUser.email]),
        );
      })
      .catch(() => {
        supportReporterDirectory = {};
      }),
    listSupportReports(user)
      .then((reports) => {
        supportReports = reports;
      })
      .catch(() => {
        supportReportsNote =
          "Feedback is unavailable right now. Try again in a minute; if this list is not loading, new feedback may not be saving either.";
      }),
    // This reader degrades to empty and never throws.
    gatherSupportAttention(user).then((attention) => {
      supportAttention = attention;
    }),
    readNoticeRuleConfigRecord(user)
      .then((record) => {
        noticeRules = record;
      })
      .catch(() => {
        noticeRulesNote =
          "Renewal notice rules are unavailable right now. Try again in a minute before changing them.";
      }),
    // S62: owner-policy pricing rules. Degrades to an empty list; the panel still renders.
    listOwnerPolicyRules(user)
      .then((rules) => {
        ownerPolicyRules = rules;
      })
      .catch(() => {
        ownerPolicyRules = [];
      }),
    readAdminActivityLog()
      .then((entries) => {
        activityEntries = entries;
      })
      .catch(() => {
        activityNote =
          "Admin activity is unavailable right now. Try again in a minute; recent access or Production action-stop changes may not be listed here yet.";
      }),
    listRuntimeActionSuspensions(user)
      .then((snapshot) => {
        runtimeSuspensionSnapshot = snapshot;
        runtimeSuspensionActions = listRuntimeSuspensionActionOptions([
          ...snapshot.suspensions.map((record) => record.action_key),
          ...snapshot.unreadableActionKeys,
        ]);
      })
      .catch(() => {
        runtimeSuspensionNote =
          "Runtime suspension state is unavailable. The list is not treated as empty, and executable actions fail closed while this state cannot be read.";
      }),
    listReindexRequests(user)
      .then((requests) => {
        reindexRequests = requests;
      })
      .catch(() => {
        // The re-index control still stages new requests; the recent list is just empty this session.
      }),
    listAdminAccessRequests(user, { state: "pending", limit: 1 })
      .then((result) => {
        accessRequestPendingCount = result.pending_count;
      })
      .catch(() => {
        accessRequestPendingCount = null;
      }),
  ]);
  const hasMetrics = Boolean(observability);

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Admin</h1>
        <AdminTaskIndex />

        <section
          aria-label="People and access"
          className="admin-section task-anchor"
          id="admin-people-access"
          tabIndex={-1}
        >
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
                <Link href="/admin/access">Open My access and request access</Link>
              </p>
              <p>
                <Link href="/approval-queue?view=access">
                  {accessRequestPendingCount === null
                    ? "Review access requests (count unavailable)"
                    : `Review access requests (${accessRequestPendingCount} pending)`}
                </Link>
              </p>
              <p>
                <Link href="/admin/users">Manage users and roles</Link>
              </p>
              <p>
                <Link href="/admin/team-work">Assign and review team work</Link>
              </p>
              <p>
                <Link href="/admin/vendors">
                  Manage Live Vendor accounts and assignments
                </Link>
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

        <section
          aria-label="Activity and logs"
          className="admin-section task-anchor"
          id="admin-activity-logs"
          tabIndex={-1}
        >
          <h2 className="section-subtitle">Activity and Logs</h2>
          <p className="muted">
            Recent usage, approval-queue depth, and notification health.
          </p>
          <div className="task-anchor" id="admin-runtime-suspensions" tabIndex={-1}>
            <RuntimeSuspensionAdminPanel
              initialActions={runtimeSuspensionActions}
              initialSnapshot={runtimeSuspensionSnapshot}
              unavailableNote={runtimeSuspensionNote}
            />
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
          <div className="task-anchor" id="admin-approval-notifications" tabIndex={-1}>
            <ApprovalQueueAdminPanel
              initialHealth={queueHealth}
              initialSettings={queueEmailSettings}
              unavailableNote={queueAdminNote}
            />
          </div>
          <div className="task-anchor" id="admin-support-reports" tabIndex={-1}>
            <SupportReportsPanel
              reports={supportReports}
              unavailableNote={supportReportsNote}
              newCount={supportAttention.newCount}
              followUpDueCount={supportAttention.followUpDueCount}
              reporterDirectory={supportReporterDirectory}
            />
          </div>
          <div className="task-anchor" id="admin-activity-log" tabIndex={-1}>
            <AdminActivityLogPanel
              entries={activityEntries}
              unavailableNote={activityNote}
            />
          </div>
        </section>

        <section
          aria-label="App info and readiness"
          className="admin-section task-anchor"
          id="admin-app-readiness"
          tabIndex={-1}
        >
          <h2 className="section-subtitle">App Info and Readiness</h2>
          <p className="muted">
            Configuration, migration readiness, and connected-service consoles.
          </p>
          <div className="task-anchor" id="admin-kb-corrections" tabIndex={-1}>
            <KbCorrectionsPanel
              proposed={proposedCorrections}
              unavailableNote={proposedCorrectionsNote}
            />
          </div>
          <div className="task-anchor" id="admin-model-config" tabIndex={-1}>
            <ModelConfigPanel
              answerModel={config.geminiAnswerModel}
              classifyModel={config.geminiClassifyModel}
              provider={config.modelProvider}
            />
          </div>
          <div className="task-anchor" id="admin-renewal-rehearsal-sheet" tabIndex={-1}>
            <RenewalRehearsalSheetPanel
              initialConfig={rehearsalSheetConfig}
              unavailableNote={rehearsalSheetNote}
            />
          </div>
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
            <article className="panel">
              <h2>Spaces</h2>
              <p className="muted">
                Request a new Space. The app records it and prints the exact commands to
                review one fixed GCS + Discovery Engine resource plan. Generic cloud
                commands and caller-selected IAM are not exposed.
              </p>
              <Link href="/admin/spaces/request">Request a new Space</Link>
            </article>
          </div>
          <article className="panel">
            <h2>Re-index Sources</h2>
            <ReindexPanel
              initialRequests={reindexRequests}
              spaces={launchSpaces
                .filter((space) => space.showInDirectory !== false)
                .map((space) => ({ id: space.id, name: space.name }))}
            />
          </article>
          <TransactionalDestinationPanel
            initialEmail={transactionalDestination.destination_email}
            note={transactionalDestinationNote}
          />
          <div className="task-anchor" id="admin-renewal-notice-rules" tabIndex={-1}>
            {noticeRules ? (
              <NoticeRulesAdminPanel initialRecord={noticeRules} note={noticeRulesNote} />
            ) : (
              <article className="panel">
                <h2>Renewal Notice Rules</h2>
                <p className="muted">{noticeRulesNote}</p>
              </article>
            )}
          </div>
          <div className="task-anchor" id="admin-content-builder" tabIndex={-1}>
            <OperationalPageBuilderPanel
              spaces={launchSpaces
                .filter((space) => space.showInDirectory !== false && !space.readOnly)
                .map((space) => ({ id: space.id, name: space.name }))}
            />
          </div>
          <article
            className="panel task-anchor"
            id="admin-owner-pricing-rules"
            tabIndex={-1}
          >
            <h2>Owner Pricing Rules</h2>
            <OwnerPolicyRulesAdminPanel initialRules={ownerPolicyRules} />
          </article>
          <article className="panel">
            <h2>Workflow Communications</h2>
            <p className="muted">
              Governance view for workflow-linked Gmail status, the approved label
              taxonomy, and synthetic rule/template examples. Gmail runtime stays
              action-gated.
            </p>
            <Link href="/admin/gmail-inbox-zero">Open communication governance</Link>
          </article>
          <CommunicationsRetentionAdminPanel />
          <div className="task-anchor" id="admin-publication-policies" tabIndex={-1}>
            <PublicationPolicyAdminPanel
              initialPolicies={publicationPolicies}
              spaces={launchSpaces.filter(
                (space) => space.showInDirectory !== false && !space.readOnly,
              )}
              unavailableNote={publicationPolicyNote}
            />
          </div>
        </section>
      </section>
    </AppShell>
  );
}
