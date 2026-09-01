"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, ConfirmationDialog } from "@/components/ui";
import type { ConnectMethod } from "@/lib/connections/connector-catalog";
import type {
  ConnectorConnectionView,
  ConnectorDisconnectView,
} from "@/lib/connections/connection-status";

export function ConnectorSetupActions({
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
}: Readonly<{
  connectorId: string;
  connectorName: string;
  method: ConnectMethod;
  connection?: ConnectorConnectionView;
}>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mayConnect =
    !connection ||
    (connection.status === "revoked" && connection.disconnect?.state === "revoked");

  async function connect() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/connections/${connectorId}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setMessage(body?.error ?? "That did not go through. Please try again.");
        return;
      }
      const body = (await response.json()) as { status: string };
      if (body.status === "credentials_not_configured") {
        setMessage(`Add the ${connectorName} connection details first.`);
      } else if (body.status === "provider_not_available") {
        setMessage("This connector's sign-in isn't available yet.");
      } else {
        setMessage("Connected.");
        router.refresh();
      }
    } catch {
      setMessage("That did not go through. Please try again.");
    } finally {
      setBusy(false);
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
          Disconnected{disconnect.completed_at ? ` at ${disconnect.completed_at}` : ""}.
        </p>
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
      setOpen(false);
      setMessage(`${connectorName} is disconnected.`);
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
