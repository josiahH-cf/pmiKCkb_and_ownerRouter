"use client";

// S285 R-S285-6 (BEH-S285-5): in Ask the owner, an existing template approver reads one line,
// "New owner wording that asks about the term is ready to publish.", beside the owner template's
// publication. Before it publishes, the control states the consequence with the count of unsent
// owner messages that were reviewed with the current wording and will be held for review. The
// approver confirms that count; the server takes it again and publishes only when it is unchanged.
// An Editor sees nothing here. Nothing is sent; publishing is the existing template publication.

import { useState } from "react";

import { Button } from "@/components/ui";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import {
  OWNER_WORDING_KEEP_LABEL,
  OWNER_WORDING_PUBLISHED_LINE,
  OWNER_WORDING_PUBLISH_LABEL,
  OWNER_WORDING_READY_LINE,
  OWNER_WORDING_REVIEW_LABEL,
  ownerWordingPublishConsequence,
} from "@/lib/lease-renewal/owner-copy-version";

export interface OwnerCopyView {
  readonly version: "v2.0" | "v2.1";
  readonly readyToPublish: boolean;
  readonly canPublish: boolean;
}

type Phase =
  | { readonly step: "idle" }
  | { readonly step: "reading" }
  | { readonly step: "review"; readonly heldCount: number }
  | { readonly step: "publishing"; readonly heldCount: number }
  | { readonly step: "published"; readonly heldCount: number };

async function post(body: unknown) {
  const response = await fetch("/api/lease-renewal/message-preparation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    heldCount?: number;
    status?: string;
  };
  return { ok: response.ok, data };
}

export function OwnerWordingPublication({
  ownerCopy,
  onPublished,
}: Readonly<{
  ownerCopy: OwnerCopyView | null | undefined;
  /** Reads the owner message again once the new wording is in use. */
  onPublished?: () => void;
}>) {
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);
  if (!ownerCopy?.canPublish) return null;
  if (phase.step === "published")
    return (
      <p data-renewal-field="owner-wording-published" role="status">
        {OWNER_WORDING_PUBLISHED_LINE}
      </p>
    );
  if (!ownerCopy.readyToPublish) return null;

  async function review() {
    setError(null);
    setPhase({ step: "reading" });
    try {
      const { ok, data } = await post({ kind: "publish_owner_copy", version: "v2.1" });
      if (!ok || typeof data.heldCount !== "number") {
        setError(
          data.error ?? "The unsent owner messages could not be counted. Try again.",
        );
        setPhase({ step: "idle" });
        return;
      }
      setPhase({ step: "review", heldCount: data.heldCount });
    } catch {
      setError("The unsent owner messages could not be counted. Try again.");
      setPhase({ step: "idle" });
    }
  }

  async function publish(heldCount: number) {
    setError(null);
    setPhase({ step: "publishing", heldCount });
    try {
      const { ok, data } = await post({
        kind: "publish_owner_copy",
        version: "v2.1",
        confirm: { heldCount },
      });
      if (ok) {
        setPhase({ step: "published", heldCount });
        onPublished?.();
        return;
      }
      setError(data.error ?? "The new owner wording was not published.");
      // A changed count is stated again before anything is published.
      setPhase({
        step: "review",
        heldCount: typeof data.heldCount === "number" ? data.heldCount : heldCount,
      });
    } catch {
      setError("The new owner wording was not published. Nothing changed.");
      setPhase({ step: "review", heldCount });
    }
  }

  return (
    <div className="ui-stack-tight" data-renewal-field="owner-wording-publication">
      <p>{OWNER_WORDING_READY_LINE}</p>
      {phase.step === "review" || phase.step === "publishing" ? (
        <>
          <p data-renewal-field="owner-wording-consequence" role="note">
            {ownerWordingPublishConsequence(phase.heldCount)}
          </p>
          <div className="ui-row">
            <Button
              busy={phase.step === "publishing"}
              disabled={phase.step === "publishing"}
              onClick={() => void publish(phase.heldCount)}
              size="compact"
              type="button"
            >
              {OWNER_WORDING_PUBLISH_LABEL}
            </Button>
            <Button
              disabled={phase.step === "publishing"}
              onClick={() => {
                setError(null);
                setPhase({ step: "idle" });
              }}
              size="compact"
              type="button"
              variant="secondary"
            >
              {OWNER_WORDING_KEEP_LABEL}
            </Button>
          </div>
        </>
      ) : (
        <p>
          <Button
            busy={phase.step === "reading"}
            disabled={phase.step === "reading"}
            onClick={() => void review()}
            size="compact"
            type="button"
            variant="secondary"
          >
            {OWNER_WORDING_REVIEW_LABEL}
          </Button>
        </p>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
