"use client";

import { useEffect, useState } from "react";

import type {
  VendorTestMailboxLabel,
  VendorTestMailboxRecord,
} from "@/lib/vendor/test-mailbox";

interface PreparedReply {
  confirmationToken: string;
  ticketId: string;
  threadId: string;
  body: string;
  messageId: string;
  callout: {
    dataMode: "test";
    action: string;
    target: string;
    externalEffect: false;
    liveEvidenceEligible: false;
    exactEffect: string;
  };
}

async function requestTestMailbox(ticketId: string, action?: Record<string, unknown>) {
  const response = await fetch(
    `/api/vendor/tickets/${encodeURIComponent(ticketId)}/test-mailbox`,
    action
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action),
        }
      : undefined,
  );
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "The simulated mailbox is unavailable.",
    );
  }
  return payload ?? {};
}

export function VendorTestMailboxPanel({ ticketId }: Readonly<{ ticketId: string }>) {
  const [mailbox, setMailbox] = useState<VendorTestMailboxRecord | null>(null);
  const [body, setBody] = useState("");
  const [prepared, setPrepared] = useState<PreparedReply | null>(null);
  const [message, setMessage] = useState("Loading simulated mailbox…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void requestTestMailbox(ticketId).then(
      (payload) => {
        if (!active) return;
        const loaded = payload.mailbox as VendorTestMailboxRecord;
        setMailbox(loaded);
        setBody(loaded.draftBody);
        setMessage("Test mailbox ready. No external provider is connected.");
      },
      (error) => {
        if (active)
          setMessage(error instanceof Error ? error.message : "Mailbox failed.");
      },
    );
    return () => {
      active = false;
    };
  }, [ticketId]);

  async function perform(action: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      return await requestTestMailbox(ticketId, action);
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    try {
      const payload = await perform({ action: "save_draft", body });
      setMailbox(payload.mailbox as VendorTestMailboxRecord);
      setPrepared(null);
      setMessage("Draft saved inside Test data. No email was created or sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft failed.");
    }
  }

  async function applyLabel(label: VendorTestMailboxLabel) {
    try {
      const payload = await perform({ action: "apply_label", label });
      setMailbox(payload.mailbox as VendorTestMailboxRecord);
      setMessage(`Applied ${label} to the simulated thread.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Label failed.");
    }
  }

  async function reviewReply() {
    try {
      const payload = await perform({ action: "prepare_reply", body });
      setPrepared(payload as unknown as PreparedReply);
      setMessage("Review the exact Test-only effect, then confirm once.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reply review failed.");
    }
  }

  async function confirmReply() {
    if (!prepared) return;
    try {
      const payload = await perform({
        action: "confirm_reply",
        confirmationToken: prepared.confirmationToken,
        threadId: prepared.threadId,
        body: prepared.body,
        messageId: prepared.messageId,
      });
      if (payload.mailbox) setMailbox(payload.mailbox as VendorTestMailboxRecord);
      setBody("");
      setPrepared(null);
      setMessage(
        payload.duplicate
          ? "This simulated reply was already recorded; it was not duplicated."
          : "Simulated reply recorded in Test data. No email left the app.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reply failed.");
    }
  }

  return (
    <article className="panel">
      <p className="eyebrow">Test workspace · simulated mailbox</p>
      <h2>{mailbox?.subject ?? "Assigned-ticket communication"}</h2>
      <p>
        This is persisted production Test data. It exercises the real portal lifecycle,
        but is structurally isolated from Gmail, OAuth, external delivery, and live proof.
      </p>
      {mailbox ? (
        <>
          <p>
            <strong>Thread:</strong> {mailbox.threadId}
          </p>
          <p>
            <strong>Label:</strong> {mailbox.label}
          </p>
          <p>{mailbox.snippet}</p>
          {mailbox.messages.length ? (
            <div aria-label="Simulated replies">
              {mailbox.messages.map((item) => (
                <blockquote key={item.id}>{item.body}</blockquote>
              ))}
            </div>
          ) : null}
          <label>
            Invented reply
            <textarea
              onChange={(event) => {
                setBody(event.target.value);
                setPrepared(null);
              }}
              value={body}
            />
          </label>
          <div className="button-row">
            <button disabled={busy || !body.trim()} onClick={saveDraft} type="button">
              Save Test draft
            </button>
            <button
              className="primary-button"
              disabled={busy || !body.trim()}
              onClick={reviewReply}
              type="button"
            >
              Review simulated reply
            </button>
          </div>
          <div className="button-row">
            <button
              disabled={busy}
              onClick={() => applyLabel("PMI/Vendor/Waiting")}
              type="button"
            >
              Mark waiting
            </button>
            <button
              disabled={busy}
              onClick={() => applyLabel("PMI/Vendor/Complete")}
              type="button"
            >
              Mark complete
            </button>
          </div>
        </>
      ) : null}
      {prepared ? (
        <div className="panel" role="region" aria-label="Exact Test reply confirmation">
          <p className="eyebrow">Test write · not live evidence</p>
          <p>
            <strong>Action:</strong> {prepared.callout.action}
          </p>
          <p>
            <strong>Target:</strong> {prepared.callout.target}
          </p>
          <p>{prepared.callout.exactEffect}</p>
          <blockquote>{prepared.body}</blockquote>
          <button
            className="primary-button"
            disabled={busy}
            onClick={confirmReply}
            type="button"
          >
            Confirm exact simulated reply
          </button>
        </div>
      ) : null}
      <p className="muted" role="status">
        {message}
      </p>
    </article>
  );
}
