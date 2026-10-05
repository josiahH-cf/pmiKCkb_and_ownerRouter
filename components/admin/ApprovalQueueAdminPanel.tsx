import type {
  ApprovalQueueEmailSettingRecord,
  ApprovalQueueNotificationHealth,
  QueueNotificationRecipientRole,
} from "@/lib/firestore/types";

const RECIPIENT_ROLES: QueueNotificationRecipientRole[] = [
  "Assignee",
  "Required approver",
  "Creator/editor",
  "Admin selected",
];

export function ApprovalQueueAdminPanel({
  initialHealth,
  initialSettings,
  unavailableNote,
}: Readonly<{
  initialHealth?: ApprovalQueueNotificationHealth;
  initialSettings: ApprovalQueueEmailSettingRecord[];
  unavailableNote?: string;
}>) {
  // S179: queue email delivery is retired. These records are shown for audit only, so this
  // panel offers no control that could look like setting that delivery up.
  const health = initialHealth;
  const settings = initialSettings;
  const message = unavailableNote ?? "Queue health connected.";

  return (
    <section className="panel approval-admin-panel" aria-label="Approval Queue health">
      <div className="panel-heading compact-heading">
        <div>
          <h2>Approval Queue Health</h2>
          <p className="muted queue-status-message">{message}</p>
        </div>
        {health ? (
          <span className="queue-pill" data-value={health.status}>
            {health.status}
          </span>
        ) : null}
      </div>

      {health ? (
        <>
          <div className="queue-detail-grid">
            <HealthField label="Queue email" value={health.queue_email_status} />
            <HealthField
              label="Failed delivery"
              value={String(health.failed_delivery_count)}
            />
            <HealthField label="Blocked" value={String(health.blocked_item_count)} />
            <HealthField label="Overdue" value={String(health.stale_overdue_count)} />
          </div>

          <ReasonList title="Action Required" reasons={health.action_required_reasons} />
          <ReasonList title="Needs Attention" reasons={health.needs_attention_reasons} />
        </>
      ) : (
        <p className="muted">
          Queue notification health is unavailable. Refresh credentials or check Firestore
          setup before relying on notification status.
        </p>
      )}

      <section
        className="queue-settings-section"
        aria-label="Earlier queue email preferences"
      >
        <h3>Earlier queue email preferences</h3>
        <p className="muted">
          Kept for audit. Email delivery is off. In-app notifications stay on.
        </p>
        <div className="queue-settings-list">
          {settings.map((setting) => (
            <div className="queue-setting-row" key={setting.id}>
              <div>
                <strong>{eventLabel(setting.event_type)}</strong>
                <p className="muted">{setting.trigger_condition}</p>
                <p className="muted">Subject: {setting.subject_preview}</p>
                <p className="muted">
                  Cooldown:{" "}
                  {setting.cooldown_hours > 0
                    ? `${setting.cooldown_hours} hour(s)`
                    : "No repeat"}
                </p>
                {setting.last_error ? (
                  <p className="muted">Last error: {setting.last_error}</p>
                ) : null}
              </div>
              <div className="queue-setting-controls">
                <label className="queue-toggle">
                  <input
                    checked={setting.email_enabled}
                    disabled
                    readOnly
                    type="checkbox"
                  />
                  Earlier email preference
                </label>
                <div className="queue-role-checks" aria-label="Earlier recipients">
                  {RECIPIENT_ROLES.map((role) => (
                    <label key={role}>
                      <input
                        checked={setting.recipient_roles.includes(role)}
                        disabled
                        readOnly
                        type="checkbox"
                      />
                      {role}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function HealthField({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="queue-detail-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReasonList({ reasons, title }: Readonly<{ reasons: string[]; title: string }>) {
  if (reasons.length === 0) {
    return null;
  }

  return (
    <div className="queue-health-reasons">
      <strong>{title}</strong>
      <ul className="compact-list">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}

function eventLabel(value: string) {
  const labels: Record<string, string> = {
    assigned: "Assigned",
    blocked: "Blocked",
    blocked_overdue_escalation: "Blocked or overdue escalation",
    closed: "Closed",
    created: "Created",
    overdue: "Overdue",
    returned_for_revision: "Returned for revision",
    unblocked: "Unblocked",
    unsnoozed: "Unsnoozed",
  };

  return labels[value] ?? value;
}
