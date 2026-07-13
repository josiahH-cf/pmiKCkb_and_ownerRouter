"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useAudioRecorder } from "@/components/hooks/useAudioRecorder";
import { SourceStateBanner } from "@/components/source-state-banner/SourceStateBanner";
import { detectProcess } from "@/lib/processes/intent";
import { launchSpaces } from "@/lib/spaces";
import type { AskResponse } from "@/lib/schemas";

type SelectOption = { label: string; value: string };

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

// The Console's ask + dictation surface. The always-visible action deck and process strip live in
// their own server components (ConsoleView assembles them); this form is just the AI question box.
export function AskForm({
  canStartSimulation = false,
  processes = [],
}: Readonly<{
  canStartSimulation?: boolean;
  processes?: ProcessOption[];
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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [dictationStatus, setDictationStatus] = useState("");
  const dictateButtonRef = useRef<HTMLButtonElement>(null);

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

  async function transcribeAudio(blob: Blob) {
    setIsTranscribing(true);
    setDictationStatus("Processing the recording…");
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
          setDictationStatus(
            "Transcript appended to your question. Review it before submitting.",
          );
        } else {
          setDictationStatus(
            "No speech was detected. Your typed question was preserved; try again or keep typing.",
          );
        }
      } else {
        setDictationStatus(
          await readErrorMessage(response, "Could not transcribe the recording."),
        );
      }
    } catch {
      setDictationStatus(
        "Could not reach the transcription service. Type your question instead.",
      );
    } finally {
      setIsTranscribing(false);
      requestAnimationFrame(() => dictateButtonRef.current?.focus());
    }
  }

  const {
    isRecording,
    phase: recorderPhase,
    toggleRecording,
  } = useAudioRecorder({
    onRecording: transcribeAudio,
    onError: (message) => {
      setDictationStatus(message);
      requestAnimationFrame(() => dictateButtonRef.current?.focus());
    },
    onStatus: setDictationStatus,
    onLifecycle: (phase) => {
      if (phase === "requesting-permission") {
        setDictationStatus("Requesting microphone permission…");
      } else if (phase === "recording") {
        setDictationStatus("Recording. Press Stop recording when you are finished.");
      } else if (phase === "stopping") {
        setDictationStatus("Stopping the recording…");
      } else if (phase === "processing") {
        setDictationStatus("Processing the recording…");
      }
    },
  });

  const canCapture = result ? capturableStates.has(result.source_state) : false;
  const submitLabel = isPending
    ? "Working"
    : willSimulate
      ? "Get answer + start a test run"
      : "Get answer";

  return (
    <div className="ask-console">
      <div className="ask-grid">
        <form className="ask-form panel" onSubmit={submit}>
          <div className="field-label-row">
            <label htmlFor="question">Question</label>
            <button
              ref={dictateButtonRef}
              aria-describedby="dictation-status"
              aria-pressed={isRecording}
              className="secondary-button dictate-button"
              disabled={
                isTranscribing ||
                recorderPhase === "requesting-permission" ||
                recorderPhase === "stopping" ||
                recorderPhase === "processing"
              }
              onClick={() => void toggleRecording()}
              type="button"
            >
              {isRecording
                ? "Stop recording"
                : recorderPhase === "requesting-permission"
                  ? "Requesting microphone…"
                  : recorderPhase === "stopping"
                    ? "Stopping…"
                    : isTranscribing
                      ? "Processing…"
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
          <p className="muted dictate-hint">
            Type your question, or use Dictate to speak it.
          </p>
          <p
            aria-atomic="true"
            aria-live="polite"
            className="muted dictate-status"
            id="dictation-status"
            role="status"
          >
            {dictationStatus}
          </p>

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
                  <Link href={`/workflow-runs/${simulationRun.id}`}>
                    View the test run
                  </Link>
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
