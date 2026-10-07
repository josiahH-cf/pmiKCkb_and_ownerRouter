"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { formatBusinessTimestamp } from "@/lib/date-display";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, ConfirmationDialog } from "@/components/ui";
import type { ConnectMethod } from "@/lib/connections/connector-catalog";
import type {
  ConnectorConnectionView,
  ConnectorDisconnectView,
} from "@/lib/connections/connection-status";
import { isTrustedDotloopAuthorizeUrl } from "@/lib/connections/dotloop-authorize-url";

export function ConnectorSetupActions({
  connectorId,
  connectorName,
  method,
  connection,
  navigate,
}: Readonly<{
  connectorId: string;
  connectorName: string;
  method: ConnectMethod;
  connection?: ConnectorConnectionView;
  /** Follows the provider authorization address; tests observe it without leaving the page. */
  navigate?: (url: string) => void;
}>) {
  if (method === "google") return null;

  if (method === "api_key") {
    return (
      <ConnectorApiKeySetup
        connection={connection}
        connectorId={connectorId}
        connectorName={connectorName}
        method={method}
      />
    );
  }

  return (
    <ConnectorOAuthSetup
      connection={connection}
      connectorId={connectorId}
      connectorName={connectorName}
      method={method}
      navigate={navigate ?? ((url) => window.location.assign(url))}
    />
  );
}

function ConnectorApiKeySetup({
  connectorId,
  connectorName,
  method,
  connection,
}: Readonly<{
  connectorId: string;
  connectorName: string;
  method: ConnectMethod;
  connection?: ConnectorConnectionView;
}>) {
  return (
    <div className="ui-stack-tight">
      <p className="muted">
        {connectorName} connects with a key that is set up on the server, not entered
        here. Ask an administrator to run the setup, then use Verify connection to confirm
        it works.
      </p>
      <ConnectorDisconnectControl
        connection={connection}
        connectorId={connectorId}
        connectorName={connectorName}
        method={method}
      />
    </div>
  );
}

function ConnectorOAuthSetup({
  connectorId,
  connectorName,
  method,
  connection,
  navigate,
}: Readonly<{
  connectorId: string;
  connectorName: string;
  method: ConnectMethod;
  connection?: ConnectorConnectionView;
  navigate: (url: string) => void;
}>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mayConnect =
    !connection ||
    (connection.status === "revoked" && connection.disconnect?.state === "revoked");

  async function connect() {
    setBusy(true);
    setMessage(null);
    let leaving = false;
    try {
      const response = await fetch(`/api/connections/${connectorId}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await response.json().catch(() => null)) as {
        status?: string;
        authorizeUrl?: unknown;
        error?: string;
      } | null;
      if (body?.status === "credentials_not_configured") {
        setMessage(
          `The ${connectorName} application configuration is incomplete. Nothing was opened.`,
        );
      } else if (body?.status === "provider_not_available") {
        setMessage("This connector's sign-in isn't available yet.");
      } else if (!response.ok) {
        setMessage(body?.error ?? "That did not go through. Please try again.");
      } else if (
        body?.status === "authorize_url" &&
        connectorId === "dotloop" &&
        isTrustedDotloopAuthorizeUrl(body.authorizeUrl)
      ) {
        // Not connected yet: the provider consent and the callback's checks decide that.
        setMessage(`Opening ${connectorName} to authorize the company account.`);
        leaving = true;
        navigate(body.authorizeUrl);
      } else {
        setMessage(
          "The authorization address was not recognized, so nothing was opened. Nothing was connected.",
        );
      }
    } catch {
      setMessage("That did not go through. Please try again.");
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <div className="ui-stack-tight">
      {mayConnect ? (
        <Button
          busy={busy}
          busyLabel={`Connecting with ${connectorName}`}
          onClick={connect}
          type="button"
          variant="secondary"
        >
          Connect with {connectorName}
        </Button>
      ) : null}
      <ConnectorDisconnectControl
        connection={connection}
        connectorId={connectorId}
        connectorName={connectorName}
        method={method}
      />
      <p aria-atomic="true" aria-live="polite" className="muted" role="status">
        {message ?? ""}
      </p>
    </div>
  );
}

function ConnectorDisconnectControl({
  connectorId,
  connectorName,
  method,
  connection,
}: Readonly<{
  connectorId: string;
  connectorName: string;
  method: ConnectMethod;
  connection?: ConnectorConnectionView;
}>) {
  const disconnect = connection?.disconnect;
  if (!disconnect) return null;

  if (disconnect.state === "revoked") {
    return (
      <div className="ui-stack-tight" data-connector-revocation-receipt>
        <p role="status">
          Disconnected
          {disconnect.completed_at
            ? ` at ${formatBusinessTimestamp(disconnect.completed_at)}`
            : ""}
          .
        </p>
        {disconnect.provider_revocation === "unverified" ? (
          <p className="muted" data-provider-revocation="unverified">
            The app&apos;s stored credentials were removed. {connectorName} did not
            confirm every token was revoked.
          </p>
        ) : null}
        {disconnect.operation_id ? (
          <p className="muted">Receipt: {disconnect.operation_id}</p>
        ) : null}
        <a href={`/connections#connector-${connectorId}`}>
          Review setup before reconnecting
        </a>
      </div>
    );
  }

  if (!disconnect.recovery_available || !disconnect.record_version) {
    return (
      <p className="muted" role="status">
        Disconnect recovery needs Admin investigation. No credential action is available.
      </p>
    );
  }

  return (
    <ConnectorDisconnectButton
      connectorId={connectorId}
      connectorName={connectorName}
      disconnect={disconnect}
      method={method}
    />
  );
}

function ConnectorDisconnectButton({
  connectorId,
  connectorName,
  method,
  disconnect,
}: Readonly<{
  connectorId: string;
  connectorName: string;
  method: ConnectMethod;
  disconnect: ConnectorDisconnectView;
}>) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [operationId, setOperationId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requiredPhrase = `Disconnect ${connectorName}`;
  const phraseId = `connector-disconnect-phrase-${connectorId}`;

  function showDialog() {
    setPhrase("");
    setMessage(null);
    setOperationId(disconnect.operation_id ?? globalThis.crypto.randomUUID());
    setOpen(true);
  }

  function closeDialog() {
    if (busy) return;
    setOpen(false);
    setPhrase("");
  }

  async function submit() {
    if (busy || phrase !== requiredPhrase || !operationId || !disconnect.record_version) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const mode =
        disconnect.state === "connected"
          ? "start"
          : disconnect.state === "legacy_pending"
            ? "adopt_legacy"
            : "recover";
      const response = await fetch(`/api/connections/${connectorId}/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          operationId,
          connectorId,
          observedVersion: disconnect.record_version,
          confirmationPhrase: phrase,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setMessage(body?.error ?? "Disconnect needs recovery. Refresh and try again.");
        return;
      }
      const receipt = (await response.json().catch(() => null)) as {
        providerRevocation?: string;
      } | null;
      setOpen(false);
      setMessage(
        receipt?.providerRevocation === "unverified"
          ? `${connectorName} is disconnected. The app's stored credentials were removed; ${connectorName} did not confirm every token was revoked.`
          : `${connectorName} is disconnected.`,
      );
      router.refresh();
    } catch {
      setMessage("The response was lost. Refresh to recover the same disconnect.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const pending = disconnect.state !== "connected";
  return (
    <div className="ui-stack-tight">
      {pending ? (
        <p className="muted" role="status">
          Disconnecting: needs recovery.
        </p>
      ) : null}
      <Button disabled={busy} onClick={showDialog} ref={triggerRef} variant="secondary">
        {pending ? "Retry disconnect" : "Disconnect"}
      </Button>
      <p aria-atomic="true" aria-live="polite" className="muted" role="status">
        {open ? "" : (message ?? "")}
      </p>
      <ConfirmationDialog
        busy={busy}
        busyLabel={`Disconnecting ${connectorName}`}
        confirmDisabled={phrase !== requiredPhrase}
        confirmLabel="Confirm disconnect"
        confirmVariant="destructive"
        description={
          <p>
            This removes the stored {method === "oauth" ? "OAuth" : "API key"}
            connection credentials. Work that depends on {connectorName} may stop.
          </p>
        }
        error={open ? message : null}
        onCancel={closeDialog}
        onConfirm={() => void submit()}
        open={open}
        title={`Disconnect ${connectorName}`}
        triggerRef={triggerRef}
      >
        <p>
          <a href={`/connections#connector-${connectorId}`}>Review connection setup</a>
        </p>
        <label htmlFor={phraseId}>
          Type <strong>{requiredPhrase}</strong> exactly
        </label>
        <input
          autoComplete="off"
          disabled={busy}
          id={phraseId}
          onChange={(event) => setPhrase(event.target.value)}
          spellCheck={false}
          value={phrase}
        />
      </ConfirmationDialog>
    </div>
  );
}
