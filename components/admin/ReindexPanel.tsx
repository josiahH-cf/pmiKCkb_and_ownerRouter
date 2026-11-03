"use client";
import { fetchWithDeadline as fetch, waitFailureMessage } from "@/lib/ui/fetch-lifetime";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field } from "@/components/ui";
import type { ReindexCommandPlan } from "@/lib/admin/reindex-command";
import type { ReindexRequest } from "@/lib/firestore/reindex-requests";
import { formatBusinessTimestamp } from "@/lib/date-display";

// Admin "re-index sources" control (Slice 8, D14). Re-indexing runs cost-bearing Vertex ingestion, so
// this NEVER ingests: it records an explicitly-confirmed request and prints the exact owner command.
// The confirmation checkbox is the gate; running the command is an owner action.
export function ReindexPanel({
  spaces,
  initialRequests,
}: Readonly<{
  spaces: { id: string; name: string }[];
  initialRequests: ReindexRequest[];
}>) {
  const router = useRouter();
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<ReindexCommandPlan | null>(null);
  const requestId = useRef(0);
  const selectedSpace = useRef(spaceId);
  const id = { space: useId(), confirm: useId() };

  function changeSpace(space: string) {
    requestId.current++;
    selectedSpace.current = space;
    setSpaceId(space);
    setConfirm(false);
    setPlan(null);
    setError("");
    setPending(false);
  }

  function beginRequest(space: string) {
    const request = ++requestId.current;
    if (selectedSpace.current !== space) setConfirm(false);
    selectedSpace.current = space;
    setSpaceId(space);
    setPending(true);
    setError("");
    setPlan(null);
    return request;
  }

  function isCurrent(request: number, space: string) {
    return requestId.current === request && selectedSpace.current === space;
  }

  async function submit() {
    if (!confirm) return;
    const space = spaceId;
    const request = beginRequest(space);
    try {
      const response = await fetch("/api/admin/reindex", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spaceId: space, confirm: true }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { plan: ReindexCommandPlan };
        if (isCurrent(request, space)) {
          setPlan(payload.plan);
          router.refresh();
        }
      } else {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (isCurrent(request, space))
          setError(payload.error ?? "Could not stage the re-index request.");
      }
    } catch (error) {
      if (isCurrent(request, space)) {
        setPlan(null);
        setError(waitFailureMessage(error, "Could not reach the re-index service."));
      }
    } finally {
      if (isCurrent(request, space)) setPending(false);
    }
  }

  async function reviewCurrent(space: string) {
    const request = beginRequest(space);
    try {
      const response = await fetch(
        `/api/admin/reindex?spaceId=${encodeURIComponent(space)}`,
      );
      const payload = (await response.json()) as {
        plan?: ReindexCommandPlan;
        error?: string;
      };
      if (!response.ok || !payload.plan)
        throw new Error(payload.error ?? "Current source readiness could not be read.");
      if (isCurrent(request, space)) setPlan(payload.plan);
    } catch (error) {
      if (isCurrent(request, space)) {
        setPlan(null);
        setError(waitFailureMessage(error, "Could not review the current handoff."));
      }
    } finally {
      if (isCurrent(request, space)) setPending(false);
    }
  }

  return (
    <div className="ui-stack">
      <p className="muted">
        Re-indexing runs Vertex ingestion, which is cost-bearing. This records the request
        and prints the command; you run it. Nothing is ingested automatically.
      </p>
      <Field htmlFor={id.space} label="Space to re-index" required>
        <select
          id={id.space}
          onChange={(event) => changeSpace(event.target.value)}
          value={spaceId}
        >
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </Field>
      <label className="ui-row" htmlFor={id.confirm}>
        <input
          checked={confirm}
          id={id.confirm}
          onChange={(event) => setConfirm(event.target.checked)}
          type="checkbox"
        />
        <span>I understand this is cost-bearing and I will run the command myself.</span>
      </label>
      <div className="ui-row">
        <Button
          disabled={!confirm || !spaceId || pending}
          onClick={() => void submit()}
          type="button"
          variant="secondary"
        >
          {pending ? "Saving…" : "Request re-index and show command"}
        </Button>
      </div>
      {error ? <p className="muted">{error}</p> : null}
      {plan ? (
        <div className="ui-stack">
          <h3>
            {plan.runnable ? "Reviewed command (run separately)" : "Re-index not ready"}
          </h3>
          <p className="muted">The request is saved. No import has run.</p>
          {plan.runnable ? <pre className="draft-box">{plan.command}</pre> : null}
          <ul className="ui-rows">
            {plan.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {initialRequests.length > 0 ? (
        <div className="ui-stack">
          <h3>Recent re-index requests</h3>
          <ul className="ui-rows">
            {initialRequests.map((request) => (
              <li className="ui-spread" key={request.id}>
                <strong>{request.spaceId}</strong>
                <Button
                  type="button"
                  disabled={pending}
                  variant="secondary"
                  onClick={() => void reviewCurrent(request.spaceId)}
                >
                  Review current handoff
                </Button>
                <span className="muted">
                  {formatBusinessTimestamp(request.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
