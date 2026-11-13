"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

export function FollowUpCopyPublication({
  status,
  onPublished,
}: Readonly<{
  status: "unpublished" | "approved" | undefined;
  onPublished: () => void;
}>) {
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  if (status === undefined) return null;
  if (published || status === "approved")
    return (
      <p data-renewal-field="follow-up-copy-published" role="status">
        The standard follow-up message is published.
      </p>
    );

  async function publish() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPublishing(true);
    setError("");
    try {
      const response = await fetch("/api/lease-renewal/message-preparation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "publish_follow_up" }),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.status === "approved") {
        setPublished(true);
        onPublished();
      } else {
        setError(
          result?.error ?? "The standard follow-up publication could not be confirmed.",
        );
      }
    } catch {
      setError(
        "The standard follow-up publication could not be confirmed. Refresh to check.",
      );
    } finally {
      inFlight.current = false;
      setPublishing(false);
    }
  }

  return (
    <div className="ui-stack-tight" data-renewal-field="follow-up-copy-publication">
      <p>The published wording fills the follow-up form for future reviews.</p>
      <p>
        <Button
          busy={publishing}
          onClick={() => void publish()}
          size="compact"
          type="button"
          variant="secondary"
        >
          Publish the standard follow-up message
        </Button>
      </p>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
