"use client";

import { useEffect, useRef, useState } from "react";

import { MAINTENANCE_TRADES } from "@/lib/maintenance/constants";

// S109 public maintenance report form.
//
// The intake token arrives in the URL fragment, which browsers never send to a server and never put
// in a referrer. This bridge reads it into memory, clears the fragment before anything can create a
// request, and then sends it in the `X-Intake-Token` header exactly as the S47 route expects. The
// token never enters a request URL, React state, or an app log.
//
// The form asks the few questions the team otherwise chases. It uploads nothing: S47 forbids a public
// file upload, so when photos are needed the page says exactly which ones and who to send them to.
// Nothing here creates a ticket, a draft, a message, or a provider effect.

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

interface IntakeResult {
  urgency: "emergency_fire" | "urgent_flooding" | "normal";
  message: string;
  photos_needed: boolean;
  photo_request: string | null;
  reference: string;
  resource: { title: string; url: string; reviewed_on: string } | null;
}

export function MaintenanceIntakeBridge() {
  const tokenRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<
    "checking" | "ready" | "submitting" | "invalid" | "sent"
  >("checking");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [issueType, setIssueType] = useState("");
  const [location, setLocation] = useState("");
  const [happeningNow, setHappeningNow] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [damageOrAccess, setDamageOrAccess] = useState("");
  const [attemptedSteps, setAttemptedSteps] = useState("");
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tokenRef.current) {
      queueMicrotask(() => setPhase("ready"));
      return;
    }
    const fragment = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const fields = new URLSearchParams(fragment);
    const entries = [...fields.entries()];
    try {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    } catch {
      queueMicrotask(() => setPhase("invalid"));
      return;
    }
    if (
      entries.length !== 1 ||
      entries[0]?.[0] !== "token" ||
      !TOKEN_PATTERN.test(entries[0]?.[1] ?? "")
    ) {
      queueMicrotask(() => setPhase("invalid"));
      return;
    }
    tokenRef.current = entries[0][1];
    queueMicrotask(() => setPhase("ready"));
  }, []);

  if (phase === "checking") {
    return <p className="content">Opening your report form.</p>;
  }

  if (phase === "invalid") {
    return (
      <section aria-label="Report a maintenance issue" className="content ui-stack">
        <h1>Report a maintenance issue</h1>
        <p>
          This link is not complete. Open the full link your property team sent you, or
          contact them directly so they can send a new one.
        </p>
      </section>
    );
  }

  if (phase === "sent" && result) {
    return (
      <section aria-label="Report a maintenance issue" className="content ui-stack">
        <h1>Report a maintenance issue</h1>
        <p role="status">{result.message}</p>
        {result.photos_needed && result.photo_request ? (
          <p>
            {result.photo_request} Send them to your property team in reply to their
            message.
          </p>
        ) : null}
        {result.resource ? (
          <p>
            <a href={result.resource.url} rel="noopener noreferrer" target="_blank">
              {result.resource.title}
            </a>{" "}
            was reviewed by the property team on{" "}
            {result.resource.reviewed_on.slice(0, 10)}.
          </p>
        ) : null}
        <p>Your confirmation code is {result.reference}.</p>
      </section>
    );
  }

  async function submit() {
    const token = tokenRef.current;
    if (!token || summary.trim() === "") {
      setError("Tell us what is wrong before sending the report.");
      return;
    }
    setPhase("submitting");
    setError("");
    try {
      const response = await fetch("/api/maintenance/intake/public", {
        method: "POST",
        headers: { "content-type": "application/json", "x-intake-token": token },
        body: JSON.stringify({
          summary: summary.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(contact.trim() ? { contact: contact.trim() } : {}),
          ...(issueType ? { issueType } : {}),
          ...(location.trim() ? { location: location.trim() } : {}),
          ...(happeningNow ? { happeningNow: happeningNow === "yes" } : {}),
          ...(startedAt.trim() ? { startedAt: startedAt.trim() } : {}),
          ...(damageOrAccess.trim() ? { damageOrAccess: damageOrAccess.trim() } : {}),
          ...(attemptedSteps.trim() ? { attemptedSteps: attemptedSteps.trim() } : {}),
        }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as Partial<IntakeResult> & {
        error?: string;
      };
      if (!response.ok || !payload.message) {
        throw new Error(
          payload.error ?? "We could not send your report. Please try again.",
        );
      }
      setResult(payload as IntakeResult);
      setPhase("sent");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We could not send your report. Please try again.",
      );
      setPhase("ready");
    }
  }

  return (
    <section aria-label="Report a maintenance issue" className="content ui-stack">
      <h1>Report a maintenance issue</h1>
      <p>
        If anyone is in danger right now, call 911 first. Answer what you can below and
        the property team will take it from there.
      </p>
      <label className="ui-field">
        <span>What is wrong?</span>
        <input onChange={(event) => setSummary(event.target.value)} value={summary} />
      </label>
      <label className="ui-field">
        <span>Tell us more</span>
        <textarea
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          value={description}
        />
      </label>
      <label className="ui-field">
        <span>What kind of issue is it?</span>
        <select onChange={(event) => setIssueType(event.target.value)} value={issueType}>
          <option value="">I am not sure</option>
          {MAINTENANCE_TRADES.map((trade) => (
            <option key={trade} value={trade}>
              {trade}
            </option>
          ))}
        </select>
      </label>
      <label className="ui-field">
        <span>Where in the home is it?</span>
        <input onChange={(event) => setLocation(event.target.value)} value={location} />
      </label>
      <label className="ui-field">
        <span>Is it happening right now?</span>
        <select
          onChange={(event) => setHappeningNow(event.target.value)}
          value={happeningNow}
        >
          <option value="">I am not sure</option>
          <option value="yes">Yes, right now</option>
          <option value="no">No, not right now</option>
        </select>
      </label>
      <label className="ui-field">
        <span>When did it start?</span>
        <input onChange={(event) => setStartedAt(event.target.value)} value={startedAt} />
      </label>
      <label className="ui-field">
        <span>Is anything damaged, and can someone get to it?</span>
        <textarea
          onChange={(event) => setDamageOrAccess(event.target.value)}
          rows={2}
          value={damageOrAccess}
        />
      </label>
      <label className="ui-field">
        <span>What have you already tried?</span>
        <textarea
          onChange={(event) => setAttemptedSteps(event.target.value)}
          rows={2}
          value={attemptedSteps}
        />
      </label>
      <label className="ui-field">
        <span>How can we reach you?</span>
        <input onChange={(event) => setContact(event.target.value)} value={contact} />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <button disabled={phase === "submitting"} onClick={submit} type="button">
        Send this report
      </button>
    </section>
  );
}
