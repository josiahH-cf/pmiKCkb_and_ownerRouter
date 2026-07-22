"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field } from "@/components/ui";
import type { SpaceProvisioningPlan } from "@/lib/admin/space-request-commands";
import type { SpaceRequest } from "@/lib/firestore/space-requests";

// Admin "request a new Space" form (Slice 7, D12). Records the request through the manageAdmin-guarded
// route and shows the auto-generated owner provisioning commands + .env.local lines. It provisions
// nothing: the app records the request and prints the commands; the owner runs them.
export function SpaceRequestPanel({
  initialRequests,
}: Readonly<{ initialRequests: SpaceRequest[] }>) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scope, setScope] = useState("");
  const [sources, setSources] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<SpaceProvisioningPlan | null>(null);

  const id = { name: useId(), scope: useId(), sources: useId() };
  const ready = name.trim().length >= 2 && scope.trim().length >= 3;

  async function submit() {
    setPending(true);
    setError("");
    setPlan(null);
    const intendedSources = sources
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    try {
      const response = await fetch("/api/admin/spaces/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scope: scope.trim(), intendedSources }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { plan: SpaceProvisioningPlan };
        setPlan(payload.plan);
        router.refresh();
      } else {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Could not record the Space request.");
      }
    } catch {
      setError("Could not reach the Space request service.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ui-stack">
      <Field htmlFor={id.name} label="Space name" required>
        <input
          id={id.name}
          onChange={(event) => setName(event.target.value)}
          placeholder="For example: Owner Statements"
          value={name}
        />
      </Field>
      <Field htmlFor={id.scope} label="What is this Space for?" required>
        <textarea
          id={id.scope}
          onChange={(event) => setScope(event.target.value)}
          rows={3}
          value={scope}
        />
      </Field>
      <Field htmlFor={id.sources} label="Intended sources (one per line, optional)">
        <textarea
          id={id.sources}
          onChange={(event) => setSources(event.target.value)}
          rows={4}
          value={sources}
        />
      </Field>
      <div className="ui-row">
        <Button disabled={!ready || pending} onClick={() => void submit()} type="button">
          {pending ? "Saving…" : "Request Space and generate commands"}
        </Button>
      </div>
      {error ? <p className="muted">{error}</p> : null}
      {plan ? <ProvisioningPlanView plan={plan} /> : null}

      {initialRequests.length > 0 ? (
        <div className="ui-stack">
          <h2 className="section-title">Prior requests</h2>
          <ul className="ui-rows">
            {initialRequests.map((request) => (
              <li className="ui-stack-tight" key={request.id}>
                <span>
                  <strong>{request.name}</strong>{" "}
                  <span className="muted">({request.spaceId})</span>
                </span>
                <span className="muted">{request.scope}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ProvisioningPlanView({ plan }: Readonly<{ plan: SpaceProvisioningPlan }>) {
  return (
    <div className="ui-stack">
      <h2 className="section-title">Provisioning steps for {plan.spaceId}</h2>
      {plan.alreadyExists ? (
        <p className="muted">
          Heads up: a Space keyed {plan.spaceId} already exists in the config. Pick a different
          name or update that Space instead of creating a duplicate.
        </p>
      ) : null}
      <h3>Owner console commands (run these yourself)</h3>
      <pre className="draft-box">{plan.commands.join("\n")}</pre>
      <h3>.env.local lines to set</h3>
      <pre className="draft-box">{plan.envLocalLines.join("\n")}</pre>
      <h3>Notes</h3>
      <ul className="ui-rows">
        {plan.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
