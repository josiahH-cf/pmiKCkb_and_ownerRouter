"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { WAITING_ON_GMAIL } from "@/lib/notifications/families";

interface CommunicationAttention {
  id: string;
  lane: "renewals" | "maintenance";
  purpose: "renewal_owner" | "renewal_tenant" | "maintenance_owner";
  status: "linked" | "draft_created" | "sent" | "attention_required";
  href: string;
  createdAtMs: number;
  attentionAtMs?: number;
}

interface GmailWatchPreview {
  mailboxEmail: string;
  topicName: string;
  currentWatchExpirationMs: number | null;
  effect: string;
  proposedExpiration: string;
  risk: string;
  reversibility: string;
}

export function LiveGmailWorkspace({
  authenticatedEmail,
}: {
  authenticatedEmail: string;
}) {
  const hasAuthenticatedMailbox = /^[^@\s]+@[^@\s]+$/.test(authenticatedEmail);
  const [connection, setConnection] = useState<
    "checking" | "gated" | "connected" | "degraded"
  >(hasAuthenticatedMailbox ? "checking" : "gated");
  const [connectionMessage, setConnectionMessage] = useState(WAITING_ON_GMAIL);
  const [connectedEmail, setConnectedEmail] = useState(authenticatedEmail);
  const [syncMessage, setSyncMessage] = useState("Manual watch renewal only");
  const [communications, setCommunications] = useState<CommunicationAttention[]>([]);
  const [watchPreview, setWatchPreview] = useState<GmailWatchPreview | null>(null);
  const [watchAttemptKey, setWatchAttemptKey] = useState("");
  const [watchConfirmed, setWatchConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadCommunications = useCallback(async () => {
    const response = await fetch("/api/gmail-hub/communications");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Workflow communications could not be loaded.");
    }
    setCommunications((data.communications ?? []) as CommunicationAttention[]);
  }, []);

  useEffect(() => {
    if (!hasAuthenticatedMailbox) return;
    let active = true;
    void fetch("/api/gmail-hub/connection")
      .then(async (response) => ({ response, data: await response.json() }))
      .then(async ({ response, data }) => {
        if (!active) return;
        if (response.ok && data.status === "connected") {
          setConnection("connected");
          setConnectionMessage(`Connected as ${data.mailboxEmail}`);
          setConnectedEmail(data.mailboxEmail);
          setSyncMessage(
            data.sync?.health === "watching" && data.sync?.lastSuccessfulSyncMs
              ? `Targeted reply detection last processed ${new Date(data.sync.lastSuccessfulSyncMs).toLocaleString()}`
              : "On-demand workflow reads are active; push watch needs operator review.",
          );
          try {
            await loadCommunications();
          } catch (loadError) {
            if (!active) return;
            setError(
              loadError instanceof Error
                ? loadError.message
                : "Workflow communications could not be loaded.",
            );
          }
          return;
        }
        setConnection(
          response.status === 503 || data.status === "gated" ? "gated" : "degraded",
        );
        setConnectionMessage(data.reason ?? data.error ?? WAITING_ON_GMAIL);
      })
      .catch(() => {
        if (active) {
          setConnection("degraded");
          setConnectionMessage("Gmail connection health could not be checked.");
        }
      });
    return () => {
      active = false;
    };
  }, [hasAuthenticatedMailbox, loadCommunications]);

  async function reviewPushWatch() {
    if (connection !== "connected" || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/gmail-hub/watch");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "The Gmail watch preview could not be loaded.");
      }
      setWatchPreview(data as GmailWatchPreview);
      setWatchAttemptKey(globalThis.crypto.randomUUID());
      setWatchConfirmed(false);
    } catch (watchError) {
      setError(
        watchError instanceof Error
          ? watchError.message
          : "The Gmail watch preview could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function startPushWatch() {
    if (
      connection !== "connected" ||
      busy ||
      !watchPreview ||
      !watchAttemptKey ||
      !watchConfirmed
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/gmail-hub/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mailboxEmail: watchPreview.mailboxEmail,
          topicName: watchPreview.topicName,
          observedWatchExpirationMs: watchPreview.currentWatchExpirationMs,
          attemptKey: watchAttemptKey,
          confirmed: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.status === "ambiguous") {
          setSyncMessage(
            "Watch outcome ambiguous; the one-attempt key is consumed. Review current watch health before trying again.",
          );
        }
        throw new Error(data.error ?? "The Gmail watch could not be renewed.");
      }
      const expirationMs = Number(data.expiration);
      setSyncMessage(
        Number.isFinite(expirationMs)
          ? `Targeted reply watch readback confirmed until ${new Date(expirationMs).toLocaleString()}.`
          : "Targeted reply watch active.",
      );
      setWatchPreview(null);
      setWatchAttemptKey("");
      setWatchConfirmed(false);
    } catch (watchError) {
      setError(
        watchError instanceof Error
          ? watchError.message
          : "The Gmail watch could not be renewed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const liveEnabled = connection === "connected";
  return (
    <article className="panel ui-stack live-gmail-workspace">
      <div className="ui-spread">
        <div>
          <h2>Gmail connection</h2>
          <p className="muted">
            Gmail remains the message system of record. This surface shows bodyless,
            workflow-linked communication attention only.
          </p>
        </div>
        <span
          className="queue-pill"
          data-value={liveEnabled ? "Available" : "Action Required"}
        >
          {connection === "checking" ? "Checking connection" : connectionMessage}
        </span>
      </div>

      <div className="gmail-live-identity">
        <span className="muted">Authenticated mailbox</span>
        <strong>{connectedEmail}</strong>
        <span className="muted">{syncMessage}</span>
        {liveEnabled ? (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void reviewPushWatch()}
            type="button"
          >
            Review targeted reply watch renewal
          </button>
        ) : null}
      </div>

      {watchPreview ? (
        <section
          className="notice notice-warning ui-stack"
          aria-label="Gmail watch exact preview"
        >
          <div>
            <strong>Exact Live watch preview</strong>
            <p>
              Review the mailbox, topic, current state, and one-attempt boundary before
              execution.
            </p>
          </div>
          <dl className="review-grid">
            <div>
              <dt>Mailbox</dt>
              <dd>{watchPreview.mailboxEmail}</dd>
            </div>
            <div>
              <dt>Topic</dt>
              <dd>{watchPreview.topicName}</dd>
            </div>
            <div>
              <dt>Current expiration</dt>
              <dd>
                {watchPreview.currentWatchExpirationMs
                  ? new Date(watchPreview.currentWatchExpirationMs).toLocaleString()
                  : "No active expiration recorded"}
              </dd>
            </div>
            <div>
              <dt>Attempt key</dt>
              <dd>{watchAttemptKey}</dd>
            </div>
            <div>
              <dt>Effect</dt>
              <dd>{watchPreview.effect}</dd>
            </div>
            <div>
              <dt>Proposed expiration</dt>
              <dd>{watchPreview.proposedExpiration}</dd>
            </div>
            <div>
              <dt>Risk</dt>
              <dd>{watchPreview.risk}</dd>
            </div>
            <div>
              <dt>Reversibility</dt>
              <dd>{watchPreview.reversibility}</dd>
            </div>
          </dl>
          <label>
            <input
              checked={watchConfirmed}
              disabled={busy}
              onChange={(event) => setWatchConfirmed(event.target.checked)}
              type="checkbox"
            />{" "}
            I confirm this exact mailbox, topic, and single Live provider attempt.
          </label>
          <div className="button-row">
            <button
              className="primary-button"
              disabled={busy || !watchConfirmed}
              onClick={() => void startPushWatch()}
              type="button"
            >
              Confirm and execute one watch attempt
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                setWatchPreview(null);
                setWatchAttemptKey("");
                setWatchConfirmed(false);
              }}
              type="button"
            >
              Cancel watch review
            </button>
          </div>
        </section>
      ) : null}

      {!liveEnabled ? (
        <div className="notice notice-warning" role="status">
          <strong>
            {connection === "degraded" ? "Gmail is degraded" : WAITING_ON_GMAIL}
          </strong>
          <p>{connectionMessage}</p>
        </div>
      ) : (
        <section className="ui-stack" aria-label="Workflow communication attention">
          <div className="ui-spread">
            <h3>Workflow communication attention</h3>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void loadCommunications().catch((loadError) => {
                  setError(
                    loadError instanceof Error ? loadError.message : "Refresh failed.",
                  );
                })
              }
              type="button"
            >
              Refresh attention
            </button>
          </div>
          {communications.length === 0 ? (
            <p className="muted">
              No linked renewal or maintenance communication needs attention.
            </p>
          ) : (
            <ul className="compact-list">
              {communications.map((communication) => (
                <li key={communication.id}>
                  <Link href={communication.href}>
                    {communication.lane === "renewals" ? "Renewal" : "Maintenance"}{" "}
                    communication · {statusLabel(communication.status)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {error ? <p className="error-text">{error}</p> : null}
      <p className="muted">
        This surface reads and acts inside an authorized renewal run or maintenance
        ticket. Broad inbox search, compose, and labeling stay in Gmail.
      </p>
    </article>
  );
}

function statusLabel(status: CommunicationAttention["status"]) {
  switch (status) {
    case "attention_required":
      return "needs review";
    case "draft_created":
      return "draft created";
    case "sent":
      return "reply sent";
    case "linked":
      return "linked";
  }
}
