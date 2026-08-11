"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { idleCutoffAt, workIdlePhase } from "@/lib/work-accountability/model";
import type { WorkSessionRecord } from "@/lib/work-accountability/types";

interface WorkActivityControllerProps {
  session: WorkSessionRecord;
  taskId: string;
  taskVersion: number;
  serverNow: string;
  mutationAllowed: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}

export function WorkActivityController({
  session,
  taskId,
  taskVersion,
  serverNow,
  mutationAllowed,
  onChanged,
  onError,
}: WorkActivityControllerProps) {
  const serverOffset = useMemo(() => Date.parse(serverNow) - Date.now(), [serverNow]);
  const [now, setNow] = useState(() => new Date(Date.now() + serverOffset).toISOString());
  const requestInFlight = useRef(false);
  const lastHeartbeatRequestAt = useRef(0);
  const cutoffRequestKey = useRef("");
  const phase = workIdlePhase(session.last_acknowledged_activity_at, now);
  const cutoffAt = idleCutoffAt(session.last_acknowledged_activity_at);
  const secondsRemaining = Math.max(
    0,
    Math.ceil((Date.parse(cutoffAt) - Date.parse(now)) / 1_000),
  );

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      if (!mutationAllowed || requestInFlight.current) return;
      requestInFlight.current = true;
      try {
        const response = await fetch("/api/work", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "The work session could not be updated.");
        }
        await onChanged();
      } catch (error) {
        onError(
          error instanceof Error
            ? error.message
            : "The work session could not be updated.",
        );
      } finally {
        requestInFlight.current = false;
      }
    },
    [mutationAllowed, onChanged, onError],
  );

  const acknowledgeVisibleActivity = useCallback(() => {
    if (
      !mutationAllowed ||
      document.visibilityState !== "visible" ||
      session.state !== "Active"
    ) {
      return;
    }
    const requestAt = Date.now();
    if (requestAt - lastHeartbeatRequestAt.current < 60_000) return;
    lastHeartbeatRequestAt.current = requestAt;
    void post({
      action: "heartbeat",
      session_id: session.id,
      expected_version: session.record_version,
    });
  }, [mutationAllowed, post, session.id, session.record_version, session.state]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date(Date.now() + serverOffset).toISOString());
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [serverOffset]);

  useEffect(() => {
    if (!mutationAllowed || session.state !== "Active") return;
    // These handlers intentionally accept no event parameter. A signal means only that one
    // allowlisted interaction occurred while this document was visible.
    const signal = () => acknowledgeVisibleActivity();
    document.addEventListener("pointerdown", signal, { passive: true });
    document.addEventListener("keydown", signal, { passive: true });
    document.addEventListener("touchstart", signal, { passive: true });
    document.addEventListener("scroll", signal, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", signal);
      document.removeEventListener("keydown", signal);
      document.removeEventListener("touchstart", signal);
      document.removeEventListener("scroll", signal, true);
    };
  }, [acknowledgeVisibleActivity, mutationAllowed, session.state]);

  useEffect(() => {
    if (!mutationAllowed || phase !== "cutoff" || session.state !== "Active") return;
    const key = `${session.id}:${session.record_version}:${cutoffAt}`;
    if (cutoffRequestKey.current === key) return;
    cutoffRequestKey.current = key;
    void post(
      document.visibilityState === "visible"
        ? {
            action: "heartbeat",
            session_id: session.id,
            expected_version: session.record_version,
          }
        : { action: "reconcile" },
    );
  }, [cutoffAt, mutationAllowed, phase, post, session]);

  if (!mutationAllowed) {
    return (
      <p className="work-session-note" role="status">
        This active session is read-only in the current environment.
      </p>
    );
  }

  if (phase !== "warning") return null;

  return (
    <aside className="work-idle-warning" role="alert" aria-live="assertive">
      <strong>Still working?</strong>
      <span>
        This session pauses in {Math.floor(secondsRemaining / 60)}:
        {String(secondsRemaining % 60).padStart(2, "0")} unless activity is confirmed.
      </span>
      <div className="work-actions">
        <button type="button" onClick={acknowledgeVisibleActivity}>
          Continue work
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            void post({
              action: "transition_task",
              task_id: taskId,
              expected_version: taskVersion,
              next_state: "Paused",
              idempotency_key: crypto.randomUUID(),
            })
          }
        >
          Pause now
        </button>
      </div>
    </aside>
  );
}
