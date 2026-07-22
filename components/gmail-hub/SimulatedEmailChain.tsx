"use client";

import { type FormEvent, useId, useState } from "react";

type SimulatedActor = "dan" | "josiah";

interface SimulatedMessage {
  id: string;
  actor: SimulatedActor;
  body: string;
}

const ACTOR_LABELS: Record<SimulatedActor, string> = {
  dan: "Dan (simulated)",
  josiah: "Josiah (simulated)",
};

const INITIAL_MESSAGES: readonly SimulatedMessage[] = [
  {
    id: "simulated-message-1",
    actor: "josiah",
    body: "Hi Dan. This is a browser-only demo update for the PMI KC walkthrough.",
  },
];

const INITIAL_REPLY =
  "Thanks. I can see this reply attached to the same simulated conversation.";

/**
 * A deliberately local demo fixture for showing email-thread continuity without mailbox access.
 * It has no API, Gmail-runtime, or persistence path; refresh/reset returns the seed fixture.
 */
export function SimulatedEmailChain() {
  const actorId = useId();
  const replyId = useId();
  const [messages, setMessages] = useState<SimulatedMessage[]>([...INITIAL_MESSAGES]);
  const [actor, setActor] = useState<SimulatedActor>("dan");
  const [reply, setReply] = useState(INITIAL_REPLY);
  const [status, setStatus] = useState("");

  function addReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = reply.trim();
    if (!body) return;

    const sequence = messages.length + 1;
    setMessages((current) => [
      ...current,
      {
        id: `simulated-message-${sequence}`,
        actor,
        body,
      },
    ]);
    setReply("");
    setActor((current) => (current === "dan" ? "josiah" : "dan"));
    setStatus(`Simulated reply ${sequence} added to this browser-only thread.`);
  }

  function resetThread() {
    setMessages([...INITIAL_MESSAGES]);
    setActor("dan");
    setReply(INITIAL_REPLY);
    setStatus("Demo thread reset. No mailbox or saved record was changed.");
  }

  return (
    <article className="panel ui-stack simulated-email-chain">
      <div className="ui-spread simulated-email-chain-heading">
        <div>
          <h2>Simulated email chain</h2>
          <p className="muted">
            Demo only. Every reply stays in this browser tab, and refreshing the page
            resets the thread; the whole exchange stays inside your browser, with no Gmail
            API, mailbox, database, or external delivery behind it.
          </p>
        </div>
        <span className="queue-pill" data-value="Available">
          Browser only
        </span>
      </div>

      <div className="simulated-thread-summary">
        <span className="muted">Subject</span>
        <strong>PMI KC Wednesday demo update</strong>
        <span className="muted" data-testid="simulated-message-count">
          {messages.length} {messages.length === 1 ? "message" : "messages"} in one
          simulated thread
        </span>
      </div>

      <ol aria-label="Simulated thread messages" className="simulated-thread-list">
        {messages.map((message, index) => (
          <li className="simulated-thread-message" key={message.id}>
            <div className="ui-spread">
              <strong>{ACTOR_LABELS[message.actor]}</strong>
              <span className="muted">Message {index + 1}</span>
            </div>
            <p>{message.body}</p>
          </li>
        ))}
      </ol>

      <form className="ui-stack" onSubmit={addReply}>
        <label className="field" htmlFor={actorId}>
          <span>Reply as</span>
          <select
            id={actorId}
            onChange={(event) => setActor(event.target.value as SimulatedActor)}
            value={actor}
          >
            <option value="dan">Dan (simulated)</option>
            <option value="josiah">Josiah (simulated)</option>
          </select>
        </label>
        <label className="field" htmlFor={replyId}>
          <span>Simulated reply</span>
          <textarea
            id={replyId}
            onChange={(event) => setReply(event.target.value)}
            rows={3}
            value={reply}
          />
        </label>
        <div className="simulated-thread-actions">
          <button className="primary-button" disabled={!reply.trim()} type="submit">
            Add simulated reply
          </button>
          <button className="secondary-button" onClick={resetThread} type="button">
            Reset demo thread
          </button>
        </div>
      </form>
      <p aria-live="polite" className="muted simulated-thread-status">
        {status}
      </p>
    </article>
  );
}
