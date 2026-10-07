"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { formatBusinessTimestamp } from "@/lib/date-display";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field, Notice } from "@/components/ui";
import {
  DOTLOOP_CALLBACK_FEEDBACK,
  type DotloopCallbackResult,
} from "@/lib/connections/dotloop-callback-result";
import {
  DOTLOOP_READINESS_NEXT_ACTION,
  DOTLOOP_READINESS_REASON_TEXT,
  type DotloopReadiness,
  type DotloopSelectionStatus,
} from "@/lib/connections/dotloop-readiness";
import type { DotloopPickerView } from "@/lib/connections/dotloop-resource-selection";

// S106: the company Dotloop connection's readiness, mounted on the Connection Center. Every role
// sees the same labeled readiness (staff need no Dotloop sign-in of their own). Admins also get the
// explicit resource refresh and the resource picker. Nothing here grants action authority.

export interface DotloopSelectionSummary {
  readonly profileId: string;
  readonly profileLabel: string;
  readonly templateId: string;
  readonly templateLabel: string;
  readonly transactionType?: string;
  readonly initialStatus?: string;
  readonly recordedAtIso: string;
}

const STATE_LABEL: Record<DotloopReadiness["state"], string> = {
  connected: "Ready for renewal packets",
  missing_resources: "Connected; renewal resources need attention",
  disconnected: "Not connected",
  connecting: "Connection is being refreshed",
  refresh_needed: "Reconnect required",
  unavailable: "Unavailable",
};

const SELECTION_LABEL: Record<DotloopSelectionStatus, string> = {
  ok: "available",
  renamed: "available; renamed in Dotloop since it was chosen",
  unavailable: "not found in the latest resource check",
  unsupported: "cannot be used for lease loops",
  unselected: "not selected",
  unknown: "not checked yet",
};

const TRANSACTION_LABEL: Record<string, string> = {
  LISTING_FOR_LEASE: "Listing for lease",
  LEASE_OFFER: "Lease offer",
};

function statusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part, index) => (index === 0 ? part[0]?.toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function DotloopConnectionPanel({
  readiness,
  canManage,
  picker,
  selection,
  callbackResult,
}: Readonly<{
  readiness: DotloopReadiness;
  canManage: boolean;
  picker: DotloopPickerView | null;
  selection: DotloopSelectionSummary | null;
  callbackResult: DotloopCallbackResult | null;
}>) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const feedback = callbackResult ? DOTLOOP_CALLBACK_FEEDBACK[callbackResult] : null;
  const scopes = readiness.scopes;

  async function refreshResources() {
    setRefreshing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/connections/dotloop/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await response.json().catch(() => null)) as {
        refreshed?: boolean;
        error?: string;
      } | null;
      if (!response.ok) {
        setMessage(
          body?.error ?? "The resource check did not complete. Please try again.",
        );
        return;
      }
      setMessage(
        body?.refreshed
          ? "Dotloop resources were checked."
          : "No connected Dotloop account was available to check.",
      );
      router.refresh();
    } catch {
      setMessage("The resource check did not complete. Please try again.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section
      aria-labelledby="dotloop-readiness-title"
      className="ui-stack"
      data-dotloop-readiness={readiness.state}
      id="dotloop-readiness"
    >
      <h2 className="section-subtitle" id="dotloop-readiness-title">
        Dotloop renewal readiness
      </h2>
      {feedback ? (
        <Notice tone={feedback.tone === "error" ? "error" : feedback.tone}>
          {feedback.message}
        </Notice>
      ) : null}
      <p>
        <strong>{STATE_LABEL[readiness.state]}.</strong> Loop and document actions require
        their own open keys and exact confirmation. Preparing and downloading filled forms
        does not need this connection.
      </p>
      {readiness.accountEmail ? (
        <p data-dotloop-account>Connected Dotloop account: {readiness.accountEmail}</p>
      ) : null}
      {readiness.freshness?.observedAt ? (
        <p
          className="muted"
          data-dotloop-freshness={readiness.freshness.stale ? "stale" : "current"}
        >
          Resources last checked {formatBusinessTimestamp(readiness.freshness.observedAt)}
          {readiness.freshness.stale ? ". This check is out of date." : "."}
        </p>
      ) : null}
      {scopes ? (
        <p
          className="muted"
          data-dotloop-scopes={scopes.reported ? "reported" : "unreported"}
        >
          {scopes.reported
            ? `Dotloop reported access: account ${scopes.accountRead ? "yes" : "no"}, profiles ${scopes.profileRead ? "yes" : "no"}, templates ${scopes.templateRead ? "yes" : "no"}, loop reading ${scopes.loopRead ? "yes" : "no"}, loop writing ${scopes.loopWrite ? "yes" : "no"}.`
            : "Dotloop has not reported this connection's granted access, so loop writing is not verified."}
        </p>
      ) : null}
      {selection ? (
        <ul className="compact-list" data-dotloop-selection>
          <li>
            Profile: {readiness.selectionDetail?.profileName ?? selection.profileLabel} (
            {SELECTION_LABEL[readiness.selectionDetail?.profile ?? "unknown"]})
          </li>
          <li>
            Renewal template:{" "}
            {readiness.selectionDetail?.templateName ?? selection.templateLabel} (
            {SELECTION_LABEL[readiness.selectionDetail?.template ?? "unknown"]})
          </li>
          <li>
            Transaction type:{" "}
            {selection.transactionType
              ? (TRANSACTION_LABEL[selection.transactionType] ??
                selection.transactionType)
              : "not chosen"}
            ; initial status:{" "}
            {selection.initialStatus
              ? statusLabel(selection.initialStatus)
              : "not chosen"}
          </li>
        </ul>
      ) : null}
      {readiness.reasons.length ? (
        <ul data-dotloop-reasons>
          {readiness.reasons.map((reason) => (
            <li key={reason}>
              {DOTLOOP_READINESS_REASON_TEXT[reason]}{" "}
              <span className="muted">{DOTLOOP_READINESS_NEXT_ACTION[reason]}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p>Signature setup and sending are completed by a person in Dotloop.</p>
      {canManage ? (
        <div className="ui-stack-tight">
          <div className="ui-row">
            <Button
              busy={refreshing}
              busyLabel="Checking Dotloop resources"
              onClick={() => void refreshResources()}
              type="button"
              variant="secondary"
            >
              Refresh Dotloop resources
            </Button>
          </div>
          <p aria-atomic="true" aria-live="polite" className="muted" role="status">
            {message ?? ""}
          </p>
          <DotloopResourcePicker picker={picker} selection={selection} />
        </div>
      ) : (
        <p className="muted">
          An Admin manages this company connection. Your renewal work uses it without a
          separate Dotloop sign-in.
        </p>
      )}
    </section>
  );
}

function DotloopResourcePicker({
  picker,
  selection,
}: Readonly<{
  picker: DotloopPickerView | null;
  selection: DotloopSelectionSummary | null;
}>) {
  const router = useRouter();
  const [profileId, setProfileId] = useState(selection?.profileId ?? "");
  const [templateId, setTemplateId] = useState(selection?.templateId ?? "");
  const [initialStatus, setInitialStatus] = useState(selection?.initialStatus ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const templates = useMemo(
    () => (picker && profileId ? (picker.templatesByProfile[profileId] ?? []) : []),
    [picker, profileId],
  );
  const template = templates.find((entry) => entry.id === templateId) ?? null;

  if (!picker) {
    return (
      <p className="muted" data-dotloop-picker="empty">
        Refresh Dotloop resources after connecting to choose the renewal profile and
        template.
      </p>
    );
  }

  async function save() {
    if (!template?.transactionType || !initialStatus) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/connections/dotloop/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: profileId,
          template_id: templateId,
          transaction_type: template.transactionType,
          initial_status: initialStatus,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setMessage(body?.error ?? "The selection was not saved. Please try again.");
        return;
      }
      setMessage("The Dotloop renewal resources were saved.");
      router.refresh();
    } catch {
      setMessage("The selection was not saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="ui-stack-tight"
      data-dotloop-picker="ready"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {picker.stale ? (
        <Notice tone="caution">
          This resource list is out of date for the current connection. Refresh it before
          choosing.
        </Notice>
      ) : null}
      <Field htmlFor="dotloop-profile" label="Dotloop profile" required>
        <select
          disabled={busy || picker.stale}
          id="dotloop-profile"
          onChange={(event) => {
            setProfileId(event.target.value);
            setTemplateId("");
            setInitialStatus("");
          }}
          value={profileId}
        >
          <option value="">Choose a profile</option>
          {picker.profiles.map((profile) => (
            <option disabled={!profile.supported} key={profile.id} value={profile.id}>
              {profile.name || profile.id}
              {profile.supported ? "" : " (cannot create lease loops)"}
            </option>
          ))}
        </select>
      </Field>
      <Field htmlFor="dotloop-template" label="Renewal template" required>
        <select
          disabled={busy || picker.stale || !profileId}
          id="dotloop-template"
          onChange={(event) => {
            setTemplateId(event.target.value);
            setInitialStatus("");
          }}
          value={templateId}
        >
          <option value="">Choose a template</option>
          {templates.map((entry) => (
            <option disabled={!entry.supported} key={entry.id} value={entry.id}>
              {entry.name || entry.id}
              {entry.supported
                ? ` (${TRANSACTION_LABEL[entry.transactionType ?? ""] ?? entry.transactionType})`
                : " (not a lease template)"}
            </option>
          ))}
        </select>
      </Field>
      <Field htmlFor="dotloop-initial-status" label="Initial loop status" required>
        <select
          disabled={busy || picker.stale || !template?.supported}
          id="dotloop-initial-status"
          onChange={(event) => setInitialStatus(event.target.value)}
          value={initialStatus}
        >
          <option value="">Choose a status</option>
          {(template?.statuses ?? []).map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>
      </Field>
      <div className="ui-row">
        <Button
          busy={busy}
          busyLabel="Saving the renewal resources"
          disabled={picker.stale || !profileId || !template?.supported || !initialStatus}
          type="submit"
          variant="secondary"
        >
          Save renewal resources
        </Button>
      </div>
      <p aria-atomic="true" aria-live="polite" className="muted" role="status">
        {message ?? ""}
      </p>
    </form>
  );
}
