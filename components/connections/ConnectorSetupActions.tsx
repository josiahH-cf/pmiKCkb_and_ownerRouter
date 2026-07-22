"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button, Field } from "@/components/ui";
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

function ConnectorApiKeySetup({
  connectorId,
  connectorName,
  connected,
}: Readonly<{ connectorId: string; connectorName: string; connected: boolean }>) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputId = `connector-${connectorId}-api-key`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Write-only: capture the key for this one request, then clear it immediately so it is never
    // held in state or shown again.
    const secret = apiKey;
    setApiKey("");
    if (secret.length === 0) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/connections/${connectorId}/api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: secret }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setMessage(body?.error ?? "That did not go through. Please try again.");
        return;
      }
      const body = (await response.json()) as { stored: boolean };
      if (body.stored) {
        setMessage("Connected.");
        router.refresh();
      } else {
        setMessage(
          "Setup received. Secure storage is not configured yet, so nothing was stored.",
        );
      }
    } catch {
      setMessage("That did not go through. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-stack-tight">
      <form className="ui-stack-tight" onSubmit={submit}>
        <Field htmlFor={inputId} label={`Add your ${connectorName} API key`}>
          <input
            autoComplete="off"
            className="ui-input"
            disabled={busy}
            id={inputId}
            name="api_key"
            onChange={(event) => setApiKey(event.target.value)}
            type="password"
            value={apiKey}
          />
        </Field>
        <Button disabled={busy || apiKey.length === 0} type="submit" variant="secondary">
          {busy ? "Saving…" : "Save API key"}
        </Button>
      </form>
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
