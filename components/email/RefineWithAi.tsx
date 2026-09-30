"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button, Field } from "@/components/ui";

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
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const latestBody = useRef(currentBody);
  useEffect(() => {
    latestBody.current = currentBody;
  }, [currentBody]);
  // A proposal made from older text is never shown against newer edits.
  const visibleProposal = proposal && proposal.basedOn === currentBody ? proposal : null;

  async function refine() {
    const basedOn = currentBody;
    setPending(true);
    setNotice("");
    setProposal(null);
    try {
      const response = await fetch("/api/email-refinement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, currentBody: basedOn, instruction }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | RefinementResponse
        | { error?: string };
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
          "Your draft changed while this revision was prepared, so it was not shown. Refine again from the current text.",
        );
        return;
      }
      setProposal({
        body: payload.body,
        ...(payload.baseHash ? { baseHash: payload.baseHash } : {}),
        requestedValues: payload.requestedValues,
        removedValues: payload.removedValues,
        basedOn,
      });
    } catch {
      setNotice("The wording assistant could not be reached. Your draft is unchanged.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="AI wording refinement" className="ui-stack-tight" id={id}>
      <Field
        htmlFor={`${base}-instruction`}
        label="Refine with AI"
        hint="Describe the change, for example: make this shorter and warmer, or keep the amounts and dates but make the explanation clearer. Your instruction is not added to the email."
      >
        <textarea
          id={`${base}-instruction`}
          maxLength={1000}
          onChange={(event) => setInstruction(event.target.value)}
          rows={2}
          value={instruction}
        />
      </Field>
      <div className="ui-actions">
        <Button
          disabled={Boolean(disabledReason) || pending || !instruction.trim()}
          onClick={() => void refine()}
          type="button"
        >
          {pending ? "Refining…" : "Refine wording"}
        </Button>
      </div>
      {disabledReason ? <p className="muted">{disabledReason}</p> : null}
      {notice ? (
        <p className="muted" role="status">
          {notice}
        </p>
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
