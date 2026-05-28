"use client";

import { useState } from "react";
import { SourceStateBanner } from "@/components/source-state-banner/SourceStateBanner";
import type { AskResponse } from "@/lib/schemas";

const audienceOptions = ["Unknown", "Tenant", "Owner", "Applicant", "Vendor", "Internal"];
const channelOptions = [
  "Other",
  "RentVine",
  "Gmail",
  "LeadSimple",
  "Internal Note",
  "Phone Script",
];
const urgencyOptions = ["Normal", "Low", "High"];

export function AskForm() {
  const [question, setQuestion] = useState("");
  const [audience, setAudience] = useState("Unknown");
  const [channel, setChannel] = useState("Other");
  const [urgency, setUrgency] = useState("Normal");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setResult(null);

    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        audience,
        channel,
        urgency,
        draft_enabled: true,
      }),
    });

    if (response.ok) {
      setResult((await response.json()) as AskResponse);
    }

    setIsPending(false);
  }

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
            label="Audience"
            onChange={setAudience}
            options={audienceOptions}
            value={audience}
          />
          <SelectField
            label="Channel"
            onChange={setChannel}
            options={channelOptions}
            value={channel}
          />
          <SelectField
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
          </>
        ) : (
          <p className="muted">Results appear here.</p>
        )}
      </aside>
    </div>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: Readonly<{
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}>) {
  const id = label.toLowerCase().replaceAll(" ", "-");

  return (
    <label className="select-field" htmlFor={id}>
      {label}
      <select id={id} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
