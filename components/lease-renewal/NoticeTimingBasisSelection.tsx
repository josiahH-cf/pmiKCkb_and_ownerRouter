"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field } from "@/components/ui";
import { formatBusinessTimestamp } from "@/lib/date-display";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import type {
  MoveOutTimingBasisAdminRead,
  NoticeTimingBasisSelectionRead,
} from "@/lib/firestore/lease-renewal-move-out-timing-basis";
import {
  DOCUMENTED_NOTICE_TIMING_DECISION as decision,
  NOTICE_TIMING_BASIS_TARGET_ID,
  SelectNoticeTimingBasisInputSchema,
  isDocumentedNoticeTimingBasis,
  type SelectNoticeTimingBasisInput,
} from "@/lib/lease-renewal/notice-timing-decision";

const endpoint = "/api/lease-renewal/notice-timing-basis";
const recoveryKey = "pmi-kc:notice-basis-selection:v1";
type State = "loading" | "idle" | "saving" | "saved" | "uncertain" | "conflict" | "error";

// Only a value-free intent is retained across reload. Recovery never dispatches on mount.
function retainIntent(intent: SelectNoticeTimingBasisInput | null) {
  try {
    if (intent) sessionStorage.setItem(recoveryKey, JSON.stringify(intent));
    else sessionStorage.removeItem(recoveryKey);
  } catch {
    /* Same-intent retry remains available in memory when storage is unavailable. */
  }
}

export function NoticeTimingBasisSelection({
  initial,
  canEdit = true,
}: {
  initial?: MoveOutTimingBasisAdminRead;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [read, setRead] = useState<MoveOutTimingBasisAdminRead>(
    initial ?? { state: "unreadable", record: null },
  );
  const [state, setState] = useState<State>(initial ? "idle" : "loading");
  const [allowed, setAllowed] = useState(canEdit);
  const [message, setMessage] = useState("");
  const pending = useRef<SelectNoticeTimingBasisInput | null>(null);
  const busy = useRef(false);
  const selected = isDocumentedNoticeTimingBasis(read.record) ? decision.id : "";

  async function readCurrent(intent?: SelectNoticeTimingBasisInput) {
    const response = await fetch(
      `${endpoint}${intent ? `?operationId=${encodeURIComponent(intent.operationId)}` : ""}`,
      { cache: "no-store" },
    );
    if (!response.ok)
      throw new Error("The saved basis and selection receipt could not be read.");
    const payload = (await response.json()) as NoticeTimingBasisSelectionRead;
    if (
      !payload.timingBasis ||
      !["saved", "missing", "invalid", "unreadable"].includes(payload.timingBasis.state)
    )
      throw new Error("Incomplete readback.");
    setRead(payload.timingBasis);
    setAllowed(canEdit && payload.canSelect === true);
    return payload;
  }

  async function reconcile(intent: SelectNoticeTimingBasisInput, refused?: string) {
    try {
      const payload = await readCurrent(intent);
      const receipt = payload.intent;
      if (
        receipt?.state === "recorded" &&
        receipt.operationId === intent.operationId &&
        receipt.decisionId === intent.decisionId &&
        receipt.expectedVersion === intent.expectedVersion &&
        receipt.record.operation_id === intent.operationId &&
        receipt.record.decision_id === intent.decisionId &&
        receipt.record.reviewed_note === decision.note &&
        receipt.record.decision_source === decision.source &&
        isDocumentedNoticeTimingBasis(receipt.record) &&
        receipt.record.version === intent.expectedVersion + 1
      ) {
        pending.current = null;
        retainIntent(null);
        if (
          payload.timingBasis.state === "saved" &&
          JSON.stringify(payload.timingBasis.record) === JSON.stringify(receipt.record)
        ) {
          setState("saved");
          setMessage(
            `Saved · version ${receipt.record.version}, ${formatBusinessTimestamp(receipt.record.updated_at)}.`,
          );
        } else {
          setState("conflict");
          setMessage(
            `Your selection was recorded as version ${receipt.record.version}; the shared basis has since changed or could not be read. Review the current basis.`,
          );
        }
        router.refresh();
      } else if (refused && receipt?.state === "missing") {
        pending.current = null;
        retainIntent(null);
        setState("conflict");
        setMessage(refused);
      } else {
        setState("uncertain");
        setMessage(
          "Selection outcome is uncertain. A matching basis alone does not prove this save. Retry uses the same selection identity.",
        );
      }
    } catch {
      setState("uncertain");
      setMessage(
        "Selection outcome is uncertain because its saved state and receipt could not be read. Retry uses the same selection identity.",
      );
    }
  }

  useEffect(() => {
    let stored: SelectNoticeTimingBasisInput | undefined;
    try {
      const raw = sessionStorage.getItem(recoveryKey);
      const parsed = raw
        ? SelectNoticeTimingBasisInputSchema.safeParse(JSON.parse(raw))
        : null;
      if (parsed?.success) stored = parsed.data;
    } catch {
      /* No durable intent to inspect. */
    }
    if (stored) {
      pending.current = stored;
      const recovery = stored;
      // Synchronize the retained browser operation after mount; this only reads its receipt.
      void Promise.resolve().then(() => {
        setState("saving");
        return reconcile(recovery);
      });
    } else if (!initial) {
      void Promise.resolve()
        .then(() => readCurrent())
        .then(() => setState("idle"))
        .catch(() => {
          setState("error");
          setMessage("The shared basis could not be read. Reload before selecting.");
        });
    }
    // Initial is a server snapshot; later saves explicitly refresh current state and their receipt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(intent: SelectNoticeTimingBasisInput) {
    if (busy.current) return;
    busy.current = true;
    pending.current = intent;
    retainIntent(intent);
    setState("saving");
    setMessage("");
    let refused: string | undefined;
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(intent),
      });
      if ([400, 401, 403, 409].includes(response.status)) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        refused =
          body.error ??
          "This selection was refused. Review the current basis before selecting again.";
      }
      // A successful PATCH body cannot replace independent current-state/owned-intent readback.
    } catch {
      /* An interrupted response does not establish that the transaction failed. */
    }
    await reconcile(intent, refused);
    busy.current = false;
  }

  async function reload() {
    setState("loading");
    try {
      await readCurrent();
      setState("idle");
      setMessage("");
    } catch {
      setState("error");
      setMessage("The shared basis could not be read. Reload before selecting.");
    }
  }

  return (
    <div
      className="ui-stack"
      id={NOTICE_TIMING_BASIS_TARGET_ID}
      data-notice-basis-selection-state={state}
    >
      <p className="muted">
        Shared basis for all renewal notice comparisons. Choosing the documented option
        saves it immediately. Missing or stale dates can still read Cannot determine. No
        message, schedule or provider record is created.
      </p>
      <Field label="Documented notice basis" htmlFor={id}>
        <select
          id={id}
          value={selected}
          disabled={
            !allowed ||
            ["loading", "saving", "uncertain", "conflict", "error"].includes(state) ||
            read.state === "invalid" ||
            read.state === "unreadable"
          }
          onChange={(event) => {
            if (
              event.target.value !== decision.id ||
              selected === decision.id ||
              busy.current ||
              pending.current
            )
              return;
            void submit({
              decisionId: decision.id,
              expectedVersion: read.record?.version ?? 0,
              operationId: crypto.randomUUID(),
            });
          }}
        >
          <option value="">Choose documented basis</option>
          <option value={decision.id}>{decision.label}</option>
        </select>
      </Field>
      <p className="muted">Documented source: {decision.note}</p>
      {read.record ? (
        <p className="muted">
          Current saved version {read.record.version}, recorded by{" "}
          {read.record.updated_by_uid} at{" "}
          {formatBusinessTimestamp(read.record.updated_at)}. Recorded source:{" "}
          {read.record.reviewed_note}
        </p>
      ) : (
        <p className="muted">
          {read.state === "missing"
            ? "No basis is saved. Notice timing remains Cannot determine until a basis and usable dates are available."
            : "The saved basis is invalid or unreadable. Review its current state before selecting."}
        </p>
      )}
      {state === "saving" ? (
        <p role="status">Saving selection and checking its receipt…</p>
      ) : null}
      {state === "loading" ? <p role="status">Reading shared notice basis…</p> : null}
      {message ? <p role={state === "saved" ? "status" : "alert"}>{message}</p> : null}
      {state === "uncertain" ? (
        <Button
          onClick={() => {
            if (pending.current) void submit(pending.current);
          }}
        >
          Retry same selection
        </Button>
      ) : null}
      {["conflict", "error"].includes(state) ||
      (state === "idle" && ["invalid", "unreadable"].includes(read.state)) ? (
        <Button
          onClick={() => {
            void reload();
          }}
        >
          Reload current basis
        </Button>
      ) : null}
      {!allowed ? (
        <p className="muted">
          This session can read the basis; an authorized renewal staff session is required
          to select it.
        </p>
      ) : null}
    </div>
  );
}
