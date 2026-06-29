"use client";

import Link from "next/link";
import { useState } from "react";
import { SourceStateBanner } from "@/components/source-state-banner/SourceStateBanner";
import { launchSpaces } from "@/lib/spaces";
import type { AskResponse } from "@/lib/schemas";

type SelectOption = { label: string; value: string };

/** A process the Console can start a simulation for (from the spine's definitions). */
export type ProcessOption = { id: string; name: string; status: string };

/** Minimal shape of the workflow run the test-run API returns. */
type SimulationRunSummary = {
  id: string;
  process_name: string;
  status: string;
  next_action: string;
};

const writableSpaceOptions = launchSpaces
  .filter((space) => !space.readOnly)
  .map((space) => ({ label: space.name, value: space.id }));
const capturableStates = new Set([
  "Partial Source",
  "Open Placeholder",
  "No Reliable Source Found",
]);

export function AskForm({
  canStartSimulation = false,
  processes = [],
}: Readonly<{ canStartSimulation?: boolean; processes?: ProcessOption[] }>) {
  const [question, setQuestion] = useState("");
  const [processId, setProcessId] = useState("");
  const [captureSpace, setCaptureSpace] = useState(
    writableSpaceOptions[0]?.value ?? "lease-renewals",
  );
  const [result, setResult] = useState<AskResponse | null>(null);
  const [simulationRun, setSimulationRun] = useState<SimulationRunSummary | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [captureStatus, setCaptureStatus] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);

  const showProcessPicker = canStartSimulation && processes.length > 0;
  const willSimulate = showProcessPicker && processId !== "";
  const processOptions: SelectOption[] = [
    { label: "Just ask (no process)", value: "" },
    ...processes.map((process) => ({
      label: `${process.name} (${process.status})`,
      value: process.id,
    })),
  ];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setResult(null);
    setSimulationRun(null);
    setStatusMessage("");
    setCaptureStatus("");

    // The four Ask metadata selects (audience/channel/space/urgency) were retired with the action
    // console (R4); the answer path still accepts them, so send neutral defaults until the schema is
    // trimmed.
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        audience: "Unknown",
        channel: "Other",
        urgency: "Normal",
        draft_enabled: true,
        // A selected process makes the answer process-aware (resolved + applied server-side).
        ...(processId ? { process_id: processId } : {}),
      }),
    });

    if (!response.ok) {
      setStatusMessage(await readErrorMessage(response, "Ask request failed."));
      setIsPending(false);
      return;
    }

    setResult((await response.json()) as AskResponse);

    if (willSimulate) {
      const runResponse = await fetch(
        `/api/process-definitions/${encodeURIComponent(processId)}/test-runs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            note: `Started from the Console. Question: ${question}`.slice(0, 280),
          }),
        },
      );

      if (runResponse.ok) {
        const payload = (await runResponse.json()) as { run: SimulationRunSummary };
        setSimulationRun(payload.run);
      } else {
        setStatusMessage(await readErrorMessage(runResponse, "Simulation could not be started."));
      }
    }

    setIsPending(false);
  }

  async function captureTask() {
    if (!result) {
      return;
    }

    setIsCapturing(true);
    setCaptureStatus("");

    const response = await fetch("/api/ask/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        priority: "P1",
        question: result.question,
        source_state: result.source_state,
        space_id: captureSpace,
      }),
    });

    if (response.ok) {
      setCaptureStatus("Capture task created.");
    } else {
      setCaptureStatus(await readErrorMessage(response, "Capture failed."));
    }

    setIsCapturing(false);
  }

  const canCapture = result ? capturableStates.has(result.source_state) : false;
  const submitLabel = isPending
    ? "Working"
    : willSimulate
      ? "Get answer + start simulation"
      : "Get answer";

  return (
    <div className="ask-grid">
      <form className="ask-form panel" onSubmit={submit}>
        <label htmlFor="question">Question</label>
        <textarea
          id="question"
          minLength={3}
          name="question"
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What do you need to know?"
          required
          rows={7}
          value={question}
        />

        {showProcessPicker ? (
          <div className="field-row">
            <SelectField
              id="ask-process"
              label="Process"
              onChange={setProcessId}
              options={processOptions}
              value={processId}
            />
          </div>
        ) : null}

        {willSimulate ? (
          <p className="muted">
            Starting this process runs a simulation only — no system-of-record write, no message
            sent.
          </p>
        ) : null}

        <button className="primary-button" disabled={isPending} type="submit">
          {submitLabel}
        </button>
      </form>

      <aside className="panel result-panel" aria-live="polite">
        {result ? (
          <>
            <SourceStateBanner state={result.source_state} />
            <h2>Answer</h2>
            <p>{result.answer}</p>
            {result.handling_steps.length > 0 ? (
              <>
                <h3>Handling Steps</h3>
                <ol>
                  {result.handling_steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </>
            ) : null}
            {result.citations.length > 0 ? (
              <>
                <h3>Sources</h3>
                <ul className="source-list">
                  {result.citations.map((citation) => (
                    <li key={citation.source_id}>
                      <a href={citation.url} rel="noreferrer" target="_blank">
                        {citation.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {result.draft ? (
              <>
                <h3>Draft</h3>
                <pre className="draft-box">{result.draft}</pre>
              </>
            ) : null}
            {result.escalation_owner ? (
              <p>
                Escalation owner: <strong>{result.escalation_owner}</strong>
              </p>
            ) : null}
            {simulationRun ? (
              <div className="capture-panel">
                <h3>Process simulation started</h3>
                <p>
                  <strong>{simulationRun.process_name}</strong> — {simulationRun.status}
                </p>
                {simulationRun.next_action ? (
                  <p className="muted">Next: {simulationRun.next_action}</p>
                ) : null}
                <Link href="/processes">View in Processes</Link>
              </div>
            ) : null}
            {canCapture ? (
              <div className="capture-panel">
                <h3>Capture Task</h3>
                <SelectField
                  id="ask-capture-space"
                  label="Space"
                  onChange={setCaptureSpace}
                  options={writableSpaceOptions}
                  value={captureSpace}
                />
                <button
                  className="secondary-button"
                  disabled={isCapturing}
                  onClick={captureTask}
                  type="button"
                >
                  {isCapturing ? "Creating" : "Create Capture Task"}
                </button>
              </div>
            ) : null}
            {captureStatus ? <p className="muted">{captureStatus}</p> : null}
          </>
        ) : (
          <p className="muted">Results appear here.</p>
        )}
        {statusMessage ? <p className="muted">{statusMessage}</p> : null}
      </aside>
    </div>
  );
}

function SelectField({
  id,
  label,
  onChange,
  options,
  value,
}: Readonly<{
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  value: string;
}>) {
  return (
    <label className="select-field" htmlFor={id}>
      {label}
      <select id={id} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

async function readErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };

  return typeof payload.error === "string" && payload.error.trim() ? payload.error : fallback;
}
