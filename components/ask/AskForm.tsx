"use client";

import { useState } from "react";
import { SourceStateBanner } from "@/components/source-state-banner/SourceStateBanner";
import { launchSpaces } from "@/lib/spaces";
import type { AskResponse } from "@/lib/schemas";

type SelectOption = { label: string; value: string };

const audienceOptions = toOptions([
  "Unknown",
  "Tenant",
  "Owner",
  "Applicant",
  "Vendor",
  "Internal",
]);
const channelOptions = [
  "Other",
  "RentVine",
  "Gmail",
  "LeadSimple",
  "Internal Note",
  "Phone Script",
].map((option) => ({ label: option, value: option }));
const urgencyOptions = toOptions(["Normal", "Low", "High"]);
const spaceOptions: SelectOption[] = [
  { label: "All Spaces", value: "" },
  ...launchSpaces.map((space) => ({ label: space.name, value: space.id })),
];
const writableSpaceOptions = launchSpaces
  .filter((space) => !space.readOnly)
  .map((space) => ({ label: space.name, value: space.id }));
const capturableStates = new Set([
  "Partial Source",
  "Bailey Placeholder",
  "No Reliable Source Found",
]);

export function AskForm() {
  const [question, setQuestion] = useState("");
  const [audience, setAudience] = useState("Unknown");
  const [channel, setChannel] = useState("Other");
  const [space, setSpace] = useState("");
  const [captureSpace, setCaptureSpace] = useState(
    writableSpaceOptions[0]?.value ?? "lease-renewals",
  );
  const [urgency, setUrgency] = useState("Normal");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [captureStatus, setCaptureStatus] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setResult(null);
    setCaptureStatus("");

    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        audience,
        channel,
        urgency,
        draft_enabled: true,
        space: space || undefined,
      }),
    });

    if (response.ok) {
      setResult((await response.json()) as AskResponse);
    } else {
      setCaptureStatus(await readErrorMessage(response));
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
      setCaptureStatus(await readErrorMessage(response));
    }

    setIsCapturing(false);
  }

  const canCapture = result ? capturableStates.has(result.source_state) : false;

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

        <div className="field-row">
          <SelectField
            id="ask-audience"
            label="Audience"
            onChange={setAudience}
            options={audienceOptions}
            value={audience}
          />
          <SelectField
            id="ask-channel"
            label="Channel"
            onChange={setChannel}
            options={channelOptions}
            value={channel}
          />
          <SelectField
            id="ask-space"
            label="Space"
            onChange={setSpace}
            options={spaceOptions}
            value={space}
          />
          <SelectField
            id="ask-urgency"
            label="Urgency"
            onChange={setUrgency}
            options={urgencyOptions}
            value={urgency}
          />
        </div>

        <button className="primary-button" disabled={isPending} type="submit">
          {isPending ? "Checking" : "Get Answer"}
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

function toOptions(options: string[]): SelectOption[] {
  return options.map((option) => ({ label: option, value: option }));
}

async function readErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };

  return typeof payload.error === "string" && payload.error.trim()
    ? payload.error
    : "Ask request failed.";
}
