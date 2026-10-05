"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { Button, Field } from "@/components/ui";
import { useOperation } from "@/components/hooks/useOperation";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";

// S139: the "Refine with AI" instruction box beside a workflow-linked draft. The instruction
// describes a change; it is never email text. The server proposes one revision of the CURRENT draft
// (including manual edits) from the owning record's facts; the person then uses or discards it
// through the draft's own editor. Nothing here saves, drafts or sends, and a failure, a refusal or a
// late answer leaves the draft exactly as it is.

export interface RefinementRevision {
  readonly body: string;
  /** Renewal only: the composed body the revision started from. */
  readonly baseHash?: string;
}

type RefinementResponse =
  | {
      status: "revised";
      body: string;
      requestedValues: string[];
      removedValues: string[];
      baseHash?: string;
    }
  | { status: "unchanged" | "refused" | "unavailable"; reason: string };

interface Proposal extends RefinementRevision {
  readonly requestedValues: readonly string[];
  readonly removedValues: readonly string[];
  /** The draft text this revision was made from. */
  readonly basedOn: string;
  readonly scope: string;
}

export function RefineWithAi({
  id,
  request,
  currentBody,
  disabledReason,
  appliedNotice = "Revision applied to the draft.",
  onApply,
}: Readonly<{
  /** Anchor for readiness links to this control. */
  id?: string;
  /** The owning record's identity for the refinement route (surface, lease or ticket). */
  request: Record<string, unknown>;
  /** The latest draft text, including accepted revisions and manual edits. */
  currentBody: string;
  /** When set, refinement is unavailable and this says why. */
  disabledReason?: string | null;
  /** What happens next once a revision is used, in this screen's own terms. */
  appliedNotice?: string;
  onApply: (revision: RefinementRevision) => void;
}>) {
  const base = useId();
  const scope = JSON.stringify(request);
  const operation = useOperation(scope);
  const currentScope = useRef(scope);
  useLayoutEffect(() => {
    currentScope.current = scope;
  }, [scope]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [instruction, setInstruction] = useState("");
  const pending = operation.snapshot.phase === "pending";
  const [submitted, setSubmitted] = useState("");
  const [notice, setNotice] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const latestBody = useRef(currentBody);
  useEffect(() => {
    latestBody.current = currentBody;
  }, [currentBody]);
  // A proposal made from older text is never shown against newer edits.
  const visibleProposal =
    proposal && proposal.scope === scope && proposal.basedOn === currentBody
      ? proposal
      : null;
  const earlierProposal =
    proposal && proposal.scope === scope && proposal.basedOn !== currentBody
      ? proposal
      : null;

  async function refine() {
    if (operation.controller.getSnapshot().phase === "pending") return;
    const basedOn = currentBody;
    const requested = instruction.trim();
    const requestedScope = scope;
    setSubmitted(requested);
    setNotice("");
    setProposal(null);
    const result = await operation.controller.run("Refining wording", async (signal) => {
      const response = await fetchWithDeadline("/api/email-refinement", {
        signal,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...request,
          currentBody: basedOn,
          instruction: requested,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | RefinementResponse
        | { error?: string };
      return { response, payload };
    });
    if (currentScope.current !== requestedScope || result.outcome === "superseded")
      return;
    if (result.outcome !== "succeeded") {
      setNotice(
        "Stopped waiting for wording. The server may still finish; your draft is unchanged. Retry from the current text.",
      );
      return;
    }
    const { response, payload } = result.value;
    if (!response.ok || !("status" in payload)) {
      setNotice(
        `${("error" in payload && payload.error) || "The wording assistant could not answer."} Your draft is unchanged.`,
      );
      return;
    }
    if (payload.status !== "revised") {
      setNotice(payload.reason);
      return;
    }
    if (latestBody.current !== basedOn) {
      setNotice(
        "Your draft changed while this revision was prepared. The earlier revision is available for review; your draft is unchanged.",
      );
    }
    setProposal({
      body: payload.body,
      ...(payload.baseHash ? { baseHash: payload.baseHash } : {}),
      requestedValues: payload.requestedValues,
      removedValues: payload.removedValues,
      basedOn,
      scope: requestedScope,
    });
  }

  return (
    <section
      aria-label="AI wording refinement"
      aria-busy={pending}
      className="ui-stack-tight"
      id={id}
    >
      <Field htmlFor={`${base}-instruction`} label="Refine with AI">
        <textarea
          ref={inputRef}
          id={`${base}-instruction`}
          maxLength={1000}
          onChange={(event) => setInstruction(event.target.value)}
          rows={2}
          value={instruction}
        />
      </Field>
      <div className="ui-actions">
        <Button
          busy={pending}
          busyLabel="Refining wording…"
          disabled={Boolean(disabledReason) || pending || !instruction.trim()}
          onClick={() => void refine()}
          type="button"
          variant="secondary"
        >
          Refine wording
        </Button>
        {pending ? (
          <Button
            variant="tertiary"
            onClick={() => {
              operation.controller.stop();
              inputRef.current?.focus();
            }}
          >
            Stop waiting
          </Button>
        ) : null}
      </div>
      {pending && submitted ? <p className="muted">Requested: {submitted}</p> : null}
      {disabledReason ? <p className="muted">{disabledReason}</p> : null}
      {notice ? (
        <p className="muted" role="status">
          {notice}
        </p>
      ) : null}
      {earlierProposal ? (
        <details className="ui-disclosure">
          <summary>Review earlier wording without replacing current edits</summary>
          <div className="draft-box">{earlierProposal.body}</div>
        </details>
      ) : null}
      {visibleProposal ? (
        <div aria-label="Proposed revision" className="ui-stack-tight" role="group">
          <p>
            <strong>Proposed revision.</strong> Review it; nothing changes until you use
            it.
          </p>
          <div className="draft-box">{visibleProposal.body}</div>
          {visibleProposal.requestedValues.length > 0 ? (
            <p className="muted">
              From your instruction: {visibleProposal.requestedValues.join(", ")}. This
              changes the email only; the source record is not updated.
            </p>
          ) : null}
          {visibleProposal.removedValues.length > 0 ? (
            <p className="muted">
              Removed as you asked: {visibleProposal.removedValues.join(", ")}.
            </p>
          ) : null}
          <div className="ui-actions">
            <Button
              onClick={() => {
                onApply({
                  body: visibleProposal.body,
                  ...(visibleProposal.baseHash
                    ? { baseHash: visibleProposal.baseHash }
                    : {}),
                });
                setProposal(null);
                setInstruction("");
                setNotice(appliedNotice);
              }}
              type="button"
            >
              Use this revision
            </Button>
            <Button onClick={() => setProposal(null)} type="button" variant="secondary">
              Discard
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
