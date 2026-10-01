"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { SourceStateBanner } from "@/components/source-state-banner/SourceStateBanner";
import { BusyIndicator, Field, Notice } from "@/components/ui";
import type { AnswerGroup, ConversationAnswer } from "@/lib/assistant/conversation";
import type { ConversationContext } from "@/lib/assistant/conversation-plan";
import { formatBusinessTimestamp, formatCalendarDate } from "@/lib/date-display";
import { AskCorrectionKinds, type AskResponse } from "@/lib/schemas";
import { launchSpaces } from "@/lib/spaces";

// S146/S148 Dashboard turns: one question and everything shown for it, with its own pending,
// failure, retry and history-save state. A turn reopened from history is shown exactly as stored
// and labelled with its answer time; it is never asked again.

type SelectOption = { label: string; value: string };
type CorrectionKind = (typeof AskCorrectionKinds)[number];

const CORRECTION_KIND_LABELS: Record<CorrectionKind, string> = {
  wrong_fact: "Wrong fact",
  wrong_source: "Wrong source",
  missing_detail: "Missing detail",
  wrong_process: "Wrong process",
};

const writableSpaceOptions = launchSpaces
  .filter((space) => space.showInDirectory !== false && !space.readOnly)
  .map((space) => ({ label: space.name, value: space.id }));
const capturableStates = new Set([
  "Partial Source",
  "Open Placeholder",
  "No Reliable Source Found",
]);

/**
 * A turn's lifecycle. `pending` while its requests run; `answered` once an answer shows; `failed`
 * when no answer arrived; `interrupted` and `in_progress` only for turns reopened from history
 * whose answer was never saved. Never a completed answer unless one actually arrived.
 */
export type DashboardTurnState =
  | "pending"
  | "answered"
  | "failed"
  | "interrupted"
  | "in_progress";

/** Whether this turn's answer is in the signed-in user's history. */
export type TurnSaveState = "none" | "saving" | "saved" | "failed";

/** S149: whether this turn's question is among the user's saved questions. */
export type QuestionSaveState = "none" | "saving" | "saved" | "failed";

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
  /** True when the turn was reopened from history rather than answered on this page. */
  readonly restored: boolean;
  /** Restored only: the viewer's access narrowed since, so stored records are hidden. */
  readonly accessChanged: boolean;
  readonly saveState: TurnSaveState;
  /** S150: the saved question this turn ran for current results, or null. */
  readonly rerunOf: string | null;
  /** S149: an unstructured saved question asked again through the model path. */
  readonly askedAgain: boolean;
  readonly questionSave: QuestionSaveState;
}

export const ANSWER_FAILED =
  "The answer could not be loaded. Your question is kept, so you can try again.";

export function TurnView({
  turn,
  index,
  onRetry,
  onRetrySave,
  canSaveQuestion = false,
  onSaveQuestion,
  registerRef,
}: Readonly<{
  turn: DashboardTurn;
  index: number;
  onRetry: () => void;
  onRetrySave: () => void;
  /** S149: offered on an answered turn that is in history and is not itself a saved run. */
  canSaveQuestion?: boolean;
  onSaveQuestion?: () => void;
  registerRef: (element: HTMLElement | null) => void;
}>) {
  const headingId = `dashboard-turn-${index + 1}`;
  return (
    <article
      aria-busy={turn.state === "pending" ? "true" : undefined}
      aria-labelledby={headingId}
      className="panel dashboard-turn"
      data-restored={turn.restored ? "true" : undefined}
      data-state={turn.state}
      ref={registerRef}
      tabIndex={-1}
    >
      <p className="dashboard-turn-question" id={headingId}>
        <span className="muted">You asked: </span>
        {turn.question}
      </p>
      {turn.restored && turn.state === "answered" && turn.answeredAtIso ? (
        <p className="muted dashboard-turn-history" data-testid="turn-history-label">
          Saved answer from {formatBusinessTimestamp(turn.answeredAtIso)}. It shows what
          was true then, not current results.
        </p>
      ) : null}
      {turn.rerunOf && turn.state === "answered" && turn.answeredAtIso ? (
        <p className="muted" data-testid="turn-rerun-label">
          {turn.restored
            ? "This was a current run of a saved question."
            : `Current results, run ${formatBusinessTimestamp(turn.answeredAtIso)} from your saved question with no new interpretation.`}
        </p>
      ) : null}
      {turn.askedAgain && !turn.restored ? (
        <p className="muted" data-testid="turn-asked-again-label">
          Asked again as a new question, so this answer was newly generated.
        </p>
      ) : null}
      {turn.restored && turn.accessChanged ? (
        <p className="muted">
          Your access has changed since this answer, so its records are hidden.
        </p>
      ) : null}
      {turn.state === "pending" ? (
        <BusyIndicator delayMs={0} label="Working on your answer" />
      ) : null}
      {turn.state === "failed" && !turn.restored ? (
        <Notice actionLabel="Retry" onAction={onRetry} tone="error">
          {turn.error ?? ANSWER_FAILED}
        </Notice>
      ) : null}
      {turn.state === "failed" && turn.restored ? (
        <p className="muted">No answer was saved for this question.</p>
      ) : null}
      {turn.state === "interrupted" ? (
        <p className="muted">
          This question was interrupted before an answer was saved. No answer is shown.
        </p>
      ) : null}
      {turn.state === "in_progress" ? (
        <p className="muted">
          This question was still being answered when you opened it. No answer is saved
          yet.
        </p>
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
      <TurnSaveLine onRetrySave={onRetrySave} turn={turn} />
      {canSaveQuestion && onSaveQuestion ? (
        <QuestionSaveLine onSaveQuestion={onSaveQuestion} turn={turn} />
      ) : null}
    </article>
  );
}

function TurnSaveLine({
  turn,
  onRetrySave,
}: Readonly<{ turn: DashboardTurn; onRetrySave: () => void }>) {
  if (turn.restored || turn.state !== "answered") return null;
  if (turn.saveState === "saving")
    return <p className="muted dashboard-turn-save">Saving to your history…</p>;
  if (turn.saveState === "saved")
    return (
      <p className="muted dashboard-turn-save" data-save-state="saved">
        Saved to your history.
      </p>
    );
  if (turn.saveState === "failed")
    return (
      <Notice actionLabel="Retry saving" onAction={onRetrySave} tone="caution">
        This answer is not saved to your history yet. Retrying saves this same answer; it
        does not ask again.
      </Notice>
    );
  return null;
}

function QuestionSaveLine({
  turn,
  onSaveQuestion,
}: Readonly<{ turn: DashboardTurn; onSaveQuestion: () => void }>) {
  if (turn.questionSave === "saved")
    return (
      <p className="muted" data-testid="turn-question-saved">
        Saved to your questions.
      </p>
    );
  if (turn.questionSave === "saving")
    return <p className="muted">Saving the question…</p>;
  return (
    <div className="ui-row">
      <button className="link-button" onClick={onSaveQuestion} type="button">
        Save question
      </button>
      {turn.questionSave === "failed" ? (
        <span className="muted">
          This question could not be saved just now. Nothing was saved.
        </span>
      ) : null}
    </div>
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

export async function readErrorMessage(response: Response, fallback: string) {
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
      {group.asOf ? (
        <p className="muted" data-testid="group-as-of">
          {group.title} read {formatBusinessTimestamp(group.asOf)}
          {group.coverage
            ? `, covering ${formatCalendarDate(group.coverage.startIso)} through ${formatCalendarDate(group.coverage.endIso)}`
            : ""}
          .
        </p>
      ) : null}
      {group.link ? (
        <p>
          <Link href={group.link.href}>{group.link.label}</Link>
        </p>
      ) : null}
    </div>
  );
}
