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
  DashboardSavedNav,
  type SavedListState,
} from "@/components/ask/DashboardSavedNav";
import {
  ANSWER_FAILED,
  TurnView,
  readErrorMessage,
  type DashboardTurn,
  type DashboardTurnState,
} from "@/components/ask/DashboardTurnView";
import { Button } from "@/components/ui";
import { OperationController } from "@/lib/ui/operation";
import { fetchWithDeadline, fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import {
  beginHistoryTurn,
  fetchConversation,
  fetchHistoryPage,
  fetchSavedQuestions,
  finishHistoryTurn,
  runSavedQuestionRequest,
  saveQuestionRequest,
  updateSavedQuestionRequest,
  type HistoryConversationSummary,
  type HistoryPageOutcome,
  type RestoredConversation,
  type SavedListOutcome,
  type SavedQuestionView,
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

function newTurn(
  question: string,
  contextBefore: ConversationContext | null,
  extra: Partial<DashboardTurn> = {},
): DashboardTurn {
  return {
    id: newOperationId(),
    question,
    contextBefore,
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
    rerunOf: null,
    askedAgain: false,
    questionSave: "none",
    ...extra,
  };
}

const VERIFICATION_NOTE =
  "History is not saved for verification accounts. Conversations last while this page stays open.";
const UNAVAILABLE_NOTE =
  "History is not saved in this environment. Conversations last while this page stays open.";
const RERUN_FAILED =
  "Current results could not be loaded just now. Your earlier answer is unchanged.";
const RERUN_UNSUPPORTED =
  "This saved question needs a new answer, so it cannot run without a new interpretation. Use Ask again.";

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
      rerunOf: turn.rerunOf,
      askedAgain: false,
      questionSave: "none",
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

/** Pinned items first, in the order they were pinned here; the rest newest saved first. */
function sortSaved(items: readonly SavedQuestionView[]): SavedQuestionView[] {
  const pinned = items.filter((item) => item.pinned);
  const rest = items
    .filter((item) => !item.pinned)
    .sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso));
  return [...pinned, ...rest];
}

/**
 * S146/S148/S149 AI-first Dashboard workspace. The question box leads the main column; each
 * question and its answer appear below it in order, with their own loading, failure, retry and
 * save state. Nothing here selects, suggests, detects or starts a process: operational questions
 * use the S138 assistant and policy questions use the knowledge answer. Nothing submits on mount,
 * reopening a conversation or a saved question's last answer shows it as stored without asking
 * again, and running a saved question for current results adds a new answer beside the old one.
 */
type AskFormProps = Readonly<{
  secondary?: ReactNode;
  historyMode?: HistoryMode;
  ownerKey?: string;
  initialHistory?: Promise<HistoryPageOutcome> | null;
  initialSaved?: Promise<SavedListOutcome> | null;
}>;
export function AskForm(props: AskFormProps) {
  return (
    <OwnedAskForm
      key={`${props.ownerKey ?? ""}:${props.historyMode ?? "unavailable"}`}
      {...props}
    />
  );
}
function OwnedAskForm({
  secondary,
  historyMode = "unavailable",
  ownerKey = "",
  initialHistory = null,
  initialSaved = null,
}: AskFormProps) {
  const operations = useRef(new Map<string, OperationController>());
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    const pending = operations.current;
    return () => {
      live.current = false;
      pending.forEach((operation) => operation.stop());
    };
  }, []);
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
  const [saved, setSaved] = useState<SavedListState>({
    status: !saving ? "ok" : initialSaved ? "loading" : "failed",
    items: [],
    truncated: false,
    message: null,
  });
  const [savedBusy, setSavedBusy] = useState<ReadonlySet<string>>(() => new Set());
  const savedBusyRef = useRef(new Set<string>());
  const [opening, setOpening] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [dictationStatus, setDictationStatus] = useState("");
  const dictateButtonRef = useRef<HTMLButtonElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const turnRefs = useRef(new Map<string, HTMLElement>());
  const typedSinceSubmit = useRef(false);
  const pendingFocus = useRef<string | null>(null);
  const openingGeneration = useRef(0);
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
  const savedOperations = new Set(saved.items.map((item) => item.operationId));

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

  // The saved questions arrive with the page too; an item saved meanwhile is kept.
  useEffect(() => {
    if (!saving || !initialSaved) return;
    let current = true;
    void initialSaved.then((outcome) => {
      if (!current) return;
      setSaved((previous) =>
        outcome.status === "ok" && outcome.list.ownerKey === ownerKey
          ? {
              status: "ok",
              items: sortSaved([
                ...previous.items.filter(
                  (item) =>
                    !outcome.list.items.some((loaded) => loaded.savedId === item.savedId),
                ),
                ...outcome.list.items,
              ]),
              truncated: outcome.list.truncated,
              message: previous.message,
            }
          : { ...previous, status: "failed" },
      );
    });
    return () => {
      current = false;
    };
  }, [initialSaved, ownerKey, saving]);

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

  /** Keep the history list current after a turn was recorded, without another read. */
  function recordInHistoryList(
    conversationId: string,
    serverId: string,
    conversationKey: string,
    fallbackQuestion: string,
  ) {
    const latest = conversationsRef.current.find((entry) => entry.id === conversationId);
    upsertHistoryEntry({
      conversationId: serverId,
      conversationKey,
      title: excerpt(latest?.turns[0]?.question ?? fallbackQuestion),
      createdAtIso: latest?.startedAtIso ?? new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
      turnCount: latest?.turns.length ?? 1,
      lastState: "completed",
    });
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
      recordInHistoryList(
        conversationId,
        outcome.conversationId,
        conversation.key,
        turn.question,
      );
      setAnnouncement("Answer ready and saved to your history.");
    } else {
      setAnnouncement(
        "Answer ready, but it is not saved to your history yet. Use Retry saving.",
      );
    }
  }

  async function askKnowledge(
    asked: string,
    signal?: AbortSignal,
  ): Promise<{ answer: AskResponse | null; error: string | null }> {
    try {
      const response = await fetchWithDeadline("/api/ask", {
        signal,
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

  function stopWaiting(conversationId: string, turn: DashboardTurn) {
    operations.current.get(turn.id)?.stop();
    applyToTurnNow(conversationId, turn.id, { state: "interrupted", error: null });
    updateTurn(conversationId, turn.id, (current) => ({
      ...current,
      state: "interrupted",
      error: null,
    }));
    setAnnouncement(
      "Stopped waiting locally. The server may still finish; Retry recovers this same question.",
    );
  }
  async function runTurn(conversationId: string, turn: DashboardTurn) {
    const operation = operations.current.get(turn.id) ?? new OperationController();
    operations.current.set(turn.id, operation);
    const result = await operation.run("Working on your answer", (signal) =>
      executeTurn(conversationId, turn, signal, operation),
    );
    if (
      !live.current ||
      result.outcome === "succeeded" ||
      result.outcome === "superseded"
    )
      return;
    const current = conversationsRef.current
      .find((entry) => entry.id === conversationId)
      ?.turns.find((entry) => entry.id === turn.id);
    if (current?.state === "pending") stopWaiting(conversationId, turn);
  }
  async function executeTurn(
    conversationId: string,
    turn: DashboardTurn,
    signal: AbortSignal,
    operation: OperationController,
  ) {
    const asked = turn.question;
    let assistant: ConversationAnswer | null = null;
    let assistantUnavailable = false;
    let nextContext: ConversationContext | null | undefined;
    try {
      // S138: operational questions are answered from the records this user can already see,
      // continuing this conversation. A policy or how-to question (or the policy half of a mixed
      // question) also continues to the knowledge answer below. S148: the operation id lets the
      // server reuse this submission's answer for a duplicate delivery instead of asking again.
      const response = await fetchWithDeadline("/api/assistant/query", {
        signal,
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

    if (!live.current || signal.aborted || operation.getSnapshot().phase !== "pending")
      return;

    let knowledge: { answer: AskResponse | null; error: string | null } = {
      answer: null,
      error: null,
    };
    if (!assistant || assistant.knowledgeQuestion)
      knowledge = await askKnowledge(asked, signal);
    if (!live.current || signal.aborted || operation.getSnapshot().phase !== "pending")
      return;
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

  function applyToTurnNow(
    conversationId: string,
    turnId: string,
    next: Partial<DashboardTurn>,
  ) {
    // Keep the ref current immediately so a save that follows sees what was shown.
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
    applyToTurnNow(conversationId, turnId, next);
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

  /** Add a turn to a conversation, recording its conversation key on the first question. */
  function appendTurn(conversationId: string, turn: DashboardTurn, key: string) {
    const update = (entry: DashboardConversation) =>
      entry.id === conversationId
        ? { ...entry, key: entry.key ?? key, turns: [...entry.turns, turn] }
        : entry;
    conversationsRef.current = conversationsRef.current.map(update);
    setConversations((previous) => previous.map(update));
    typedSinceSubmit.current = false;
    pendingFocus.current = turn.id;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const asked = question.trim();
    if (!asked || isPending) return;
    const turn = newTurn(asked, active.context);
    const key = active.key ?? turn.id;
    appendTurn(active.id, turn, key);
    setAnnouncement("Working on your answer.");
    // Recording the question first lets history show an interrupted question as interrupted.
    if (saving)
      void beginHistoryTurn({
        operationId: turn.id,
        conversationKey: key,
        question: asked,
      });
    await runTurn(active.id, turn);
  }

  async function retry(conversationId: string, turn: DashboardTurn) {
    if (!["failed", "interrupted"].includes(turn.state) || turn.restored) return;
    updateTurn(conversationId, turn.id, (current) => ({
      ...current,
      state: "pending",
      error: null,
    }));
    pendingFocus.current = turn.id;
    if (turn.rerunOf) {
      await runRerun(conversationId, turn, turn.rerunOf);
      return;
    }
    setAnnouncement("Trying that question again.");
    await runTurn(conversationId, turn);
  }

  function startNewConversation() {
    openingGeneration.current += 1;
    setOpening(null);
    active.turns
      .filter((turn) => turn.state === "pending")
      .forEach((turn) => stopWaiting(active.id, turn));
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

  function focusTurn(
    conversation: DashboardConversation | undefined,
    turnId: string | null,
  ) {
    requestAnimationFrame(() => {
      const target =
        (turnId && conversation?.turns.find((turn) => turn.id === turnId)) ||
        conversation?.turns[0];
      if (target) turnRefs.current.get(target.id)?.focus();
    });
  }

  function reopenConversation(id: string) {
    openingGeneration.current += 1;
    setOpening(null);
    active.turns
      .filter((turn) => turn.state === "pending")
      .forEach((turn) => stopWaiting(active.id, turn));
    setActiveId(id);
    setAnnouncement("Opened an earlier conversation. Nothing was asked again.");
    focusTurn(
      conversations.find((entry) => entry.id === id),
      null,
    );
  }

  /**
   * Show one of this user's stored conversations, reading it only when it is not already open on
   * this page. Nothing in it is asked again. Returns this page's id for it, or null.
   */
  async function openStored(
    conversationId: string,
    focusTurnId: string | null,
    openedMessage: (updatedAtIso: string) => string,
  ): Promise<string | null> {
    const generation = ++openingGeneration.current;
    active.turns
      .filter((turn) => turn.state === "pending")
      .forEach((turn) => stopWaiting(active.id, turn));
    const loaded = conversationsRef.current.find(
      (entry) => entry.serverId === conversationId,
    );
    if (loaded) {
      setActiveId(loaded.id);
      setAnnouncement(openedMessage(""));
      focusTurn(loaded, focusTurnId);
      return loaded.id;
    }
    setOpening(conversationId);
    const restored = await fetchConversation(conversationId);
    if (!live.current || generation !== openingGeneration.current) return null;
    setOpening(null);
    if (!restored || restored.ownerKey !== ownerKey) {
      setAnnouncement(
        "That conversation could not be opened just now. Nothing was changed.",
      );
      return null;
    }
    const conversation = restoredConversation(restored);
    conversationsRef.current = [conversation, ...conversationsRef.current];
    setConversations((previous) => [conversation, ...previous]);
    setActiveId(conversation.id);
    setAnnouncement(openedMessage(restored.conversation.updatedAtIso));
    focusTurn(conversation, focusTurnId);
    return conversation.id;
  }

  async function openFromHistory(conversationId: string) {
    await openStored(conversationId, null, (updatedAtIso) =>
      updatedAtIso
        ? `Opened your conversation from ${formatBusinessTimestamp(updatedAtIso)}. Nothing was asked again.`
        : "Opened an earlier conversation. Nothing was asked again.",
    );
  }

  /** S149: show a saved question's newest stored answer. A read only; nothing runs. */
  async function openSaved(item: SavedQuestionView) {
    await openStored(
      item.conversationId,
      item.lastOperationId,
      () =>
        `Opened the last answer to your saved question, from ${formatBusinessTimestamp(item.lastAnsweredAtIso)}. Nothing was asked again.`,
    );
  }

  function setBusy(savedId: string, busy: boolean) {
    if (busy) savedBusyRef.current.add(savedId);
    else savedBusyRef.current.delete(savedId);
    setSavedBusy(new Set(savedBusyRef.current));
  }

  /**
   * S150: run a saved question for current results. The server runs its stored plan with no new
   * interpretation and records the result as a new turn; the earlier answer stays as it was. A
   * question that needs a new answer is asked again instead, and says so.
   */
  async function runSaved(item: SavedQuestionView) {
    if (savedBusyRef.current.has(item.savedId)) return;
    setBusy(item.savedId, true);
    try {
      const conversationId = await openStored(
        item.conversationId,
        item.lastOperationId,
        () => "Opened your saved question's conversation.",
      );
      if (!conversationId) {
        setSaved((previous) => ({
          ...previous,
          message: "The saved question could not be opened just now. Nothing was run.",
        }));
        return;
      }
      const conversation = conversationsRef.current.find(
        (entry) => entry.id === conversationId,
      );
      if (conversation?.turns.some((turn) => turn.state === "pending")) {
        setSaved((previous) => ({
          ...previous,
          message: "Wait for the current answer in that conversation, then run it again.",
        }));
        return;
      }
      if (!item.structured) {
        const turn = newTurn(item.question, item.contextBefore, { askedAgain: true });
        const key = conversation?.key ?? item.conversationKey;
        appendTurn(conversationId, turn, key);
        setAnnouncement("Asking your saved question again as a new question.");
        if (saving)
          void beginHistoryTurn({
            operationId: turn.id,
            conversationKey: key,
            question: item.question,
          });
        await runTurn(conversationId, turn);
        return;
      }
      const turn = newTurn(item.question, null, { rerunOf: item.savedId });
      appendTurn(conversationId, turn, conversation?.key ?? item.conversationKey);
      await runRerun(conversationId, turn, item.savedId);
    } finally {
      setBusy(item.savedId, false);
    }
  }

  async function runRerun(conversationId: string, turn: DashboardTurn, savedId: string) {
    const operation = operations.current.get(turn.id) ?? new OperationController();
    operations.current.set(turn.id, operation);
    const result = await operation.run("Reading current results", (signal) =>
      executeRerun(conversationId, turn, savedId, signal, operation),
    );
    if (
      !live.current ||
      result.outcome === "succeeded" ||
      result.outcome === "superseded"
    )
      return;
    const current = conversationsRef.current
      .find((entry) => entry.id === conversationId)
      ?.turns.find((entry) => entry.id === turn.id);
    if (current?.state === "pending") stopWaiting(conversationId, turn);
  }
  async function executeRerun(
    conversationId: string,
    turn: DashboardTurn,
    savedId: string,
    signal: AbortSignal,
    operation: OperationController,
  ) {
    setAnnouncement("Running your saved question for current results.");
    const outcome = await runSavedQuestionRequest(savedId, turn.id);
    if (!live.current || signal.aborted || operation.getSnapshot().phase !== "pending")
      return;
    if (outcome.status !== "ok") {
      const error = outcome.status === "unsupported" ? RERUN_UNSUPPORTED : RERUN_FAILED;
      const next: Partial<DashboardTurn> = { state: "failed", error };
      applyToTurnNow(conversationId, turn.id, next);
      updateTurn(conversationId, turn.id, (current) => ({ ...current, ...next }));
      setAnnouncement(`${error} Use Retry on that question.`);
      return;
    }
    const answer = outcome.turn.assistant;
    const next: Partial<DashboardTurn> = {
      state: "answered",
      assistant: answer,
      answeredAtIso: outcome.turn.answeredAtIso,
      error: null,
      saveState: "saved",
    };
    applyToTurnNow(conversationId, turn.id, next);
    updateTurn(
      conversationId,
      turn.id,
      (current) => ({ ...current, ...next }),
      answer?.conversation ?? undefined,
    );
    updateConversation(conversationId, (entry) => ({
      ...entry,
      serverId: outcome.conversationId,
    }));
    setSaved((previous) => ({
      ...previous,
      items: previous.items.map((item) =>
        item.savedId === outcome.item.savedId ? outcome.item : item,
      ),
    }));
    recordInHistoryList(
      conversationId,
      outcome.conversationId,
      outcome.item.conversationKey,
      outcome.turn.question,
    );
    const incomplete = (answer?.groups ?? []).some((group) => group.status !== "ok");
    setAnnouncement(
      incomplete
        ? "Current results ready, but some sources could not be read, so they may be incomplete. Your earlier answer is unchanged."
        : "Current results ready. Your earlier answer is unchanged.",
    );
  }

  /** S149: save one answered, recorded turn's question. Repeating it never makes a duplicate. */
  async function saveQuestionFor(conversationId: string, turn: DashboardTurn) {
    updateTurn(conversationId, turn.id, (current) => ({
      ...current,
      questionSave: "saving",
    }));
    const outcome = await saveQuestionRequest(turn.id);
    if (outcome.status !== "saved") {
      updateTurn(conversationId, turn.id, (current) => ({
        ...current,
        questionSave: "failed",
      }));
      setAnnouncement("This question could not be saved just now. Nothing was saved.");
      return;
    }
    updateTurn(conversationId, turn.id, (current) => ({
      ...current,
      questionSave: "saved",
    }));
    setSaved((previous) => ({
      ...previous,
      status: previous.status === "loading" ? previous.status : "ok",
      items: sortSaved([
        outcome.item,
        ...previous.items.filter((item) => item.savedId !== outcome.item.savedId),
      ]),
      message: "Saved to your questions.",
    }));
    setAnnouncement("Saved to your questions. Pin it to keep it at the top.");
  }

  async function reloadSaved(message: string | null = null) {
    setSaved((previous) => ({
      ...previous,
      status: previous.items.length ? previous.status : "loading",
    }));
    const outcome = await fetchSavedQuestions();
    setSaved((previous) =>
      outcome.status === "ok" && outcome.list.ownerKey === ownerKey
        ? {
            status: "ok",
            items: outcome.list.items,
            truncated: outcome.list.truncated,
            message,
          }
        : {
            ...previous,
            status: previous.items.length ? "ok" : "failed",
            message: message ?? "Your saved questions could not be loaded just now.",
          },
    );
  }

  /** S149: pin, unpin or relabel. Versioned; a change made elsewhere is shown, never overwritten. */
  async function changeSaved(
    item: SavedQuestionView,
    change: { pinned?: boolean; label?: string },
    messages: { ok: string; failed: string },
  ) {
    if (savedBusyRef.current.has(item.savedId)) return;
    setBusy(item.savedId, true);
    const outcome = await updateSavedQuestionRequest(item.savedId, {
      ...change,
      expectedVersion: item.recordVersion,
    });
    setBusy(item.savedId, false);
    if (outcome.status === "ok") {
      setSaved((previous) => ({
        ...previous,
        items: sortSaved(
          outcome.item.pinned && !item.pinned
            ? [
                outcome.item,
                ...previous.items.filter((entry) => entry.savedId !== item.savedId),
              ]
            : previous.items.map((entry) =>
                entry.savedId === item.savedId ? outcome.item : entry,
              ),
        ),
        message: messages.ok,
      }));
    } else if (outcome.status === "conflict") {
      await reloadSaved(
        "This saved question changed in another session. Its latest state is shown.",
      );
    } else {
      setSaved((previous) => ({ ...previous, message: messages.failed }));
    }
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
            minLength={1}
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
            Tenant, owner, property, or work question.
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
                    canSaveQuestion={
                      saving &&
                      turn.state === "answered" &&
                      turn.saveState === "saved" &&
                      !turn.rerunOf &&
                      !turn.askedAgain
                    }
                    index={index}
                    onRetry={() => void retry(active.id, turn)}
                    onStop={() => stopWaiting(active.id, turn)}
                    onRetrySave={() => void saveTurn(active.id, turn.id)}
                    onSaveQuestion={() => void saveQuestionFor(active.id, turn)}
                    registerRef={(element) => {
                      if (element) turnRefs.current.set(turn.id, element);
                      else turnRefs.current.delete(turn.id);
                    }}
                    turn={
                      savedOperations.has(turn.id)
                        ? { ...turn, questionSave: "saved" }
                        : turn
                    }
                  />
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>

      <div className="dashboard-secondary">
        {saving ? (
          <>
            <DashboardSavedNav
              busy={savedBusy}
              onOpen={(item) => void openSaved(item)}
              onRename={(item, label) =>
                void changeSaved(
                  item,
                  { label },
                  {
                    ok: "Renamed.",
                    failed:
                      "The label could not be changed just now. Nothing was changed.",
                  },
                )
              }
              onRetry={() => void reloadSaved()}
              onRun={(item) => void runSaved(item)}
              onTogglePin={(item) =>
                void changeSaved(
                  item,
                  { pinned: !item.pinned },
                  {
                    ok: item.pinned
                      ? "Unpinned. It stays in your saved questions."
                      : "Pinned. It stays at the top of your saved questions.",
                    failed: "The pin could not be changed just now. Nothing was changed.",
                  },
                )
              }
              state={saved}
            />
            <DashboardHistoryNav
              activeConversationId={opening ?? active.serverId}
              onOpen={(conversationId) => void openFromHistory(conversationId)}
              onRetry={() => void reloadHistory()}
              onShowOlder={() => void showOlderHistory()}
              state={history}
            />
          </>
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
