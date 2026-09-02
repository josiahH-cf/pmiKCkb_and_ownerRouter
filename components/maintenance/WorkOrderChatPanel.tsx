"use client";

import { useState } from "react";

import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { Button, Field } from "@/components/ui";

// S100 manual chat sync and resident reply. Rendering this panel performs zero provider calls:
// loading the conversation reads only already-synchronized local records, and the one
// consequential RentVine page read runs only after the same person confirms the unchanged
// cancel-first preview. Mapping review can only rerun the server's source algorithm, and a reply
// can only become ONE unsent Gmail draft to the server-verified resident; nothing here posts
// chat, changes a work order, or sends anything.

interface ThreadMessage {
  lane: "message";
  message_id: number;
  role: "manager" | "tenant";
  created_at: string;
  body: string;
  truncated: boolean;
  mapping_state: "resident_bound" | "nonresident" | "needs_mapping";
  attachments: { title: string; fileName: string; fileType: string }[];
}

interface ThreadReview {
  lane: "review";
  message_id: number | null;
  reason: string;
  created_at: string | null;
}

interface ThreadPayload {
  work_order_id: string | null;
  eligible: boolean;
  records: (ThreadMessage | ThreadReview)[];
}

interface SyncPreview {
  page: number;
  executionId: string;
  previewHash: string;
  warning: string;
  preview: Record<string, unknown>;
}

interface SyncOutcome {
  counts: Record<string, number> | null;
  nextPage: number | null;
  note: string;
}

interface DraftPreview {
  executionId: string;
  previewHash: string;
  from: string;
  to: string;
  subject: string;
  body: string;
}

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "The resident-message request was declined.",
    );
  }
  return payload;
}

const CHAT_URL = "/api/maintenance/work-order-chat";
const REPLY_URL = "/api/maintenance/resident-reply-draft";

export function WorkOrderChatPanel({
  ticketId,
  canEdit,
}: Readonly<{ ticketId: string; canEdit: boolean }>) {
  const [thread, setThread] = useState<ThreadPayload | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null);
  const [syncOutcome, setSyncOutcome] = useState<SyncOutcome | null>(null);
  const [composerFor, setComposerFor] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [draftPreview, setDraftPreview] = useState<DraftPreview | null>(null);
  const [draftCreated, setDraftCreated] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "The resident-message request was declined.",
      );
    } finally {
      setPending(false);
    }
  }

  async function loadThread() {
    const payload = (await postJson(CHAT_URL, {
      operation: "thread",
      ticketId,
    })) as unknown as ThreadPayload;
    setThread(payload);
  }

  async function startSync(page: number) {
    const payload = await postJson(CHAT_URL, {
      operation: "preview_sync",
      ticketId,
      ...(page > 1 ? { page } : {}),
    });
    setSyncOutcome(null);
    setSyncPreview({
      page,
      executionId: String(payload.execution_id),
      previewHash: String(payload.preview_hash),
      warning: String(payload.warning),
      preview: payload.preview as Record<string, unknown>,
    });
  }

  async function confirmSync(preview: SyncPreview) {
    const payload = await postJson(CHAT_URL, {
      operation: "confirm_sync",
      executionId: preview.executionId,
      previewHash: preview.previewHash,
    });
    setSyncPreview(null);
    setSyncOutcome({
      counts: (payload.counts as Record<string, number> | null) ?? null,
      nextPage: typeof payload.next_page === "number" ? payload.next_page : null,
      note: String(payload.read_marker_note ?? ""),
    });
    await loadThread();
  }

  async function rerunMapping(messageId: number) {
    const payload = await postJson(CHAT_URL, {
      operation: "rerun_mapping",
      messageId,
    });
    setNotice(
      payload.mapping_state === "resident_bound"
        ? "The fresh authoritative source resolved one resident; the message is now mapped."
        : "The fresh source read finished; this message still needs mapping.",
    );
    await loadThread();
  }

  async function previewReply(messageId: number) {
    const payload = await postJson(REPLY_URL, {
      messageId,
      subject: subject.trim(),
      body: body.trim(),
    });
    setDraftPreview({
      executionId: String(payload.execution_id),
      previewHash: String(payload.preview_hash),
      from: String(payload.from),
      to: String(payload.to),
      subject: String(payload.subject),
      body: String(payload.body),
    });
  }

  async function confirmReply(messageId: number, preview: DraftPreview) {
    const payload = await postJson(REPLY_URL, {
      messageId,
      subject: subject.trim(),
      body: body.trim(),
      confirm: {
        executionId: preview.executionId,
        previewHash: preview.previewHash,
      },
    });
    if (payload.status === "created") {
      setDraftCreated(String(payload.draft_id));
      setDraftPreview(null);
      setComposerFor(null);
      setNotice(
        "One unsent Gmail draft was created. Open your Gmail Drafts to review and send or delete it yourself.",
      );
    } else {
      setNotice(
        "The Gmail outcome is unproven. Check this exact attempt from Gmail Drafts before anything new; the app never creates another draft automatically.",
      );
    }
  }

  const messages = (thread?.records ?? [])
    .filter((entry): entry is ThreadMessage => entry.lane === "message")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const reviews = (thread?.records ?? []).filter(
    (entry): entry is ThreadReview => entry.lane === "review",
  );

  return (
    <article aria-labelledby="work-order-chat-title" className="panel ui-stack">
      <div>
        <h2 id="work-order-chat-title">Resident messages</h2>
        <p className="muted">
          Manually import the RentVine work-order conversation one page at a time and
          reply only through one reviewed unsent Gmail draft. Nothing loads, posts, or
          sends on its own.
        </p>
      </div>

      <div className="ui-actions">
        <Button
          disabled={pending}
          onClick={() => void run(loadThread)}
          variant="secondary"
        >
          Load conversation
        </Button>
        {thread?.eligible && canEdit ? (
          <Button
            disabled={pending || syncPreview !== null}
            onClick={() => void run(() => startSync(1))}
          >
            Sync resident messages
          </Button>
        ) : null}
      </div>

      {thread && !thread.eligible ? (
        <p className="muted">
          This ticket has no receipted RentVine work-order binding yet, so there is no
          conversation to sync.
        </p>
      ) : null}
      {thread?.eligible && !canEdit ? (
        <p className="muted">
          Syncing and replying are Editor actions.{" "}
          <RequestAccessLink surface="maintenance.edit" />
        </p>
      ) : null}

      {syncPreview ? (
        <div
          className="ui-callout ui-stack"
          role="alertdialog"
          aria-label="Confirm chat sync"
        >
          <p>
            <strong>Sync page {syncPreview.page}</strong> for ticket {ticketId} and
            RentVine work order {String(syncPreview.preview.work_order_id ?? "")}.
          </p>
          <p>{syncPreview.warning}</p>
          <div className="ui-actions">
            <Button
              disabled={pending}
              onClick={() => setSyncPreview(null)}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() => void run(() => confirmSync(syncPreview))}
            >
              Confirm this exact page
            </Button>
          </div>
        </div>
      ) : null}

      {syncOutcome ? (
        <div className="ui-stack">
          {syncOutcome.counts ? (
            <p className="muted" role="status">
              Synced: {syncOutcome.counts.new_messages} new,{" "}
              {syncOutcome.counts.already_synced} already synced,{" "}
              {syncOutcome.counts.needs_mapping} needing mapping,{" "}
              {syncOutcome.counts.review} for review, {syncOutcome.counts.rejected}{" "}
              rejected, {syncOutcome.counts.truncated} truncated.
            </p>
          ) : null}
          <p className="muted">{syncOutcome.note}</p>
          {syncOutcome.nextPage !== null && canEdit ? (
            <div className="ui-actions">
              <Button
                disabled={pending || syncPreview !== null}
                onClick={() => void run(() => startSync(syncOutcome.nextPage ?? 1))}
                variant="secondary"
              >
                Sync older messages
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {thread && messages.length === 0 && reviews.length === 0 ? (
        <p className="muted">No messages are synchronized for this ticket yet.</p>
      ) : null}

      {messages.length > 0 ? (
        <ul aria-label="Synchronized messages">
          {messages.map((message) => (
            <li className="ui-stack" key={message.message_id}>
              <p>
                <strong>{message.role === "tenant" ? "Resident" : "Manager"}</strong>{" "}
                <span className="muted">{message.created_at}</span>
              </p>
              <p>{message.body}</p>
              {message.truncated ? <p className="muted">Message truncated</p> : null}
              {message.attachments.length > 0 ? (
                <ul aria-label="Attachment metadata">
                  {message.attachments.map((attachment) => (
                    <li
                      className="muted"
                      key={`${message.message_id}:${attachment.fileName}`}
                    >
                      Attachment on file with RentVine: {attachment.title} (
                      {attachment.fileName}, {attachment.fileType})
                    </li>
                  ))}
                </ul>
              ) : null}
              {message.mapping_state === "needs_mapping" ? (
                <div className="ui-actions">
                  <span className="muted">Needs mapping</span>
                  {canEdit ? (
                    <Button
                      disabled={pending}
                      onClick={() => void run(() => rerunMapping(message.message_id))}
                      variant="secondary"
                    >
                      Rerun source resolution
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {message.role === "tenant" &&
              message.mapping_state === "resident_bound" &&
              canEdit ? (
                <div className="ui-actions">
                  <Button
                    disabled={pending}
                    onClick={() => {
                      setComposerFor(message.message_id);
                      setDraftPreview(null);
                      setDraftCreated(null);
                    }}
                    variant="secondary"
                  >
                    Draft email reply
                  </Button>
                </div>
              ) : null}
              {composerFor === message.message_id ? (
                <form
                  className="ui-stack"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(() => previewReply(message.message_id));
                  }}
                >
                  <Field htmlFor={`s100-subject-${message.message_id}`} label="Subject">
                    <input
                      id={`s100-subject-${message.message_id}`}
                      onChange={(event) => {
                        setSubject(event.target.value);
                        setDraftPreview(null);
                      }}
                      type="text"
                      value={subject}
                    />
                  </Field>
                  <Field htmlFor={`s100-body-${message.message_id}`} label="Reply body">
                    <textarea
                      id={`s100-body-${message.message_id}`}
                      onChange={(event) => {
                        setBody(event.target.value);
                        setDraftPreview(null);
                      }}
                      rows={4}
                      value={body}
                    />
                  </Field>
                  <div className="ui-actions">
                    <Button
                      disabled={pending}
                      onClick={() => {
                        setComposerFor(null);
                        setDraftPreview(null);
                      }}
                      type="button"
                      variant="secondary"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={pending || !subject.trim() || !body.trim()}
                      type="submit"
                    >
                      Preview draft
                    </Button>
                  </div>
                  {draftPreview ? (
                    <div className="ui-stack">
                      <p className="muted">
                        From {draftPreview.from} to the server-verified resident{" "}
                        {draftPreview.to}. Subject: {draftPreview.subject}
                      </p>
                      <div className="draft-box">{draftPreview.body}</div>
                      <div className="ui-actions">
                        <Button
                          disabled={pending}
                          onClick={() =>
                            void run(() => confirmReply(message.message_id, draftPreview))
                          }
                          type="button"
                        >
                          Create the unsent Gmail draft
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {reviews.length > 0 ? (
        <div className="ui-stack">
          <h3>Restricted review</h3>
          <ul aria-label="Review lane">
            {reviews.map((entry, index) => (
              <li className="muted" key={`${entry.message_id ?? "row"}:${index}`}>
                {entry.reason.replace(/_/g, " ")}
                {entry.message_id !== null ? ` (message ${entry.message_id})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {draftCreated ? (
        <p className="muted" role="status">
          Unsent draft {draftCreated} is in your Gmail Drafts. Review and send or delete
          it there yourself; the app never sends and never deletes drafts.
        </p>
      ) : null}

      {notice ? (
        <p className="muted" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {pending ? (
        <p aria-busy="true" className="muted" role="status">
          Working…
        </p>
      ) : null}
    </article>
  );
}
