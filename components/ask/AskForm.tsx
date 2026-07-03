"use client";

import Link from "next/link";
import { useState } from "react";
import { useAudioRecorder } from "@/components/hooks/useAudioRecorder";
import { SourceStateBanner } from "@/components/source-state-banner/SourceStateBanner";
import { detectProcess } from "@/lib/processes/intent";
import { launchSpaces } from "@/lib/spaces";
import type { AskResponse } from "@/lib/schemas";
// Type-only import (erased at build) so the server-only app-state module never enters the client bundle.
import type { AppStateQuery, AppStateResult } from "@/lib/ask/app-state-context";

type SelectOption = { label: string; value: string };

// Visible slash-command affordances (S10): map each button to a read-only app-state query. The query
// ids mirror APP_STATE_QUERIES in lib/ask/app-state-context.ts (kept client-safe here, no server import).
const APP_STATE_COMMANDS: ReadonlyArray<{ query: AppStateQuery; label: string }> = [
  { query: "approvals", label: "My approvals" },
  { query: "connections", label: "Connections to set up" },
  { query: "coverage", label: "Space coverage" },
];

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

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

/** The Console's one-line "start here" pointer (S13 C3): the most urgent waiting decision. */
export type ConsoleNextAction = { count: number; label: string; href: string };

export function AskForm({
  canStartSimulation = false,
  processes = [],
  commandCounts = {},
  nextAction = null,
}: Readonly<{
  canStartSimulation?: boolean;
  processes?: ProcessOption[];
  /** Live, value-free counts for the command buttons (server-gathered, non-fatal). */
  commandCounts?: Partial<Record<AppStateQuery, number>>;
  nextAction?: ConsoleNextAction | null;
}>) {
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
  const [isDetecting, setIsDetecting] = useState(false);
  const [appState, setAppState] = useState<AppStateResult | null>(null);
  const [appStateLoading, setAppStateLoading] = useState<AppStateQuery | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const showProcessPicker = canStartSimulation && processes.length > 0;
  const willSimulate = showProcessPicker && processId !== "";
  const processOptions: SelectOption[] = [
    { label: "Just ask (no process)", value: "" },
    ...processes.map((process) => ({
      label: `${process.name} (${process.status})`,
      value: process.id,
    })),
  ];
  // Intent-detection: when no process is picked yet, the deterministic matcher suggests one for free
  // as the user types; the model-backed "Detect with AI" fallback runs only on explicit click.
  const showDetectArea =
    showProcessPicker && processId === "" && question.trim().length >= 6;
  const suggestion = showDetectArea ? detectProcess(question, processes) : null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setResult(null);
    setSimulationRun(null);
    setStatusMessage("");
    setCaptureStatus("");

    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
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
        setStatusMessage(
          await readErrorMessage(runResponse, "Test run could not be started."),
        );
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

  async function detectWithAi() {
    setIsDetecting(true);
    setStatusMessage("");

    const response = await fetch("/api/processes/classify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });

    if (response.ok) {
      const payload = (await response.json()) as { processId: string | null };
      if (payload.processId) {
        setProcessId(payload.processId);
      } else {
        setStatusMessage("No matching process found for this question.");
      }
    } else {
      setStatusMessage(await readErrorMessage(response, "Could not detect a process."));
    }

    setIsDetecting(false);
  }

  async function loadAppState(query: AppStateQuery) {
    setAppStateLoading(query);
    setStatusMessage("");
    try {
      const response = await fetch(`/api/ask/app-state?query=${query}`);
      if (response.ok) {
        setAppState((await response.json()) as AppStateResult);
      } else {
        setStatusMessage(await readErrorMessage(response, "Could not load app state."));
      }
    } finally {
      setAppStateLoading(null);
    }
  }

  async function transcribeAudio(blob: Blob) {
    setIsTranscribing(true);
    try {
      const audioBase64 = await blobToBase64(blob);
      const response = await fetch("/api/ask/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audioBase64, mimeType: blob.type || "audio/webm" }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { transcript: string };
        if (payload.transcript.trim()) {
          setQuestion((prev) =>
            [prev, payload.transcript].filter(Boolean).join(" ").trim(),
          );
        } else {
          setStatusMessage("No speech detected. Try again a little closer to the mic.");
        }
      } else {
        setStatusMessage(
          await readErrorMessage(response, "Could not transcribe the recording."),
        );
      }
    } catch {
      setStatusMessage(
        "Could not reach the transcription service. Type your question instead.",
      );
    } finally {
      setIsTranscribing(false);
    }
  }

  const { isRecording, toggleRecording } = useAudioRecorder({
    onRecording: transcribeAudio,
    onError: setStatusMessage,
    onStatus: setStatusMessage,
  });

  const canCapture = result ? capturableStates.has(result.source_state) : false;
  const submitLabel = isPending
    ? "Working"
    : willSimulate
      ? "Get answer + start a test run"
      : "Get answer";

  return (
    <div className="ask-console">
      {nextAction ? (
        // The next right action (S13 C3): one line, one primary deep link, straight to the most
        // urgent waiting decision. Advisory only; the decision itself happens on the linked page.
        <p className="console-next-action">
          {nextAction.count} {nextAction.count === 1 ? "thing needs" : "things need"} your
          decision. Start with{" "}
          <Link className="text-link" href={nextAction.href}>
            {nextAction.label}
          </Link>
          .
        </p>
      ) : null}

      <div className="console-commands" role="group" aria-label="Console commands">
        {APP_STATE_COMMANDS.map((command) => {
          const count = commandCounts[command.query] ?? 0;
          const label = count > 0 ? `${command.label} (${count})` : command.label;
          return (
            <button
              className="secondary-button"
              disabled={appStateLoading !== null}
              key={command.query}
              onClick={() => loadAppState(command.query)}
              type="button"
            >
              {appStateLoading === command.query ? "Loading…" : label}
            </button>
          );
        })}
      </div>

      {appState ? (
        <AppStatePanel result={appState} onDismiss={() => setAppState(null)} />
      ) : null}

      <div className="ask-grid">
        <form className="ask-form panel" onSubmit={submit}>
          <div className="field-label-row">
            <label htmlFor="question">Question</label>
            <button
              aria-pressed={isRecording}
              className="secondary-button"
              disabled={isTranscribing}
              onClick={toggleRecording}
              type="button"
            >
              {isRecording
                ? "Stop recording"
                : isTranscribing
                  ? "Transcribing…"
                  : "Dictate"}
            </button>
          </div>
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

          {showDetectArea ? (
            suggestion ? (
              <p className="muted">
                Looks like <strong>{suggestion.name}</strong>.{" "}
                <button
                  className="secondary-button"
                  onClick={() => setProcessId(suggestion.processId)}
                  type="button"
                >
                  Use {suggestion.name}
                </button>
              </p>
            ) : (
              <p className="muted">
                <button
                  className="secondary-button"
                  disabled={isDetecting}
                  onClick={detectWithAi}
                  type="button"
                >
                  {isDetecting ? "Detecting…" : "Detect process with AI"}
                </button>
              </p>
            )
          ) : null}

          {willSimulate ? (
            <p className="muted">
              Starting this process runs a test only. Nothing is sent, and nothing is
              written to a system of record.
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
                  <h3>Test run started</h3>
                  <p>
                    <strong>{simulationRun.process_name}</strong>: {simulationRun.status}
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
    </div>
  );
}

// Read-only, advisory app-state result (S10): reports state + deep links, never executes. The engine
// surfaces (Approval Queue, Connections, Spaces) remain the only place actions happen.
function AppStatePanel({
  result,
  onDismiss,
}: Readonly<{ result: AppStateResult; onDismiss: () => void }>) {
  return (
    <div className="panel app-state-panel" aria-live="polite">
      <div className="section-heading-row">
        <div>
          <h2>{result.title}</h2>
          <p className="muted">{result.summary}</p>
        </div>
        <button className="secondary-button" onClick={onDismiss} type="button">
          Dismiss
        </button>
      </div>
      {result.items.length > 0 ? (
        <ul className="app-state-list">
          {result.items.map((item) => (
            <li key={`${item.href}::${item.label}`}>
              <Link href={item.href}>{item.label}</Link>
              {item.detail ? <span className="muted"> — {item.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
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

  return typeof payload.error === "string" && payload.error.trim()
    ? payload.error
    : fallback;
}
