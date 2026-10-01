"use client";

import { formatBusinessTimestamp, formatCalendarDate } from "@/lib/date-display";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAudioRecorder } from "@/components/hooks/useAudioRecorder";
import { SourceStateBanner } from "@/components/source-state-banner/SourceStateBanner";
import { BusyIndicator, Button, Field, Notice } from "@/components/ui";
import { launchSpaces } from "@/lib/spaces";
import type { AnswerGroup, ConversationAnswer } from "@/lib/assistant/conversation";
import type { ConversationContext } from "@/lib/assistant/conversation-plan";
import { AskCorrectionKinds, type AskResponse } from "@/lib/schemas";

type SelectOption = { label: string; value: string };

type CorrectionKind = (typeof AskCorrectionKinds)[number];

const CORRECTION_KIND_LABELS: Record<CorrectionKind, string> = {
  wrong_fact: "Wrong fact",
  wrong_source: "Wrong source",
  missing_detail: "Missing detail",
  wrong_process: "Wrong process",
};

/** Existing example questions (the S138 question families); choosing one only fills the box. */
export const DASHBOARD_EXAMPLE_QUESTIONS = [
  "What leases are due this week?",
  "What work is assigned to me today?",
  "What applications are connected?",
] as const;

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

const writableSpaceOptions = launchSpaces
  .filter((space) => space.showInDirectory !== false && !space.readOnly)
  .map((space) => ({ label: space.name, value: space.id }));
const capturableStates = new Set([
  "Partial Source",
  "Open Placeholder",
  "No Reliable Source Found",
]);

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

/** One submission's stable identity. Retrying the same turn reuses it. */
export function newOperationId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function")
    return cryptoApi.randomUUID();
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * A turn's lifecycle on this page. `pending` while its requests run; `answered` once an answer
 * shows; `failed` when no answer arrived (the question is kept and Retry re-sends it); never a
 * completed answer unless one actually arrived.
 */
export type DashboardTurnState = "pending" | "answered" | "failed";

export interface DashboardTurn {
  readonly id: string;
  readonly question: string;
  /** The conversation context sent with this question, kept so Retry asks exactly the same thing. */
  readonly contextBefore: ConversationContext | null;
  readonly state: DashboardTurnState;
  readonly assistant: ConversationAnswer | null;
  /** Set when the assistant could not answer but the knowledge answer may still show. */
  readonly assistantUnavailable: boolean;
  readonly knowledge: AskResponse | null;
  /** The knowledge answer's own failure, shown on this turn. */
  readonly knowledgeError: string | null;
  readonly error: string | null;
  readonly answeredAtIso: string | null;
}

export interface DashboardConversation {
  readonly id: string;
  readonly startedAtIso: string;
  readonly turns: readonly DashboardTurn[];
  /** The latest server context, sent with the next question in this conversation. */
  readonly context: ConversationContext | null;
}

function newConversation(): DashboardConversation {
  return {
    id: newOperationId(),
    startedAtIso: new Date().toISOString(),
    turns: [],
    context: null,
  };
}

const ANSWER_FAILED =
  "The answer could not be loaded. Your question is kept, so you can try again.";

/**
 * S146 AI-first Dashboard workspace. The question box leads the main column; each question and its
 * answer appear below it in order, with their own loading, failure and retry state. Nothing here
 * selects, suggests, detects or starts a process: operational questions use the S138 assistant and
 * policy questions use the knowledge answer. Nothing submits on mount or when an earlier
 * conversation is reopened.
 */
export function AskForm({ secondary }: Readonly<{ secondary?: ReactNode }>) {
  // Until hydration, a native form submit would put the question in the page URL.
  const ready = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const [question, setQuestion] = useState("");
  const [conversations, setConversations] = useState<readonly DashboardConversation[]>(
    () => [newConversation()],
  );
  const [activeId, setActiveId] = useState(() => conversations[0].id);
  const [announcement, setAnnouncement] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [dictationStatus, setDictationStatus] = useState("");
  const dictateButtonRef = useRef<HTMLButtonElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const turnRefs = useRef(new Map<string, HTMLElement>());
  const typedSinceSubmit = useRef(false);
  const pendingFocus = useRef<string | null>(null);

  const active = conversations.find((entry) => entry.id === activeId) ?? conversations[0];
  const isPending = active.turns.some((turn) => turn.state === "pending");
  const earlier = conversations.filter(
    (entry) => entry.id !== active.id && entry.turns.length > 0,
  );

  const updateTurn = useCallback(
    (
      conversationId: string,
      turnId: string,
      update: (turn: DashboardTurn) => DashboardTurn,
      context?: ConversationContext | null,
    ) => {
      setConversations((previous) =>
        previous.map((entry) =>
          entry.id !== conversationId
            ? entry
            : {
                ...entry,
                context: context === undefined ? entry.context : context,
                turns: entry.turns.map((turn) =>
                  turn.id === turnId ? update(turn) : turn,
                ),
              },
        ),
      );
    },
    [],
  );

  // Move focus to a turn once its answer (or failure) is shown, unless the person has started
  // typing again; the polite live region announces the outcome either way.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const turn = active.turns.find((entry) => entry.id === target);
    if (!turn || turn.state === "pending") return;
    pendingFocus.current = null;
    const typing =
      typedSinceSubmit.current && document.activeElement === questionRef.current;
    if (!typing) turnRefs.current.get(target)?.focus();
  }, [active.turns]);

  async function askKnowledge(
    asked: string,
  ): Promise<{ answer: AskResponse | null; error: string | null }> {
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: asked, draft_enabled: true }),
      });
      if (!response.ok) {
        return {
          answer: null,
          error: await readErrorMessage(response, "Ask request failed."),
        };
      }
      return { answer: (await response.json()) as AskResponse, error: null };
    } catch {
      return {
        answer: null,
        error: "The knowledge answer could not be reached just now.",
      };
    }
  }

  async function runTurn(conversationId: string, turn: DashboardTurn) {
    const asked = turn.question;
    let assistant: ConversationAnswer | null = null;
    let assistantUnavailable = false;
    let nextContext: ConversationContext | null | undefined;
    try {
      // S138: operational questions are answered from the records this user can already see,
      // continuing this conversation. A policy or how-to question (or the policy half of a mixed
      // question) also continues to the knowledge answer below.
      const response = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: asked, conversation: turn.contextBefore }),
      });
      if (response.ok) {
        assistant = (await response.json()) as ConversationAnswer;
        nextContext = assistant.conversation;
      } else {
        assistantUnavailable = true;
      }
    } catch {
      assistantUnavailable = true;
    }

    if (assistant && !assistant.knowledgeQuestion) {
      finishTurn(conversationId, turn.id, asked, {
        state: "answered",
        assistant,
        assistantUnavailable: false,
        knowledge: null,
        knowledgeError: null,
        error: null,
        context: nextContext,
      });
      return;
    }

    const knowledge = await askKnowledge(asked);
    const answered = Boolean(assistant) || Boolean(knowledge.answer);
    finishTurn(conversationId, turn.id, asked, {
      state: answered ? "answered" : "failed",
      assistant,
      assistantUnavailable,
      knowledge: knowledge.answer,
      knowledgeError: answered ? knowledge.error : null,
      error: answered ? null : (knowledge.error ?? ANSWER_FAILED),
      context: nextContext,
    });
  }

  function finishTurn(
    conversationId: string,
    turnId: string,
    asked: string,
    outcome: {
      state: DashboardTurnState;
      assistant: ConversationAnswer | null;
      assistantUnavailable: boolean;
      knowledge: AskResponse | null;
      knowledgeError: string | null;
      error: string | null;
      context: ConversationContext | null | undefined;
    },
  ) {
    updateTurn(
      conversationId,
      turnId,
      (turn) => ({
        ...turn,
        state: outcome.state,
        assistant: outcome.assistant,
        assistantUnavailable: outcome.assistantUnavailable,
        knowledge: outcome.knowledge,
        knowledgeError: outcome.knowledgeError,
        error: outcome.error,
        answeredAtIso: outcome.state === "answered" ? new Date().toISOString() : null,
      }),
      outcome.context,
    );
    if (outcome.state === "answered") {
      // A late answer never discards newer typing: the box clears only if it still holds this
      // exact question.
      setQuestion((current) => (current.trim() === asked ? "" : current));
      setAnnouncement("Answer ready.");
    } else {
      setAnnouncement(`${outcome.error ?? ANSWER_FAILED} Use Retry on that question.`);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const asked = question.trim();
    if (!asked || isPending) return;
    const turn: DashboardTurn = {
      id: newOperationId(),
      question: asked,
      contextBefore: active.context,
      state: "pending",
      assistant: null,
      assistantUnavailable: false,
      knowledge: null,
      knowledgeError: null,
      error: null,
      answeredAtIso: null,
    };
    const conversationId = active.id;
    setConversations((previous) =>
      previous.map((entry) =>
        entry.id === conversationId ? { ...entry, turns: [...entry.turns, turn] } : entry,
      ),
    );
    typedSinceSubmit.current = false;
    pendingFocus.current = turn.id;
    setAnnouncement("Working on your answer.");
    await runTurn(conversationId, turn);
  }

  async function retry(conversationId: string, turn: DashboardTurn) {
    if (turn.state !== "failed") return;
    updateTurn(conversationId, turn.id, (current) => ({
      ...current,
      state: "pending",
      error: null,
    }));
    pendingFocus.current = turn.id;
    setAnnouncement("Trying that question again.");
    await runTurn(conversationId, turn);
  }

  function startNewConversation() {
    const next = newConversation();
    setConversations((previous) => [next, ...previous]);
    setActiveId(next.id);
    setAnnouncement(
      "Started a new conversation. The earlier one is listed under Conversations.",
    );
    requestAnimationFrame(() => questionRef.current?.focus());
  }

  function reopenConversation(id: string) {
    setActiveId(id);
    setAnnouncement("Opened an earlier conversation. Nothing was asked again.");
    requestAnimationFrame(() => {
      const target = conversations.find((entry) => entry.id === id)?.turns[0];
      if (target) turnRefs.current.get(target.id)?.focus();
    });
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
    cancelPermissionRequest,
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

  const submitLabel = isPending ? "Working" : "Get answer";

  return (
    <div className="dashboard-workspace ask-console">
      <div className="dashboard-main">
        <form aria-label="Ask a question" className="ask-form panel" onSubmit={submit}>
          <div className="field-label-row">
            <label className="field-label" htmlFor="question">
              Question
              <span aria-hidden="true" className="field-required">
                *
              </span>
            </label>
            <button
              ref={dictateButtonRef}
              aria-describedby="dictation-status"
              aria-pressed={isRecording}
              className="secondary-button dictate-button"
              disabled={
                isTranscribing ||
                recorderPhase === "stopping" ||
                recorderPhase === "processing"
              }
              onClick={() =>
                recorderPhase === "requesting-permission"
                  ? cancelPermissionRequest()
                  : void toggleRecording()
              }
              type="button"
            >
              {isRecording
                ? "Stop recording"
                : recorderPhase === "requesting-permission"
                  ? "Cancel microphone request"
                  : recorderPhase === "stopping"
                    ? "Stopping…"
                    : isTranscribing
                      ? "Processing…"
                      : "Dictate"}
            </button>
          </div>
          <textarea
            ref={questionRef}
            aria-describedby="question-hint"
            aria-required="true"
            disabled={!ready}
            id="question"
            minLength={3}
            name="question"
            onChange={(event) => {
              typedSinceSubmit.current = true;
              setQuestion(event.target.value);
            }}
            placeholder="For example: when does the lease at 1234 Oak St renew?"
            required
            rows={4}
            value={question}
          />
          <p className="muted dictate-hint" id="question-hint">
            Ask in plain language. For example: when does the lease at 1234 Oak St, Unit 2
            renew? You can type it or use Dictate to speak it.
          </p>
          <div className="dashboard-examples" role="group" aria-label="Example questions">
            {DASHBOARD_EXAMPLE_QUESTIONS.map((example) => (
              <button
                className="link-button"
                disabled={!ready}
                key={example}
                onClick={() => {
                  setQuestion(example);
                  questionRef.current?.focus();
                }}
                type="button"
              >
                {example}
              </button>
            ))}
          </div>
          <p
            aria-atomic="true"
            aria-live="polite"
            className="muted dictate-status"
            id="dictation-status"
            role="status"
          >
            {dictationStatus}
          </p>
          <div className="ui-row">
            <Button disabled={!ready || isPending} size="large" type="submit">
              {submitLabel}
            </Button>
            {active.turns.length > 0 ? (
              <button
                className="link-button"
                onClick={startNewConversation}
                type="button"
              >
                Start a new conversation
              </button>
            ) : null}
          </div>
        </form>

        {/* Turn outcomes are announced politely; the dictation line keeps the one status role. */}
        <p
          aria-atomic="true"
          aria-live="polite"
          className="sr-only"
          data-testid="dashboard-announcer"
        >
          {announcement}
        </p>

        {active.turns.length > 0 ? (
          <section aria-label="Conversation" className="dashboard-conversation">
            <p className="muted dashboard-conversation-note">
              This conversation lasts while this page stays open.
            </p>
            <ol className="dashboard-turns">
              {active.turns.map((turn, index) => (
                <li key={turn.id}>
                  <TurnView
                    index={index}
                    onRetry={() => void retry(active.id, turn)}
                    registerRef={(element) => {
                      if (element) turnRefs.current.set(turn.id, element);
                      else turnRefs.current.delete(turn.id);
                    }}
                    turn={turn}
                  />
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>

      <div className="dashboard-secondary">
        {earlier.length > 0 ? (
          <nav aria-label="Conversations" className="panel dashboard-nav">
            <h2>Conversations</h2>
            <p className="muted">Earlier conversations from this visit.</p>
            <ul className="dashboard-nav-list">
              {earlier.map((entry) => (
                <li key={entry.id}>
                  <button
                    className="link-button"
                    onClick={() => reopenConversation(entry.id)}
                    type="button"
                  >
                    {excerpt(entry.turns[0]?.question ?? "Conversation")}
                  </button>
                  <span className="muted">
                    {formatBusinessTimestamp(entry.startedAtIso)} · {entry.turns.length}{" "}
                    {entry.turns.length === 1 ? "question" : "questions"}
                  </span>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {secondary}
      </div>
    </div>
  );
}

export function excerpt(text: string, max = 80): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** One question and everything shown for it, with its own pending, failure and retry state. */
function TurnView({
  turn,
  index,
  onRetry,
  registerRef,
}: Readonly<{
  turn: DashboardTurn;
  index: number;
  onRetry: () => void;
  registerRef: (element: HTMLElement | null) => void;
}>) {
  const headingId = `dashboard-turn-${index + 1}`;
  return (
    <article
      aria-busy={turn.state === "pending" ? "true" : undefined}
      aria-labelledby={headingId}
      className="panel dashboard-turn"
      data-state={turn.state}
      ref={registerRef}
      tabIndex={-1}
    >
      <p className="dashboard-turn-question" id={headingId}>
        <span className="muted">You asked: </span>
        {turn.question}
      </p>
      {turn.state === "pending" ? (
        <BusyIndicator delayMs={0} label="Working on your answer" />
      ) : null}
      {turn.state === "failed" ? (
        <Notice actionLabel="Retry" onAction={onRetry} tone="error">
          {turn.error ?? ANSWER_FAILED}
        </Notice>
      ) : null}
      {turn.assistant && turn.assistant.kind !== "knowledge" ? (
        <section aria-label="Assistant answer" className="ui-stack">
          <ConversationAnswerView answer={turn.assistant} />
        </section>
      ) : null}
      {turn.assistantUnavailable && turn.knowledge ? (
        <p className="muted">
          The assistant could not answer just now, so only the knowledge answer is shown.
        </p>
      ) : null}
      {turn.knowledge ? <KnowledgeAnswerView result={turn.knowledge} /> : null}
      {turn.knowledgeError && turn.state === "answered" ? (
        <p className="muted">{turn.knowledgeError}</p>
      ) : null}
    </article>
  );
}

/** The knowledge answer for one turn, with its own capture and correction controls. */
function KnowledgeAnswerView({ result }: Readonly<{ result: AskResponse }>) {
  const [captureSpace, setCaptureSpace] = useState(
    writableSpaceOptions[0]?.value ?? "lease-renewals",
  );
  const [captureStatus, setCaptureStatus] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  // S32: file a plain-language correction on the answer. Proposed-only; changes nothing on its own.
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionKind, setCorrectionKind] = useState<CorrectionKind>("wrong_fact");
  const [correctionNote, setCorrectionNote] = useState("");
  const [correctionStatus, setCorrectionStatus] = useState("");
  const [isCorrecting, setIsCorrecting] = useState(false);
  const canCapture = capturableStates.has(result.source_state);
  const idBase = useId();

  async function captureTask() {
    setIsCapturing(true);
    setCaptureStatus("");
    try {
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
      setCaptureStatus(
        response.ok
          ? "Capture task created."
          : await readErrorMessage(response, "Capture failed."),
      );
    } catch {
      setCaptureStatus("Capture failed.");
    } finally {
      setIsCapturing(false);
    }
  }

  async function submitCorrection() {
    if (correctionNote.trim() === "") return;
    setIsCorrecting(true);
    setCorrectionStatus("");
    try {
      const response = await fetch("/api/ask/correct", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          space_id: captureSpace,
          question: result.question,
          kind: correctionKind,
          note: correctionNote.trim(),
          source_state: result.source_state,
          citations: result.citations,
        }),
      });
      if (response.ok) {
        // Proposed-only: nothing about the answer changes. An Admin reviews it separately.
        setCorrectionStatus("Correction filed for review. The answer is unchanged.");
        setCorrectionNote("");
        setShowCorrection(false);
      } else {
        setCorrectionStatus(
          await readErrorMessage(response, "Could not file the correction."),
        );
      }
    } catch {
      setCorrectionStatus("Could not file the correction.");
    } finally {
      setIsCorrecting(false);
    }
  }

  return (
    <section aria-label="Knowledge answer" className="ui-stack">
      <SourceStateBanner state={result.source_state} />
      <h2>Answer</h2>
      <p>{result.answer}</p>
      {result.answered_by ? (
        <p className="muted">
          Answered by {result.answered_by.model} · {result.answered_by.source_count}{" "}
          {result.answered_by.source_count === 1 ? "source" : "sources"}
        </p>
      ) : null}
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
                {citation.last_reviewed_at ? (
                  <span className="muted">
                    {" "}
                    · reviewed {formatReviewedDate(citation.last_reviewed_at)}
                  </span>
                ) : null}
                {citation.freshness &&
                (citation.freshness.status === "review-due" ||
                  citation.freshness.status === "stale") ? (
                  <span
                    className={`freshness-chip freshness-${citation.freshness.status}`}
                  >
                    {" "}
                    · {citation.freshness.status === "stale" ? "Stale" : "Review due"}
                  </span>
                ) : null}
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
            id={`${idBase}-capture-space`}
            label="Space"
            onChange={setCaptureSpace}
            options={writableSpaceOptions}
            value={captureSpace}
          />
          <button
            className="secondary-button"
            disabled={isCapturing}
            onClick={() => void captureTask()}
            type="button"
          >
            {isCapturing ? "Creating" : "Create Capture Task"}
          </button>
        </div>
      ) : null}
      {captureStatus ? <p className="muted">{captureStatus}</p> : null}
      <div className="capture-panel">
        {showCorrection ? (
          <>
            <h3>Suggest a correction</h3>
            <SelectField
              id={`${idBase}-correction-kind`}
              label="What was wrong"
              onChange={(value) => setCorrectionKind(value as CorrectionKind)}
              options={AskCorrectionKinds.map((kind) => ({
                label: CORRECTION_KIND_LABELS[kind],
                value: kind,
              }))}
              value={correctionKind}
            />
            <Field htmlFor={`${idBase}-correction-note`} label="Correction">
              <textarea
                id={`${idBase}-correction-note`}
                onChange={(event) => setCorrectionNote(event.target.value)}
                rows={3}
                value={correctionNote}
              />
            </Field>
            <p className="muted">
              Filing a correction changes nothing on its own. An Admin reviews it.
            </p>
            <div className="ui-row">
              <button
                className="secondary-button"
                disabled={isCorrecting || correctionNote.trim() === ""}
                onClick={() => void submitCorrection()}
                type="button"
              >
                {isCorrecting ? "Filing" : "File correction"}
              </button>
              <button
                className="link-button"
                onClick={() => setShowCorrection(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button
            className="link-button"
            onClick={() => {
              setShowCorrection(true);
              setCorrectionStatus("");
            }}
            type="button"
          >
            Suggest a correction
          </button>
        )}
        {correctionStatus ? <p className="muted">{correctionStatus}</p> : null}
      </div>
    </section>
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
    <Field htmlFor={id} label={label}>
      <select id={id} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Show just the calendar date when the review value is an ISO timestamp; otherwise show it verbatim. */
function formatReviewedDate(value: string): string {
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? formatCalendarDate(match[0]) : value;
}

async function readErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };

  return typeof payload.error === "string" && payload.error.trim()
    ? payload.error
    : fallback;
}

/** One answer: every record, count and link comes from the owning service through the server. */
export function ConversationAnswerView({
  answer,
}: Readonly<{ answer: ConversationAnswer }>) {
  if (answer.kind === "knowledge") return null;
  if (answer.kind === "clarification") {
    return (
      <>
        <h2>One more detail</h2>
        <p>{answer.clarification}</p>
      </>
    );
  }
  if (answer.kind === "unsupported") return <p className="muted">{answer.summary}</p>;
  // Items are numbered across groups in answer order, the same order "the second one" refers to.
  const starts = answer.groups.map(
    (_, index) =>
      1 +
      answer.groups
        .slice(0, index)
        .reduce((total, group) => total + group.items.length, 0),
  );
  return (
    <>
      <h2>Answer</h2>
      <p>{answer.summary}</p>
      {answer.interpretation.length > 0 ? (
        <ul className="muted">
          {answer.interpretation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {answer.groups.map((group, index) => (
        <AnswerGroupView
          group={group}
          key={`${group.source}-${index}`}
          showSummary={answer.groups.length > 1}
          start={starts[index]}
        />
      ))}
    </>
  );
}

function AnswerGroupView({
  group,
  showSummary,
  start,
}: Readonly<{ group: AnswerGroup; showSummary: boolean; start: number }>) {
  return (
    <div className="ui-stack">
      {showSummary ? (
        <>
          <h3>{group.title}</h3>
          <p>{group.summary}</p>
        </>
      ) : null}
      {group.items.length > 0 ? (
        <ol className="ui-rows" start={start}>
          {group.items.map((item) => (
            <li key={`${item.ref.source}:${item.ref.id}`}>
              <Link href={item.href}>{item.title}</Link>
              <span className="muted"> · {item.detail}</span>
              {item.blockers.length > 0 ? (
                <span className="muted"> · {item.blockers.join("; ")}</span>
              ) : null}
              {item.facts && item.facts.length > 0 ? (
                <ul className="muted">
                  {item.facts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {group.notes.map((note) => (
        <p className="muted" key={note}>
          {note}
        </p>
      ))}
      {group.link ? (
        <p>
          <Link href={group.link.href}>{group.link.label}</Link>
        </p>
      ) : null}
    </div>
  );
}
