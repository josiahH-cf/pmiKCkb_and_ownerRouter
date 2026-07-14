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

  async function startPushWatch() {
    if (connection !== "connected" || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/gmail-hub/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "The Gmail watch could not be renewed.");
      const expirationMs = Number(data.expiration);
      setSyncMessage(
        Number.isFinite(expirationMs)
          ? `Targeted reply watch active until ${new Date(expirationMs).toLocaleString()}.`
          : "Targeted reply watch active.",
      );
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
            onClick={() => void startPushWatch()}
            type="button"
          >
            Start or renew targeted reply watch
          </button>
        ) : null}
      </div>

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
                    communication — {statusLabel(communication.status)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {error ? <p className="error-text">{error}</p> : null}
      <p className="muted">
        Inbox search, recent-inbox browsing, free-form compose, and arbitrary labels are
        not available here. Open the authorized renewal run or maintenance ticket to read
        or act.
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
