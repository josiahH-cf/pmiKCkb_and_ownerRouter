"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui";
import type { ConnectMethod } from "@/lib/connections/connector-catalog";

// Admin-only connect affordance for one connector. Honest by construction: with no secure storage and
// no provider credentials wired (today), it reports exactly that and creates no connection. It never
// shows, stores, or echoes a secret value or an env var name. Positive, directive copy.
export function ConnectorSetupActions({
  connectorId,
  connectorName,
  method,
  connected,
}: Readonly<{
  connectorId: string;
  connectorName: string;
  method: ConnectMethod;
  connected: boolean;
}>) {
  // Google connectors authenticate through domain-wide delegation on the server, so there is no
  // per-connector connect control here; the existing setup copy stands.
  if (method === "google") {
    return null;
  }

  if (method === "api_key") {
    return (
      <ConnectorApiKeySetup
        connected={connected}
        connectorId={connectorId}
        connectorName={connectorName}
      />
    );
  }

  return (
    <ConnectorOAuthSetup
      connected={connected}
      connectorId={connectorId}
      connectorName={connectorName}
    />
  );
}

/**
 * HV-004 (owner decision, 2026-08-25): this card no longer accepts a credential.
 *
 * It used to render a masked API-key input and a Save API key button. The safety properties were all
 * genuinely present (masked, empty on load, autocomplete off, Save disabled while empty) and the
 * request path was write-only, but nothing was ever actually stored: the server answered
 * "Secure storage is not configured yet", so the page invited an operator to hand over a real
 * credential and then quietly discarded it while its own setup copy said otherwise.
 *
 * Removing the field removes no working function. Credential entry belongs in the server setup we
 * run ourselves. If secure storage is wired up later, re-adding an entry control is its own reviewed
 * change with tests, decided against a real capability rather than an empty seam.
 */
function ConnectorApiKeySetup({
  connectorId,
  connectorName,
  connected,
}: Readonly<{ connectorId: string; connectorName: string; connected: boolean }>) {
  return (
    <div className="ui-stack-tight">
      <p className="muted">
        {connectorName} connects with a key that is set up on the server, not entered
        here. Ask an administrator to run the setup, then use Verify connection to confirm
        it works.
      </p>
      {connected ? (
        <ConnectorDisconnectButton
          connectorId={connectorId}
          connectorName={connectorName}
        />
      ) : null}
    </div>
  );
}

function ConnectorOAuthSetup({
  connectorId,
  connectorName,
  connected,
}: Readonly<{ connectorId: string; connectorName: string; connected: boolean }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      <Button disabled={busy} onClick={connect} type="button" variant="secondary">
        {busy ? "Connecting…" : `Connect with ${connectorName}`}
      </Button>
      {connected ? (
        <ConnectorDisconnectButton
          connectorId={connectorId}
          connectorName={connectorName}
        />
      ) : null}
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}

function ConnectorDisconnectButton({
  connectorId,
  connectorName,
}: Readonly<{ connectorId: string; connectorName: string }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function disconnect() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/connections/${connectorId}/disconnect`, {
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
      setMessage(`${connectorName} is disconnected.`);
      router.refresh();
    } catch {
      setMessage("That did not go through. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-stack-tight">
      <Button disabled={busy} onClick={disconnect} type="button" variant="secondary">
        {busy ? "Disconnecting…" : "Disconnect"}
      </Button>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
