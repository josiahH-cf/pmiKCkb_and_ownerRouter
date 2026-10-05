"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOperation } from "@/components/hooks/useOperation";
import { Button, BusyIndicator, Disclosure } from "@/components/ui";
import { WAITING_ON_GMAIL } from "@/lib/notifications/families";
import { formatBusinessTimestamp } from "@/lib/date-display";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";

interface CommunicationAttention {
  id: string;
  lane: "renewals" | "maintenance";
  purpose: "renewal_owner" | "renewal_tenant" | "maintenance_owner";
  status: "linked" | "draft_created" | "sent" | "attention_required";
  href: string;
  createdAtMs: number;
  attentionAtMs?: number;
  waitingOn?: "team" | "owner" | "resident" | "vendor" | "outside" | "none";
  lastContactAtMs?: number;
  lastContactSource?: "gmail_thread";
}
export function LiveGmailWorkspace({
  authenticatedEmail,
}: {
  authenticatedEmail: string;
}) {
  return (
    <OwnedLiveGmailWorkspace
      key={authenticatedEmail}
      authenticatedEmail={authenticatedEmail}
    />
  );
}
function OwnedLiveGmailWorkspace({ authenticatedEmail }: { authenticatedEmail: string }) {
  const hasMailbox = /^[^@\s]+@[^@\s]+$/.test(authenticatedEmail);
  const health = useOperation(authenticatedEmail);
  const attention = useOperation(authenticatedEmail);
  const refresh = useOperation(authenticatedEmail);
  const scope = useRef(authenticatedEmail);
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const [connection, setConnection] = useState<
    "checking" | "gated" | "connected" | "degraded" | "forbidden"
  >(hasMailbox ? "checking" : "gated");
  const [message, setMessage] = useState("");
  const [mailbox, setMailbox] = useState(authenticatedEmail);
  const [syncMessage, setSyncMessage] = useState(
    "Manual refresh has not run in this session.",
  );
  const [communications, setCommunications] = useState<CommunicationAttention[] | null>(
    null,
  );
  const [error, setError] = useState("");
  const refreshKey = useRef<string | null>(null);
  const loadCommunications = useCallback(async () => {
    const account = authenticatedEmail;
    const result = await attention.controller.run(
      "Loading linked conversations",
      async (signal) => {
        const response = await fetchWithDeadline("/api/gmail-hub/communications", {
          signal,
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Linked conversations could not be read.");
        if (!Array.isArray(data.communications))
          throw new Error("The linked conversation response could not be validated.");
        return data.communications as CommunicationAttention[];
      },
    );
    if (scope.current !== account || result.outcome === "superseded") return;
    if (result.outcome === "succeeded") {
      setCommunications(result.value);
      setError("");
    } else
      setError(
        "Linked conversations are unavailable. The previous list may be incomplete; retry the read.",
      );
  }, [authenticatedEmail, attention.controller]);
  const checkConnection = useCallback(async () => {
    const account = authenticatedEmail;
    const result = await health.controller.run("Checking connection", async (signal) => {
      const response = await fetchWithDeadline("/api/gmail-hub/connection", {
        signal,
        cache: "no-store",
      });
      return { response, data: await response.json() };
    });
    if (scope.current !== account || result.outcome === "superseded") return;
    setCheckedFor(account);
    if (result.outcome !== "succeeded") {
      setConnection("degraded");
      setMessage("Gmail connection health could not be checked. Retry the check.");
      return;
    }
    const { response, data } = result.value;
    if (
      response.ok &&
      data.status === "connected" &&
      typeof data.mailboxEmail === "string" &&
      data.mailboxEmail.toLowerCase() === account.toLowerCase()
    ) {
      setConnection("connected");
      setMailbox(data.mailboxEmail);
      setMessage("Connected");
      setSyncMessage(
        data.sync?.lastSuccessfulSyncMs
          ? `Last refresh: ${formatBusinessTimestamp(data.sync.lastSuccessfulSyncMs)}`
          : "Manual read-only refresh is ready.",
      );
      void loadCommunications();
    } else {
      setConnection(
        response.status === 401 || response.status === 403
          ? "forbidden"
          : response.status === 503 || data.status === "gated"
            ? "gated"
            : "degraded",
      );
      setMessage(data.reason ?? data.error ?? WAITING_ON_GMAIL);
    }
  }, [authenticatedEmail, health.controller, loadCommunications]);
  useEffect(() => {
    let current = true;
    if (hasMailbox)
      queueMicrotask(() => {
        if (current) void checkConnection();
      });
    return () => {
      current = false;
    };
  }, [hasMailbox, checkConnection]);
  const sameAccount = checkedFor === authenticatedEmail;
  const state =
    hasMailbox && (!sameAccount || health.snapshot.phase === "pending")
      ? "checking"
      : connection;
  const connected = sameAccount && state === "connected";
  async function refreshMailbox() {
    if (!connected || refresh.snapshot.phase === "pending") return;
    refreshKey.current ??= globalThis.crypto.randomUUID();
    const account = authenticatedEmail;
    const result = await refresh.controller.run(
      "Refreshing linked Gmail",
      async (signal) => {
        const response = await fetchWithDeadline("/api/gmail-hub/refresh", {
          signal,
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attemptKey: refreshKey.current }),
        });
        const data = await response.json();
        if (!response.ok || !["processed", "duplicate"].includes(data.status))
          throw new Error(data.error ?? "The refresh was not confirmed.");
        return data;
      },
    );
    if (scope.current !== account || result.outcome === "superseded") return;
    if (result.outcome === "succeeded") {
      refreshKey.current = null;
      setSyncMessage(
        result.value.status === "duplicate"
          ? "The original read-only refresh is confirmed."
          : `Refresh completed at ${formatBusinessTimestamp(new Date())}.`,
      );
      await loadCommunications();
    } else
      setError(
        "Refresh outcome is unconfirmed. Recover the original refresh with Refresh linked Gmail; its attempt key is retained.",
      );
  }
  return (
    <article className="panel ui-stack live-gmail-workspace">
      <div className="ui-spread">
        <h2>Linked conversations</h2>
        <span
          className="queue-pill"
          data-value={
            state === "checking"
              ? "Checking"
              : connected
                ? "Available"
                : "Action Required"
          }
        >
          {state === "checking"
            ? "Checking connection"
            : connected
              ? "Connected"
              : state === "forbidden"
                ? "Access denied"
                : state === "degraded"
                  ? "Degraded"
                  : "Disconnected"}
        </span>
      </div>
      {state === "checking" ? (
        <div aria-busy="true">
          <BusyIndicator label="Checking connection" />
        </div>
      ) : !connected ? (
        <div className="notice notice-warning" role="status">
          <strong>
            {state === "forbidden"
              ? "Gmail access denied"
              : state === "degraded"
                ? "Gmail is degraded"
                : WAITING_ON_GMAIL}
          </strong>
          {message ? <p>{message}</p> : null}
          <Button onClick={() => void checkConnection()} variant="secondary">
            Retry connection check
          </Button>
        </div>
      ) : (
        <section
          aria-label="Workflow communication attention"
          className="ui-stack"
          aria-busy={attention.snapshot.phase === "pending"}
        >
          <div className="ui-spread">
            <h3>Needs attention</h3>
            <Button
              busy={attention.snapshot.phase === "pending"}
              busyLabel="Refreshing attention…"
              onClick={() => void loadCommunications()}
              variant="secondary"
            >
              Refresh attention
            </Button>
          </div>
          {communications === null ? (
            attention.snapshot.phase === "pending" ? (
              <BusyIndicator label="Loading linked conversations" />
            ) : (
              <p>Linked conversations have not been read. Retry the read.</p>
            )
          ) : communications.length === 0 ? (
            <p className="muted">
              No linked renewal or maintenance communication needs attention.
            </p>
          ) : (
            <ul className="compact-list">
              {communications.map((communication) => (
                <li key={communication.id}>
                  <Link href={communication.href} prefetch={false}>
                    {communication.lane === "renewals" ? "Renewal" : "Maintenance"}{" "}
                    communication · {statusLabel(communication.status)}
                  </Link>
                  <span className="muted">
                    {communication.waitingOn
                      ? ` · Waiting on ${communication.waitingOn}`
                      : " · Waiting on not yet observed"}
                    {communication.lastContactAtMs
                      ? ` · Last contact ${formatBusinessTimestamp(communication.lastContactAtMs)}`
                      : " · Last contact not yet observed"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      {connected ? (
        <Disclosure summary="Gmail connection and refresh">
          <div className="gmail-live-identity">
            <strong>{mailbox}</strong>
            <span className="muted">{syncMessage}</span>
            <Button
              busy={refresh.snapshot.phase === "pending"}
              busyLabel="Refreshing linked Gmail…"
              onClick={() => void refreshMailbox()}
              variant="secondary"
            >
              Refresh linked Gmail now
            </Button>
          </div>
        </Disclosure>
      ) : null}
    </article>
  );
}
function statusLabel(status: CommunicationAttention["status"]) {
  return status === "attention_required"
    ? "needs review"
    : status === "draft_created"
      ? "unsent draft created"
      : status === "sent"
        ? "reply sent"
        : "linked";
}
