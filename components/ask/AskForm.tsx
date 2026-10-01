"use client";

import { formatBusinessTimestamp } from "@/lib/date-display";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAudioRecorder } from "@/components/hooks/useAudioRecorder";
import {
  DashboardHistoryNav,
  type HistoryListState,
} from "@/components/ask/DashboardHistoryNav";
import {
  ANSWER_FAILED,
  TurnView,
  readErrorMessage,
  type DashboardTurn,
  type DashboardTurnState,
} from "@/components/ask/DashboardTurnView";
import { Button } from "@/components/ui";
import {
  beginHistoryTurn,
  fetchConversation,
  fetchHistoryPage,
  finishHistoryTurn,
  type HistoryConversationSummary,
  type HistoryPageOutcome,
  type RestoredConversation,
} from "@/lib/assistant-history/client";
import type { ConversationAnswer } from "@/lib/assistant/conversation";
import type { ConversationContext } from "@/lib/assistant/conversation-plan";
import type { AskResponse } from "@/lib/schemas";

export type {
  DashboardTurn,
  DashboardTurnState,
} from "@/components/ask/DashboardTurnView";

/** Existing example questions (the S138 question families); choosing one only fills the box. */
export const DASHBOARD_EXAMPLE_QUESTIONS = [
  "What leases are due this week?",
  "What work is assigned to me today?",
  "What applications are connected?",
] as const;

/**
 * Where this page's conversations are kept. `saved`: the signed-in user's own server history.
 * `verification`: a verification account, which is answered but never saved. `unavailable`: this
 * environment refuses history writes (the local Live-read-only rehearsal).
 */
export type HistoryMode = "saved" | "verification" | "unavailable";

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

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

export interface DashboardConversation {
  /** This page's id for the conversation. */
  readonly id: string;
  /** The first question's operation id, which names the conversation in history. */
  readonly key: string | null;
  /** The history id once a turn was saved or the conversation was reopened. */
  readonly serverId: string | null;
  readonly startedAtIso: string;
  readonly turns: readonly DashboardTurn[];
  /** The latest server context, sent with the next question in this conversation. */
  readonly context: ConversationContext | null;
}

function newConversation(): DashboardConversation {
  return {
    id: newOperationId(),
    key: null,
    serverId: null,
    startedAtIso: new Date().toISOString(),
    turns: [],
    context: null,
  };
}

const VERIFICATION_NOTE =
  "History is not saved for verification accounts. Conversations last while this page stays open.";
const UNAVAILABLE_NOTE =
  "History is not saved in this environment. Conversations last while this page stays open.";

/** A reopened conversation, shown exactly as stored; nothing in it is asked again. */
function restoredConversation(restored: RestoredConversation): DashboardConversation {
  const turns: DashboardTurn[] = restored.turns.map((turn) => {
    const state: DashboardTurnState =
      turn.displayState === "completed"
        ? "answered"
        : turn.displayState === "in_progress"
          ? "in_progress"
          : turn.displayState;
    return {
      id: turn.operationId,
      question: turn.question,
      contextBefore: null,
      state,
      assistant: turn.assistant,
      assistantUnavailable: false,
      knowledge: turn.knowledge,
      knowledgeError: null,
      error: null,
      answeredAtIso: turn.answeredAtIso,
      restored: true,
      accessChanged: turn.accessChanged,
      saveState: "saved",
    };
  });
  // Follow-ups continue from the latest stored context; they re-read current records.
  const lastContext =
    [...restored.turns].reverse().find((turn) => turn.assistant)?.assistant
      ?.conversation ?? null;
  return {
    id: newOperationId(),
    key: restored.conversation.conversationKey,
    serverId: restored.conversation.conversationId,
    startedAtIso: restored.conversation.createdAtIso,
    turns,
    context: lastContext,
  };
}

/**
 * S146/S148 AI-first Dashboard workspace. The question box leads the main column; each question and
 * its answer appear below it in order, with their own loading, failure, retry and save state.
 * Nothing here selects, suggests, detects or starts a process: operational questions use the S138
 * assistant and policy questions use the knowledge answer. Nothing submits on mount, and reopening
 * a conversation from history shows it as stored without asking again.
 */
export function AskForm({
  secondary,
  historyMode = "unavailable",
  ownerKey = "",
  initialHistory = null,
}: Readonly<{
  secondary?: ReactNode;
  historyMode?: HistoryMode;
  ownerKey?: string;
  /** The first history page, read on the server and streamed in; never fetched on mount. */
  initialHistory?: Promise<HistoryPageOutcome> | null;
}>) {
  // Until hydration, a native form submit would put the question in the page URL.
  const ready = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const saving = historyMode === "saved";
  const [question, setQuestion] = useState("");
  const [conversations, setConversations] = useState<readonly DashboardConversation[]>(
    () => [newConversation()],
  );
  const [activeId, setActiveId] = useState(() => conversations[0].id);
  const [announcement, setAnnouncement] = useState("");
  // Without a first page to wait for, the list offers its own retry instead of loading forever.
  const [history, setHistory] = useState<HistoryListState>({
    status: !saving ? "ok" : initialHistory ? "loading" : "failed",
    entries: [],
    nextCursor: null,
    olderStatus: null,
  });
  const [opening, setOpening] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [dictationStatus, setDictationStatus] = useState("");
  const dictateButtonRef = useRef<HTMLButtonElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const turnRefs = useRef(new Map<string, HTMLElement>());
  const typedSinceSubmit = useRef(false);
  const pendingFocus = useRef<string | null>(null);
  // The latest conversations for async save steps; handlers also update it before their setState.
  const conversationsRef = useRef(conversations);
  useLayoutEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const active = conversations.find((entry) => entry.id === activeId) ?? conversations[0];
  const isPending = active.turns.some((turn) => turn.state === "pending");
  const earlier = conversations.filter(
    (entry) => entry.id !== active.id && entry.turns.length > 0,
  );

  // The first history page arrives with the page; reading it starts no request of its own.
  useEffect(() => {
    if (!saving || !initialHistory) return;
    let current = true;
    void initialHistory.then((outcome) => {
      if (!current) return;
      setHistory(
        outcome.status === "ok" && outcome.page.ownerKey === ownerKey
          ? {
              status: "ok",
              entries: outcome.page.conversations,
              nextCursor: outcome.page.nextCursor,
              olderStatus: null,
            }
          : { status: "failed", entries: [], nextCursor: null, olderStatus: null },
      );
    });
    return () => {
      current = false;
    };
  }, [initialHistory, ownerKey, saving]);

  const updateConversation = useCallback(
    (
      conversationId: string,
      update: (entry: DashboardConversation) => DashboardConversation,
    ) => {
      setConversations((previous) =>
        previous.map((entry) => (entry.id === conversationId ? update(entry) : entry)),
      );
    },
    [],
  );

  const updateTurn = useCallback(
    (
      conversationId: string,
      turnId: string,
      update: (turn: DashboardTurn) => DashboardTurn,
      context?: ConversationContext | null,
    ) => {
      updateConversation(conversationId, (entry) => ({
        ...entry,
        context: context === undefined ? entry.context : context,
        turns: entry.turns.map((turn) => (turn.id === turnId ? update(turn) : turn)),
      }));
    },
    [updateConversation],
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

  function upsertHistoryEntry(entry: HistoryConversationSummary) {
    setHistory((previous) => ({
      ...previous,
      status: previous.status === "loading" ? previous.status : "ok",
      entries: [
        entry,
        ...previous.entries.filter(
          (item) => item.conversationId !== entry.conversationId,
        ),
      ],
    }));
  }

  async function saveTurn(conversationId: string, turnId: string) {
    const conversation = conversationsRef.current.find(
      (entry) => entry.id === conversationId,
    );
    const turn = conversation?.turns.find((entry) => entry.id === turnId);
    if (!conversation?.key || !turn || turn.state !== "answered") return;
    updateTurn(conversationId, turnId, (current) => ({
      ...current,
      saveState: "saving",
    }));
    const outcome = await finishHistoryTurn(turn.id, {
      conversationKey: conversation.key,
      question: turn.question,
      state: "completed",
      assistant: turn.assistant,
      knowledge: turn.knowledge,
    });
    updateTurn(conversationId, turnId, (current) => ({
      ...current,
      saveState: outcome.status === "saved" ? "saved" : "failed",
    }));
    if (outcome.status === "saved") {
      updateConversation(conversationId, (entry) => ({
        ...entry,
        serverId: outcome.conversationId,
      }));
      const latest = conversationsRef.current.find(
        (entry) => entry.id === conversationId,
      );
      upsertHistoryEntry({
        conversationId: outcome.conversationId,
        conversationKey: conversation.key,
        title: excerpt(latest?.turns[0]?.question ?? turn.question),
        createdAtIso: conversation.startedAtIso,
        updatedAtIso: new Date().toISOString(),
        turnCount: latest?.turns.length ?? 1,
        lastState: "completed",
      });
      setAnnouncement("Answer ready and saved to your history.");
    } else {
      setAnnouncement(
        "Answer ready, but it is not saved to your history yet. Use Retry saving.",
      );
    }
  }

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
      // question) also continues to the knowledge answer below. S148: the operation id lets the
      // server reuse this submission's answer for a duplicate delivery instead of asking again.
      const response = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: asked,
          conversation: turn.contextBefore,
          operationId: turn.id,
        }),
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

    let knowledge: { answer: AskResponse | null; error: string | null } = {
      answer: null,
      error: null,
    };
    if (!assistant || assistant.knowledgeQuestion) knowledge = await askKnowledge(asked);
    const answered = Boolean(assistant) || Boolean(knowledge.answer);
    finishTurn(conversationId, turn.id, asked, {
      state: answered ? "answered" : "failed",
      assistant,
      assistantUnavailable: assistantUnavailable && answered,
      knowledge: knowledge.answer,
      knowledgeError: answered ? knowledge.error : null,
      error: answered ? null : (knowledge.error ?? ANSWER_FAILED),
      context: nextContext,
    });
    if (!saving) return;
    if (answered) {
      await saveTurn(conversationId, turn.id);
    } else {
      const conversation = conversationsRef.current.find(
        (entry) => entry.id === conversationId,
      );
      // The failed state is recorded so history never shows this question as answered.
      if (conversation?.key)
        void finishHistoryTurn(turn.id, {
          conversationKey: conversation.key,
          question: asked,
          state: "failed",
          assistant: null,
          knowledge: null,
        });
    }
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
    const next: Partial<DashboardTurn> = {
      state: outcome.state,
      assistant: outcome.assistant,
      assistantUnavailable: outcome.assistantUnavailable,
      knowledge: outcome.knowledge,
      knowledgeError: outcome.knowledgeError,
      error: outcome.error,
      answeredAtIso: outcome.state === "answered" ? new Date().toISOString() : null,
    };
    // Keep the ref current immediately so the save that follows sees the answer that was shown.
    conversationsRef.current = conversationsRef.current.map((entry) =>
      entry.id !== conversationId
        ? entry
        : {
            ...entry,
            turns: entry.turns.map((turn) =>
              turn.id === turnId ? { ...turn, ...next } : turn,
            ),
          },
    );
    updateTurn(conversationId, turnId, (turn) => ({ ...turn, ...next }), outcome.context);
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
      restored: false,
      accessChanged: false,
      saveState: "none",
    };
    const conversationId = active.id;
    const key = active.key ?? turn.id;
    const update = (entry: DashboardConversation) =>
      entry.id === conversationId
        ? { ...entry, key, turns: [...entry.turns, turn] }
        : entry;
    conversationsRef.current = conversationsRef.current.map(update);
    setConversations((previous) => previous.map(update));
    typedSinceSubmit.current = false;
    pendingFocus.current = turn.id;
    setAnnouncement("Working on your answer.");
    // Recording the question first lets history show an interrupted question as interrupted.
    if (saving)
      void beginHistoryTurn({
        operationId: turn.id,
        conversationKey: key,
        question: asked,
      });
    await runTurn(conversationId, turn);
  }

  async function retry(conversationId: string, turn: DashboardTurn) {
    if (turn.state !== "failed" || turn.restored) return;
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
    conversationsRef.current = [next, ...conversationsRef.current];
    setConversations((previous) => [next, ...previous]);
    setActiveId(next.id);
    setAnnouncement(
      saving
        ? "Started a new conversation. The earlier one stays in your history."
        : "Started a new conversation. The earlier one is listed under Conversations.",
    );
    requestAnimationFrame(() => questionRef.current?.focus());
  }

  function focusFirstTurn(conversation: DashboardConversation | undefined) {
    requestAnimationFrame(() => {
      const target = conversation?.turns[0];
      if (target) turnRefs.current.get(target.id)?.focus();
    });
  }

  function reopenConversation(id: string) {
    setActiveId(id);
    setAnnouncement("Opened an earlier conversation. Nothing was asked again.");
    focusFirstTurn(conversations.find((entry) => entry.id === id));
  }

  async function openFromHistory(conversationId: string) {
    const loaded = conversationsRef.current.find(
      (entry) => entry.serverId === conversationId,
    );
    if (loaded) {
      reopenConversation(loaded.id);
      return;
    }
    setOpening(conversationId);
    const restored = await fetchConversation(conversationId);
    setOpening(null);
    if (!restored || restored.ownerKey !== ownerKey) {
      setAnnouncement(
        "That conversation could not be opened just now. Nothing was changed.",
      );
      return;
    }
    const conversation = restoredConversation(restored);
    conversationsRef.current = [conversation, ...conversationsRef.current];
    setConversations((previous) => [conversation, ...previous]);
    setActiveId(conversation.id);
    setAnnouncement(
      `Opened your conversation from ${formatBusinessTimestamp(restored.conversation.updatedAtIso)}. Nothing was asked again.`,
    );
    focusFirstTurn(conversation);
  }

  async function reloadHistory() {
    setHistory((previous) => ({ ...previous, status: "loading" }));
    const outcome = await fetchHistoryPage(null);
    setHistory(
      outcome.status === "ok" && outcome.page.ownerKey === ownerKey
        ? {
            status: "ok",
            entries: outcome.page.conversations,
            nextCursor: outcome.page.nextCursor,
            olderStatus: null,
          }
        : { status: "failed", entries: [], nextCursor: null, olderStatus: null },
    );
  }

  async function showOlderHistory() {
    const cursor = history.nextCursor;
    if (!cursor) return;
    setHistory((previous) => ({ ...previous, olderStatus: "loading" }));
    const outcome = await fetchHistoryPage(cursor);
    if (outcome.status !== "ok" || outcome.page.ownerKey !== ownerKey) {
      setHistory((previous) => ({ ...previous, olderStatus: "failed" }));
      return;
    }
    setHistory((previous) => ({
      ...previous,
      entries: [
        ...previous.entries,
        ...outcome.page.conversations.filter(
          (entry) =>
            !previous.entries.some(
              (item) => item.conversationId === entry.conversationId,
            ),
        ),
      ],
      nextCursor: outcome.page.nextCursor,
      olderStatus: null,
    }));
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
              {saving
                ? "Each answer in this conversation is saved to your history."
                : "This conversation lasts while this page stays open."}
            </p>
            <ol className="dashboard-turns">
              {active.turns.map((turn, index) => (
                <li key={turn.id}>
                  <TurnView
                    index={index}
                    onRetry={() => void retry(active.id, turn)}
                    onRetrySave={() => void saveTurn(active.id, turn.id)}
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
        {saving ? (
          <DashboardHistoryNav
            activeConversationId={opening ?? active.serverId}
            onOpen={(conversationId) => void openFromHistory(conversationId)}
            onRetry={() => void reloadHistory()}
            onShowOlder={() => void showOlderHistory()}
            state={history}
          />
        ) : (
          <nav aria-label="Conversations" className="panel dashboard-nav">
            <h2>Conversations</h2>
            <p className="muted">
              {historyMode === "verification" ? VERIFICATION_NOTE : UNAVAILABLE_NOTE}
            </p>
            {earlier.length > 0 ? (
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
            ) : null}
          </nav>
        )}
        {secondary}
      </div>
    </div>
  );
}

export function excerpt(text: string, max = 80): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}
