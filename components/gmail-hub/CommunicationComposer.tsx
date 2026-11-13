"use client";

import { RenewalSenderSignatureForm } from "@/components/lease-renewal/RenewalSenderSignatureForm";
import { hasCurrentRenewalAuthorization } from "@/lib/gmail-hub/delivery-policy";
import { replyWatchApplies } from "@/lib/gmail-hub/reply-watch";
import { buildManagedGmailThreadDestination } from "@/lib/lease-renewal/desk-destinations";
import { applyBusinessSignature } from "@/lib/gmail-hub/business-signature";
import type { StaffBusinessProfile } from "@/lib/staff/business-profile";
import {
  SEQUENCE_PAUSE_CAUSE_LABELS,
  describeSequenceState,
} from "@/lib/gmail-hub/communication-state";
import {
  communicationEvidenceHeading,
  describeCommunicationEvidence,
} from "@/lib/gmail-hub/communication-evidence";
import { classifyIncomingMessage } from "@/lib/gmail-hub/inbound-classification";
import { changedInputLine, type ReviewedInput } from "@/lib/gmail-hub/reviewed-inputs";
import type { GmailThreadView } from "@/lib/gmail-runtime/types";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { RichMessageEditor } from "./RichMessageEditor";
import { RefineWithAi } from "@/components/email/RefineWithAi";
import { Button, Field } from "@/components/ui";
import {
  RichCommunicationMessageSchema,
  SequenceDraftSchema,
  renderEditableCommunicationBody,
  type CommunicationAttachment,
  type CommunicationOccurrence,
  type CommunicationSequence,
  type RichCommunicationMessage,
  type SequenceDraft,
} from "@/lib/gmail-hub/sequence-model";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import {
  describeResumeTiming,
  describeWallTimeAdjustment,
  formatZonedInstant,
  resolveWallTime,
  type CommunicationSchedule,
} from "@/lib/gmail-hub/schedule-calendar";
import { BUSINESS_TIME_ZONE } from "@/lib/lease-renewal/business-calendar";
import { useMinuteClock } from "@/components/hooks/useMinuteClock";
import { workflowEntityHref } from "@/lib/gmail-hub/workflow-context";
import { messageRevisionLabel } from "@/lib/lease-renewal/message-revision";

interface SequencePayload {
  sequence: CommunicationSequence;
  reviewedDraftHash: string;
  notice?: string;
  /** S233 R-S233-1: present on a communication read; actions keep the last read list. */
  attempts?: CommunicationOccurrence[];
  attemptsTruncated?: boolean;
  /** S233 R-S233-1: the attempts could not be read with this response; the last list is kept. */
  attemptsUnavailable?: boolean;
}
type Entry =
  | { id: string }
  | { lease: string; purpose: "renewal_owner" | "renewal_tenant" }
  | { ticket: string; purpose: "maintenance_owner" }
  | {
      reply_from: string;
      reply_thread: string;
      reply_sender: string;
      reply_parent: string;
    };
interface Composition {
  context: WorkflowCommunicationContext;
  initial: RichCommunicationMessage;
  target: {
    label: string;
    to: string[];
    cc: string[];
    blockers?: string[];
    signatureSetup?: object | null;
    /** S274 R-S274-5: the inputs this review displays; sent back only to name what changed. */
    reviewedInputs?: ReviewedInput[];
  };
  attachmentNotice: string | null;
  signatureParagraph?: RichCommunicationMessage["paragraphs"][number] | null;
  reviewedTargetHash: string;
  /** S249: the lease message record revision a renewal composition was made from. */
  messageRevision?: string;
}
const emptyFollowUp = () =>
  ({
    subject: "",
    paragraphs: [[{ text: "" }]],
    attachmentIds: [],
  }) as RichCommunicationMessage;
async function jsonRequest<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const payload = await response.json().catch(() => {
    throw Object.assign(
      new Error(
        body === undefined
          ? "The communication could not be read. Try again."
          : "The operation could not be confirmed. Check the recorded status.",
      ),
      { status: response.status },
    );
  });
  if (!response.ok)
    throw Object.assign(
      new Error(payload.error ?? "This communication could not be saved or checked."),
      { status: response.status },
    );
  return payload as T;
}
export function CommunicationComposer({
  entry,
  authenticatedEmail,
  onClose,
  onChanged,
}: {
  entry: Entry;
  authenticatedEmail: string;
  onClose(): void;
  onChanged(): void;
}) {
  const [businessProfile, setBusinessProfile] = useState<StaffBusinessProfile | null>(
    null,
  );
  useEffect(() => {
    let current = true;
    void jsonRequest<{ profile: StaffBusinessProfile | null }>(
      "/api/staff/business-profile",
    )
      .then((p) => {
        if (current) setBusinessProfile(p.profile);
      })
      .catch(() => {
        if (current) setBusinessProfile(null);
      });
    return () => {
      current = false;
    };
  }, [authenticatedEmail]);
  const [saveNeedsRetry, setSaveNeedsRetry] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [messageRevision, setMessageRevision] = useState<string | null>(null);
  const [thread, setThread] = useState<GmailThreadView | null>(null);
  const [threadMailbox, setThreadMailbox] = useState<string | null>(null);
  const threadGeneration = useRef(0);
  const [saveTick, setSaveTick] = useState(0),
    [conflict, setConflict] = useState(false),
    [pendingFile, setPendingFile] = useState<"initial" | "followUp" | null>(null);
  const uploadIntent = useRef<{
    id: string;
    file: File;
    which: "initial" | "followUp";
  } | null>(null);
  const [draft, setDraft] = useState<SequenceDraft | null>(null),
    [sequence, setSequence] = useState<CommunicationSequence | null>(null);
  const [signatureOverride, setSignatureOpen] = useState<boolean | null>(null);
  const [reviewedTargetHash, setReviewedTargetHash] = useState("");
  const [target, setTarget] = useState<Composition["target"] | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Loading communication…"),
    [busy, setBusy] = useState(false);
  const signatureOpen = signatureOverride ?? Boolean(target?.signatureSetup === null);
  const [attachments, setAttachments] = useState<Record<string, CommunicationAttachment>>(
      {},
    ),
    [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const nowMs = useMinuteClock();
  const [scheduleOpen, setScheduleOpen] = useState(false),
    [date, setDate] = useState(""),
    [time, setTime] = useState(""),
    // S233: PMI KC schedules on Central time; the browser's own zone is never assumed.
    [zone, setZone] = useState<string>(BUSINESS_TIME_ZONE),
    [every, setEvery] = useState(""),
    [end, setEnd] = useState(""),
    [limit, setLimit] = useState("");
  const scheduleId = useId();
  const scheduleReady = Boolean(date && time && zone.trim());
  const [staff, setStaff] = useState<{ uid: string; name: string; email: string }[]>([]),
    [transferUid, setTransferUid] = useState("");
  const currentDraft = useRef<SequenceDraft | null>(null),
    version = useRef(0),
    savedJson = useRef(""),
    hash = useRef("");
  const saveIntent = useRef<{
    action: "save";
    draft: SequenceDraft;
    expectedVersion: number;
    operationId: string;
  } | null>(null);
  const [attempts, setAttempts] = useState<CommunicationOccurrence[]>([]),
    [attemptsTruncated, setAttemptsTruncated] = useState(false),
    // When the latest response could not load the attempts: the time of the list still shown.
    [attemptsUnavailable, setAttemptsUnavailable] = useState<{
      lastReadAtMs: number | null;
    } | null>(null);
  const attemptsReadAt = useRef<number | null>(null);
  const lastResponse = useRef<SequencePayload | null>(null),
    saveFlight = useRef<Promise<SequencePayload> | null>(null),
    locked = useRef(false),
    active = useRef(true),
    loadRun = useRef(0);
  const entryKey = JSON.stringify(entry);
  const retryLoadRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnToComposer = useRef(false);
  const compositionFlight = useRef<{ key: string; promise: Promise<Composition> }>(null);
  const loadedSignatureParagraph = useRef<Composition["signatureParagraph"]>(undefined);
  // S281 R-S281-6 (ARCH-S281-3): opening a new composer writes nothing. Its first save follows a
  // staff input event (typing, a changed recipient or choice, an attached file); an existing
  // communication is already a record, so its edits save as before.
  const staffInput = useRef("id" in entry);
  const markStaffInput = () => {
    staffInput.current = true;
  };

  const readComposition = useCallback(
    (query: URLSearchParams) => {
      const key = JSON.stringify([authenticatedEmail, query.toString()]);
      if (compositionFlight.current?.key === key)
        return compositionFlight.current.promise;
      const promise: Promise<Composition> = jsonRequest<Composition>(
        `/api/gmail-hub/composition?${query}`,
      ).finally(() => {
        if (compositionFlight.current?.promise === promise)
          compositionFlight.current = null;
      });
      compositionFlight.current = { key, promise };
      return promise;
    },
    [authenticatedEmail],
  );
  const accept = useCallback((p: SequencePayload) => {
    lastResponse.current = p;
    version.current = p.sequence.version;
    hash.current = p.reviewedDraftHash;
    setSequence(p.sequence);
    if (p.attempts) {
      setAttempts(p.attempts);
      setAttemptsTruncated(p.attemptsTruncated === true);
      attemptsReadAt.current = Date.now();
      setAttemptsUnavailable(null);
    } else if (p.attemptsUnavailable) {
      // The action's own result stands; the list shown is the last one loaded, and says so.
      setAttemptsUnavailable({ lastReadAtMs: attemptsReadAt.current });
    }
    for (const m of [
      p.sequence.authorization?.initial,
      p.sequence.authorization?.followUp,
    ])
      if (m)
        setAttachments((old) => ({
          ...old,
          ...Object.fromEntries(m.attachments.map((a) => [a.id, a])),
        }));
  }, []);
  useEffect(() => {
    active.current = true;
    // A repeated effect joins the exact pending composition. Only the current entry/run may
    // apply the response or install a new app draft.
    const run = ++loadRun.current;
    loadedSignatureParagraph.current = undefined;
    const current = () => active.current && loadRun.current === run;
    void (async () => {
      try {
        let next: SequenceDraft;
        if ("id" in entry) {
          const p = await jsonRequest<SequencePayload>(
            `/api/gmail-hub/sequences?id=${encodeURIComponent(entry.id)}`,
          );
          if (!current()) return;
          accept(p);
          next = {
            id: p.sequence.id,
            context: p.sequence.context,
            initial: p.sequence.initial,
            followUp: p.sequence.followUp,
          };
          savedJson.current = JSON.stringify(next);
          const schedule = p.sequence.authorization?.schedule;
          if (schedule) {
            setDate(schedule.firstDate);
            setTime(schedule.time);
            setZone(schedule.timeZone);
            setEvery(schedule.everyDays?.toString() ?? "");
            setEnd(schedule.endDate ?? "");
            setLimit(schedule.sendLimit?.toString() ?? "");
          }
          setStatus("Saved");
          void Promise.all(
            [
              ...new Set([
                ...next.initial.attachmentIds,
                ...(next.followUp?.attachmentIds ?? []),
              ]),
            ].map(async (id) => {
              const r: { attachment: CommunicationAttachment } = await jsonRequest(
                `/api/gmail-hub/sequence-attachments?id=${p.sequence.id}&attachment=${id}&mode=metadata`,
              );
              if (current()) setAttachments((old) => ({ ...old, [id]: r.attachment }));
            }),
          ).catch(() => {
            if (current())
              setAttachmentNotice(
                "Some attached files could not be verified. Keep them for recovery or remove them deliberately.",
              );
          });
          const reply = p.sequence.context.replyTo;
          const q = new URLSearchParams(
            reply
              ? {
                  reply_from: reply.sequenceId,
                  reply_thread: reply.threadId,
                  reply_sender: reply.senderEmail,
                  reply_parent: reply.parentId,
                }
              : {
                  purpose: p.sequence.context.purpose,
                  [p.sequence.context.entityType === "renewal_lease"
                    ? "lease"
                    : "ticket"]: p.sequence.context.entityId,
                },
          );
          void readComposition(q)
            .then((r) => {
              if (current()) {
                loadedSignatureParagraph.current = r.signatureParagraph;
                setTarget(r.target);
                setReviewedTargetHash(r.reviewedTargetHash);
                setAttachmentNotice(r.attachmentNotice);
              }
            })
            .catch(() => {
              if (current())
                setAttachmentNotice(
                  "Current recipients are unavailable. Drafting and history stay available; verify recipients before using the Gmail draft control in the linked lease.",
                );
            });
        } else {
          const q = new URLSearchParams(entry as Record<string, string>);
          const p = await readComposition(q);
          if (!current()) return;
          next = {
            id: crypto.randomUUID(),
            context: p.context,
            initial: p.initial,
            followUp: null,
          };
          loadedSignatureParagraph.current = p.signatureParagraph;
          setTarget(p.target);
          setReviewedTargetHash(p.reviewedTargetHash);
          setAttachmentNotice(p.attachmentNotice);
          setMessageRevision(p.messageRevision ?? null);
          // S281 R-S281-6: nothing is saved until the staff member changes something.
          setStatus(
            staffInput.current
              ? "Saving draft…"
              : "Not saved yet. Your first change saves a draft.",
          );
        }
        returnToComposer.current =
          retryLoadRef.current !== null &&
          document.activeElement === retryLoadRef.current;
        setError("");
        currentDraft.current = next;
        setDraft(next);
      } catch (e) {
        if (current()) {
          setError(
            e instanceof Error ? e.message : "The workflow message is unavailable.",
          );
          setStatus("Needs attention");
        }
      }
    })();
    return () => {
      active.current = false;
    };
    // The entry is stable for this mounted editor; parent keys it by the route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey, accept, readComposition, loadAttempt]);
  useLayoutEffect(() => {
    if (!draft || !returnToComposer.current) return;
    returnToComposer.current = false;
    headingRef.current?.focus();
  }, [draft]);
  const change = (next: SequenceDraft) => {
    currentDraft.current = next;
    setDraft(next);
    setStatus("Unsaved changes");
  };
  const save = useCallback(async (): Promise<SequencePayload> => {
    if (saveFlight.current) return saveFlight.current;
    const d = currentDraft.current;
    if (!d) throw new Error("The message has not loaded.");
    if (
      !saveIntent.current &&
      JSON.stringify(d) === savedJson.current &&
      lastResponse.current
    )
      return lastResponse.current;
    if (!saveIntent.current)
      saveIntent.current = {
        action: "save",
        draft: d,
        expectedVersion: version.current,
        operationId: crypto.randomUUID(),
      };
    const intent = saveIntent.current;
    const promise = (async () => {
      setStatus("Saving draft…");
      if (!("id" in entry))
        window.history.replaceState(
          null,
          "",
          `/gmail-hub?communication=${encodeURIComponent(intent.draft.id)}`,
        );
      const p = await jsonRequest<SequencePayload>("/api/gmail-hub/sequences", intent);
      if (p.sequence.version !== intent.expectedVersion + 1)
        throw new Error(
          "Another staff member changed this communication. Your wording is retained; reload the current state before replacing it.",
        );
      accept(p);
      savedJson.current = JSON.stringify(intent.draft);
      saveIntent.current = null;
      setSaveNeedsRetry(false);
      if (active.current) {
        setStatus(
          JSON.stringify(currentDraft.current) === savedJson.current
            ? "Saved"
            : "Unsaved changes",
        );
        setError("");
      }
      if (!("id" in entry))
        window.history.replaceState(
          null,
          "",
          `/gmail-hub?communication=${encodeURIComponent(p.sequence.id)}`,
        );
      onChanged();
      return p;
    })();
    saveFlight.current = promise;
    try {
      return await promise;
    } catch (e) {
      setSaveNeedsRetry(true);
      if ((e as { status?: number }).status === 409) setConflict(true);
      throw e;
    } finally {
      saveFlight.current = null;
      if (active.current) setSaveTick((tick) => tick + 1);
    }
  }, [accept, entry, onChanged]);
  useEffect(() => {
    if (
      !draft ||
      locked.current ||
      // S281 R-S281-6: an untouched new composer creates no communication record.
      !staffInput.current ||
      JSON.stringify(draft) === savedJson.current ||
      saveIntent.current
    )
      return;
    if (!SequenceDraftSchema.safeParse(draft).success) return;
    const timer = setTimeout(() => {
      void save().catch((e) => {
        setError(e.message);
        setStatus("Save needs attention: wording retained");
      });
    }, 650);
    return () => clearTimeout(timer);
  }, [draft, save, saveTick]);
  const run = async (
    action:
      | "send"
      | "schedule"
      | "resume"
      | "pause"
      | "cancel"
      | "transfer"
      | "reconcile"
      | "refresh",
  ) => {
    if (
      locked.current ||
      !currentDraft.current ||
      (action === "schedule" && !scheduleReady)
    )
      return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      let p: SequencePayload;
      if (["send", "schedule", "resume"].includes(action)) {
        while (
          JSON.stringify(currentDraft.current) !== savedJson.current ||
          saveIntent.current ||
          saveFlight.current
        )
          await save();
        const schedule: CommunicationSchedule | null =
          action === "schedule"
            ? {
                firstDate: date,
                time,
                timeZone: zone,
                everyDays: every ? Number(every) : null,
                endDate: end || null,
                sendLimit: limit ? Number(limit) : null,
              }
            : null;
        p = await jsonRequest("/api/gmail-hub/sequences", {
          action,
          id: currentDraft.current.id,
          expectedVersion: version.current,
          operationId: crypto.randomUUID(),
          reviewedDraftHash: hash.current,
          reviewedTargetHash,
          schedule,
          // S274 R-S274-5: a refusal names each input that changed since this review.
          ...(target?.reviewedInputs ? { reviewedInputs: target.reviewedInputs } : {}),
        });
      } else {
        const input = {
          action,
          id: currentDraft.current.id,
          ...(["reconcile", "refresh"].includes(action)
            ? {}
            : { expectedVersion: version.current, operationId: crypto.randomUUID() }),
          ...(action === "transfer" ? { responsibleUid: transferUid } : {}),
        };
        p = await jsonRequest("/api/gmail-hub/sequences", input);
      }
      accept(p);
      setStatus(
        p.notice ??
          describeSequenceState({
            ...p.sequence,
            scheduled: !!p.sequence.authorization?.schedule,
          }).label,
      );
      onChanged();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The action could not be confirmed. Check its recorded state before trying again.",
      );
      try {
        accept(
          await jsonRequest<SequencePayload>(
            `/api/gmail-hub/sequences?id=${currentDraft.current.id}`,
          ),
        );
      } catch {
        /* keep the last known state and wording */
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const upload = async (file: File, which: "initial" | "followUp") => {
    if (locked.current || !currentDraft.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      while (
        !version.current ||
        JSON.stringify(currentDraft.current) !== savedJson.current ||
        saveIntent.current ||
        saveFlight.current
      )
        await save();
      if (
        uploadIntent.current &&
        (uploadIntent.current.file !== file || uploadIntent.current.which !== which)
      )
        throw new Error("Check the original file upload before selecting another file.");
      if (!uploadIntent.current)
        uploadIntent.current = { id: crypto.randomUUID(), file, which };
      setPendingFile(which);
      const { id } = uploadIntent.current,
        form = new FormData();
      form.set("file", file);
      const r = await fetch(
        `/api/gmail-hub/sequence-attachments?id=${currentDraft.current.id}&attachment=${id}`,
        { method: "POST", body: form },
      );
      const p = await r.json();
      if (!r.ok || p.attachment?.state !== "ready")
        throw new Error(
          p.error ?? "The file needs reconciliation before it can be attached.",
        );
      uploadIntent.current = null;
      setPendingFile(null);
      const a = p.attachment as CommunicationAttachment;
      setAttachments((old) => ({ ...old, [a.id]: a }));
      const d = currentDraft.current,
        m = d[which];
      if (m)
        change({
          ...d,
          [which]: { ...m, attachmentIds: [...new Set([...m.attachmentIds, a.id])] },
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The file is unavailable.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const copy = async (message: RichCommunicationMessage) => {
    try {
      const r = renderEditableCommunicationBody(message.paragraphs, message.layout);
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write)
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([r.plainText], { type: "text/plain" }),
            "text/html": new Blob([r.htmlBody], { type: "text/html" }),
          }),
        ]);
      else await navigator.clipboard.writeText(r.plainText);
      setStatus("Message copied; files remain attached here");
    } catch {
      setError("Copy was unavailable. Your message remains here.");
    }
  };
  const showStaff = async () => {
    try {
      let after: string | null = null;
      const result: typeof staff = [];
      do {
        const p: { staff: typeof staff; cursor: string | null } = await jsonRequest(
          `/api/gmail-hub/managed-senders${after ? `?after=${encodeURIComponent(after)}` : ""}`,
        );
        result.push(...p.staff);
        after = p.cursor;
      } while (after && result.length < 1000);
      setStaff(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Staff senders are unavailable.");
    }
  };
  if (!draft)
    return (
      <section aria-label="Communication composer">
        <p role="status">{status}</p>
        {error ? <p role="alert">{error}</p> : null}
        {error ? (
          <Button
            aria-disabled={status === "Loading communication…" || undefined}
            onClick={() => {
              if (status === "Loading communication…") return;
              setStatus("Loading communication…");
              setLoadAttempt((attempt) => attempt + 1);
            }}
            ref={retryLoadRef}
            variant="secondary"
          >
            Try again
          </Button>
        ) : null}
        <button onClick={onClose}>Close</button>
      </section>
    );
  const terminal = !!sequence && ["completed", "cancelled"].includes(sequence.state),
    canAuthorize = !sequence || sequence.senderEmail === authenticatedEmail.toLowerCase();
  const recipientTo = target?.to ?? sequence?.authorization?.to ?? [],
    recipientCc = target?.cc ?? sequence?.authorization?.cc ?? [];
  const blocks = target?.blockers ?? [];
  const draftCanSave = SequenceDraftSchema.safeParse(draft).success;
  const initialFilesUnverified = draft.initial.attachmentIds.some(
    (id) => !attachments[id],
  );
  const followUpReady =
    RichCommunicationMessageSchema.safeParse(draft.followUp).success &&
    !draft.followUp?.attachmentIds.some((id) => !attachments[id]) &&
    !pendingFile;
  const initialBlocked =
    busy ||
    terminal ||
    conflict ||
    pendingFile === "initial" ||
    !canAuthorize ||
    !draftCanSave ||
    initialFilesUnverified ||
    !reviewedTargetHash ||
    !recipientTo.length ||
    blocks.length > 0 ||
    !!sequence?.unresolvedOccurrenceId;
  const resumeRepeats = sequence?.authorization?.schedule?.everyDays != null;
  return (
    <section
      className="ui-card ui-stack communication-composer"
      aria-label="Workflow communication composer"
      onChangeCapture={markStaffInput}
      onInputCapture={markStaffInput}
    >
      <div className="ui-row">
        <h2 ref={headingRef} tabIndex={-1}>
          {target?.label ??
            sequence?.workflowLabel ??
            `${draft.context.purpose.replaceAll("_", " ")} · ${draft.context.entityId}`}
        </h2>
        <button type="button" onClick={onClose}>
          Back to Communications
        </button>
      </div>
      <a
        href={workflowEntityHref({
          entity_type: draft.context.entityType,
          entity_id: draft.context.entityId,
        })}
      >
        Open linked{" "}
        {draft.context.entityType === "renewal_lease" ? "lease" : "maintenance ticket"}
      </a>
      {messageRevision ? (
        // S249 ARCH-S249-2: the lease's one message record this draft started from.
        <p data-communication-message-revision={messageRevision}>
          From the lease message, revision {messageRevisionLabel(messageRevision)}.
        </p>
      ) : null}
      <p>
        Responsible sender: <strong>{sequence?.senderEmail ?? authenticatedEmail}</strong>
      </p>
      <p>
        To: {recipientTo.join(", ") || "Current verified recipient waits for source read"}
        {recipientCc.length ? ` · Cc: ${recipientCc.join(", ")}` : ""}
      </p>
      {draft.context.entityType === "renewal_lease" && !terminal && canAuthorize ? (
        <>
          <Button
            size="compact"
            variant="secondary"
            onClick={() => setSignatureOpen(!signatureOpen)}
          >
            Set up or edit your signature
          </Button>
          {signatureOpen ? (
            <RenewalSenderSignatureForm
              onCancel={() => setSignatureOpen(false)}
              onSaved={async () => {
                const reply = draft.context.replyTo;
                const params = new URLSearchParams(
                  reply
                    ? {
                        reply_from: reply.sequenceId,
                        reply_thread: reply.threadId,
                        reply_sender: reply.senderEmail,
                        reply_parent: reply.parentId,
                      }
                    : { lease: draft.context.entityId, purpose: draft.context.purpose },
                );
                const entryRun = loadRun.current;
                const next = await readComposition(params);
                if (!active.current || loadRun.current !== entryRun) return;
                const current = currentDraft.current;
                if (current && !sequence?.authorization) {
                  const prior = loadedSignatureParagraph.current;
                  const paragraphs = [...current.initial.paragraphs];
                  const tail = JSON.stringify(paragraphs.at(-1));
                  // Replace only a known generated footer. The rest of the draft stays as typed.
                  if (tail !== JSON.stringify(next.signatureParagraph)) {
                    if (prior && tail === JSON.stringify(prior)) paragraphs.pop();
                    if (next.signatureParagraph) paragraphs.push(next.signatureParagraph);
                  }
                  if (!paragraphs.length) paragraphs.push([{ text: "" }]);
                  if (
                    JSON.stringify(paragraphs) !==
                    JSON.stringify(current.initial.paragraphs)
                  )
                    change({ ...current, initial: { ...current.initial, paragraphs } });
                }
                loadedSignatureParagraph.current = next.signatureParagraph;
                setTarget(next.target);
                setReviewedTargetHash(next.reviewedTargetHash);
                setSignatureOpen(false);
                setStatus(
                  "Signature saved. Review the current wording before authorizing the message.",
                );
              }}
            />
          ) : null}
        </>
      ) : null}
      {blocks.map((b) => (
        <p key={b} role="status">
          {b}
        </p>
      ))}
      <p>
        Next message:{" "}
        {sequence?.confirmedCount ? "reviewed follow-up" : "initial message"}
      </p>
      {sequence ? (
        <p
          data-communication-state={sequence.state}
          data-communication-version={sequence.version}
        >
          {
            describeSequenceState({
              ...sequence,
              scheduled: !!sequence.authorization?.schedule,
            }).label
          }
        </p>
      ) : null}
      <p role="status">
        {draftCanSave ? status : "Check the draft subject and message to save"}
        {sequence
          ? ` · ${sequence.confirmedCount} confirmed message${sequence.confirmedCount === 1 ? "" : "s"}`
          : ""}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {conflict && sequence ? (
        <div role="status">
          <p>
            Your wording is retained. Read the current version before saving a
            replacement.
          </p>
          <button
            disabled={busy}
            onClick={() => {
              void jsonRequest<SequencePayload>(
                `/api/gmail-hub/sequences?id=${sequence.id}`,
              )
                .then((p) => {
                  accept(p);
                  saveIntent.current = null;
                  setConflict(false);
                  setStatus(
                    "Current state loaded; local wording retained for your next Save",
                  );
                })
                .catch((e) => setError(e.message));
            }}
          >
            Load current state, keep my wording
          </button>
        </div>
      ) : null}
      {pendingFile ? (
        <button
          disabled={busy}
          onClick={() => {
            const intent = uploadIntent.current;
            if (intent) void upload(intent.file, intent.which);
          }}
        >
          Check/retry same file upload
        </button>
      ) : null}
      {sequence?.pause ? (
        <p>
          Paused: {SEQUENCE_PAUSE_CAUSE_LABELS[sequence.pause.cause] ?? "Needs review"}.
          Review the linked history before resuming.
        </p>
      ) : null}
      {sequence?.pause?.changedInputs?.length ? (
        // S274 R-S274-6: what changed, with the value kept with the authorization.
        <ul aria-label="What changed" data-communication-field="pause-changed-inputs">
          {sequence.pause.changedInputs.map((change) => (
            <li key={change.key}>{changedInputLine(change)}</li>
          ))}
        </ul>
      ) : null}
      {sequence?.observation?.state === "unavailable" &&
      sequence.observation.reason === "lease_read_settling" ? (
        // S274 R-S274-4: a wait on a settling lease read, not a hold.
        <p>
          The lease was being re-read at the due time. Nothing was sent; the message is
          checked again on the next run.
        </p>
      ) : sequence?.observation?.state === "unavailable" ? (
        <p>Incoming evidence is unavailable. Saved wording and history are retained.</p>
      ) : null}
      {sequence?.unresolvedOccurrenceId ? (
        <p>An admitted send needs reconciliation. No second send will be attempted.</p>
      ) : null}
      {(["initial", "followUp"] as const).map((which) => {
        const m = draft[which];
        if (!m) return null;
        return (
          <section className="ui-stack" key={which}>
            <RichMessageEditor
              label={which === "initial" ? "Initial message" : "Follow-up message"}
              value={m}
              disabled={busy || terminal}
              onChange={(value) => change({ ...draft, [which]: value })}
            />
            <RefineWithAi
              request={
                draft.context.entityType === "renewal_lease"
                  ? {
                      surface: "renewal_message",
                      leaseId: draft.context.entityId,
                      channel:
                        draft.context.purpose === "renewal_owner" ? "owner" : "tenant",
                    }
                  : {
                      surface: "maintenance_owner_notice",
                      ticketRef: draft.context.entityId,
                    }
              }
              currentBody={m.paragraphs
                .map((p) => p.map((r) => r.text).join(""))
                .join("\n\n")}
              disabledReason={
                busy || terminal
                  ? "This message is not editable while an operation is pending or completed."
                  : null
              }
              appliedNotice="Revision applied to the message. Review its wording and formatting before copying it to a Gmail draft."
              onApply={(revision) =>
                change({
                  ...draft,
                  [which]: {
                    ...m,
                    paragraphs: revision.body.split(/\n\n/).map((text) => [{ text }]),
                  },
                })
              }
            />
            {sequence?.signatureSnapshots?.[which] && (
              <p className="muted">
                Prepared signature: {sequence.signatureSnapshots[which]!.email} · business
                profile v{sequence.signatureSnapshots[which]!.version}. Later profile
                changes leave this saved wording unchanged.
              </p>
            )}
            {businessProfile &&
            businessProfile.email.toLowerCase() === authenticatedEmail.toLowerCase() ? (
              <div className="panel">
                <p>
                  My current signature: {businessProfile.profile.name}
                  {businessProfile.profile.businessTitle
                    ? ` · ${businessProfile.profile.businessTitle}`
                    : ""}{" "}
                  (profile v{businessProfile.version})
                </p>
                <button
                  type="button"
                  disabled={
                    busy ||
                    terminal ||
                    (!!sequence &&
                      sequence.senderEmail.toLowerCase() !==
                        authenticatedEmail.toLowerCase())
                  }
                  onClick={() => {
                    change({
                      ...draft,
                      [which]: applyBusinessSignature(
                        m,
                        businessProfile,
                        authenticatedEmail,
                        sequence?.signatureSnapshots?.[which]?.text,
                      ),
                    });
                    setStatus(
                      "Your current business signature was added as an explicit draft edit. Review and remove any prior inline signature before copying it to a Gmail draft.",
                    );
                  }}
                >
                  Use my current business signature
                </button>
              </div>
            ) : (
              <p className="muted">
                No approved business profile is currently available for your managed
                sender. Existing wording is kept.
              </p>
            )}
            <div className="ui-row">
              <button type="button" onClick={() => void copy(m)}>
                Copy message
              </button>
              <label>
                Add PDF or image (5 MiB combined)
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  disabled={busy || terminal}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f, which);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <ul>
              {m.attachmentIds.map((id) => (
                <li key={id}>
                  <a
                    href={`/api/gmail-hub/sequence-attachments?id=${draft.id}&attachment=${id}`}
                  >
                    {attachments[id]?.filename ?? "Attached file"}
                  </a>{" "}
                  <button
                    disabled={busy || terminal}
                    onClick={() =>
                      change({
                        ...draft,
                        [which]: {
                          ...m,
                          attachmentIds: m.attachmentIds.filter((a) => a !== id),
                        },
                      })
                    }
                  >
                    Remove file
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {draft.context.replyTo ? (
        <p>
          This reply keeps the original subject and uses the currently verified workflow
          recipients. A teammate sends from their own managed mailbox; an original
          sender’s Gmail thread ID is never reused in another mailbox.
        </p>
      ) : null}
      {attachmentNotice ? <p role="status">{attachmentNotice}</p> : null}
      {!draft.followUp && !terminal ? (
        <button
          disabled={busy}
          onClick={() =>
            change({
              ...draft,
              followUp: {
                ...emptyFollowUp(),
                subject: draft.context.replyTo ? draft.initial.subject : "",
              },
            })
          }
        >
          Add follow-up message
        </button>
      ) : null}
      <p role="note">
        Review the recipients, message and attachments before Send or Schedule. Replies
        and failed delivery pause follow-ups; Resume requires a fresh review.
        {sequence?.authorization && !hasCurrentRenewalAuthorization(sequence)
          ? " This older authorization will not dispatch. Review it and choose Send or Schedule again."
          : ""}
      </p>
      <div className="ui-row">
        <button
          disabled={busy || terminal || !draftCanSave}
          onClick={() => void save().catch((e) => setError(e.message))}
        >
          {saveNeedsRetry ? "Retry same save" : "Save draft"}
        </button>
        <button disabled={initialBlocked} onClick={() => void run("send")}>
          Send
        </button>
        <button disabled={initialBlocked} onClick={() => setScheduleOpen((v) => !v)}>
          Schedule
        </button>
      </div>
      {scheduleOpen ? (
        <fieldset disabled={busy || terminal} className="ui-stack">
          <legend>Schedule this reviewed communication</legend>
          <div className="ui-row">
            <Field
              error={date ? undefined : "Choose a send date."}
              htmlFor={`${scheduleId}-date`}
              label="First date"
              required
            >
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field
              error={time ? undefined : "Choose a send time."}
              htmlFor={`${scheduleId}-time`}
              label="Local time"
              required
            >
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field
              error={zone.trim() ? undefined : "Enter the time zone."}
              htmlFor={`${scheduleId}-zone`}
              label="Timezone"
              required
            >
              <input value={zone} onChange={(e) => setZone(e.target.value)} />
            </Field>
            <label>
              Repeat every calendar days (optional)
              <input
                type="number"
                min="1"
                max="366"
                value={every}
                onChange={(e) => setEvery(e.target.value)}
              />
            </label>
            <label>
              Inclusive end date (optional)
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <label>
              Total send limit including initial (optional)
              <input
                type="number"
                min="1"
                max="1000"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </label>
          </div>
          <p>
            Follow-ups use this separate reviewed message. Human replies and failed
            delivery pause the sequence. Delayed work sends at most once; it does not
            catch up in a burst. A repeated hour uses its first occurrence; a skipped hour
            moves to the next valid minute.
          </p>
          {(() => {
            // S233: state the resolved first send in its zone, and any clock-change adjustment,
            // before "Schedule messages". An incomplete or invalid entry shows nothing here.
            if (!scheduleReady) return null;
            try {
              const first = resolveWallTime(date, time, zone);
              const note = describeWallTimeAdjustment(date, time, zone);
              return (
                <p data-communication-field="first-send">
                  First send: {formatZonedInstant(first.instantMs, zone)} ({zone}).
                  {note ? ` ${note}` : null}
                </p>
              );
            } catch {
              return null;
            }
          })()}
          {every && !followUpReady ? (
            <p role="status">
              A repeating schedule needs a complete follow-up message and verified
              attachments.
            </p>
          ) : null}
          <button
            type="button"
            disabled={!scheduleReady || initialBlocked || (!!every && !followUpReady)}
            onClick={() => void run("schedule")}
          >
            Schedule messages
          </button>
        </fieldset>
      ) : null}
      {sequence ? (
        <button
          disabled={busy}
          onClick={() => {
            void jsonRequest<SequencePayload>(
              `/api/gmail-hub/sequences?id=${sequence.id}`,
            )
              .then(accept)
              .catch((e) => setError(e.message));
          }}
        >
          Check recorded status
        </button>
      ) : null}
      {sequence && !terminal && sequence.state === "paused" && nowMs !== null ? (
        <p data-communication-field="resume-timing">
          {describeResumeTiming(sequence, nowMs)}
        </p>
      ) : null}
      {sequence && !terminal ? (
        <div className="ui-row">
          <button disabled={busy} onClick={() => void run("pause")}>
            Pause
          </button>
          <button disabled={busy} onClick={() => void run("cancel")}>
            Cancel future messages
          </button>
          {sequence.state === "paused" ? (
            <button
              disabled={initialBlocked || (resumeRepeats && !followUpReady)}
              onClick={() => void run("resume")}
            >
              Resume reviewed sequence
            </button>
          ) : null}
          {sequence.unresolvedOccurrenceId ? (
            <button disabled={busy} onClick={() => void run("reconcile")}>
              Check admitted send
            </button>
          ) : null}
          <button disabled={busy} onClick={() => void run("refresh")}>
            Refresh linked incoming
          </button>
          <button disabled={busy} onClick={() => void showStaff()}>
            Choose responsible sender
          </button>
        </div>
      ) : null}
      {/* S275 R-S275-1: a completed message still watched for its answer can be checked now. */}
      {sequence && terminal && replyWatchApplies(sequence) ? (
        <div className="ui-row">
          <button disabled={busy} onClick={() => void run("refresh")}>
            Refresh linked incoming
          </button>
        </div>
      ) : null}
      {staff.length ? (
        <div className="ui-row">
          <label htmlFor="communication-managed-sender">Managed staff sender</label>
          <select
            id="communication-managed-sender"
            value={transferUid}
            onChange={(e) => setTransferUid(e.target.value)}
          >
            <option value="">Choose staff member</option>
            {staff.map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.name} · {u.email}
              </option>
            ))}
          </select>
          <button disabled={busy || !transferUid} onClick={() => void run("transfer")}>
            Transfer responsibility
          </button>
          <p>
            A transfer preserves the history and pauses future messages. The new
            responsible staff member can review the saved wording.
          </p>
        </div>
      ) : null}
      {thread ? (
        <section className="ui-stack" aria-label="Linked incoming history">
          <h3>Linked conversation</h3>
          {thread.truncated ? (
            <p>
              Only part of this conversation is available. Read the full conversation in
              Gmail before preparing a response.
            </p>
          ) : null}
          {thread.messages.map((m) => (
            <article key={m.id} className="ui-card">
              <h4>{m.subject}</h4>
              <p>
                {m.from} · {m.date} ·{" "}
                {m.labelIds.includes("SENT")
                  ? "Sent"
                  : {
                      human: "Human response",
                      auto_reply: "Automatic response",
                      bounce: "Failed delivery",
                      uncertain: "Needs review",
                    }[
                      classifyIncomingMessage(m, [
                        ...(sequence?.authorization?.to ?? []),
                        ...(sequence?.authorization?.cc ?? []),
                      ])
                    ]}
              </p>
              <p className="communication-plain-body">{m.bodyText}</p>
              {sequence && threadMailbox && !thread.truncated && !m.bodyTruncated ? (
                <a
                  className="secondary-button"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`/gmail-hub?${new URLSearchParams({ compose: "reply", reply_from: sequence.id, reply_thread: thread.id, reply_sender: threadMailbox, reply_parent: m.id })}`}
                >
                  Reply in Communications
                </a>
              ) : null}
              {m.bodyTruncated ? (
                <p>
                  This message is truncated; it cannot establish current reply absence.
                </p>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
      {sequence &&
      (attempts.length || sequence.inbound?.length || attemptsUnavailable) ? (
        <section
          aria-label="Message evidence"
          data-communication-field="message-evidence"
        >
          <h3>What happened to each message</h3>
          <p>{communicationEvidenceHeading(sequence)}</p>
          {attemptsUnavailable ? (
            <p role="status" data-communication-field="attempts-unavailable">
              {attemptsUnavailable.lastReadAtMs === null
                ? "Message attempts could not be loaded just now, so none are listed. The recorded state above is current. Use Check recorded status to load them again."
                : `Message attempts could not be loaded just now. ${
                    attempts.length
                      ? "The attempts below are from the last successful check"
                      : "None were recorded at the last successful check"
                  }, ${formatZonedInstant(attemptsUnavailable.lastReadAtMs, sequence.authorization?.schedule?.timeZone ?? BUSINESS_TIME_ZONE)}, and ${
                    attempts.length
                      ? "they may not include the latest one"
                      : "a newer one may not be listed"
                  }. The recorded state above is current. Use Check recorded status to load them again.`}
            </p>
          ) : null}
          <ol>
            {describeCommunicationEvidence({
              sequence,
              occurrences: attempts,
              formatTimestamp: (atMs) =>
                formatZonedInstant(
                  atMs,
                  sequence.authorization?.schedule?.timeZone ?? BUSINESS_TIME_ZONE,
                ),
            }).map((entry) => (
              <li key={entry.key}>{entry.label}</li>
            ))}
          </ol>
          {attemptsTruncated ? <p>Only the first 200 attempts are listed.</p> : null}
        </section>
      ) : null}
      {sequence && (sequence.threads.length || sequence.linkedThreads.length) ? (
        <section aria-label="Linked send history">
          <h3>Linked history</h3>
          <ol>
            {[
              ...new Map(
                [
                  ...sequence.linkedThreads.map((t) => ({
                    ...t,
                    messageId: "linked",
                    sentAtMs: null as number | null,
                  })),
                  ...sequence.threads,
                ].map((t) => [`${t.senderEmail}:${t.threadId}`, t]),
              ).values(),
            ].map((t) => (
              <li key={`${t.senderEmail}:${t.messageId}`}>
                {t.sentAtMs === null
                  ? "Earlier linked thread"
                  : `Confirmed send ${formatZonedInstant(t.sentAtMs, sequence.authorization?.schedule?.timeZone ?? BUSINESS_TIME_ZONE)}`}{" "}
                · {t.senderEmail}{" "}
                <button
                  disabled={busy}
                  onClick={() => {
                    const read = ++threadGeneration.current;
                    void jsonRequest<{ thread: GmailThreadView }>(
                      `/api/gmail-hub/sequences/thread?id=${sequence.id}&thread=${encodeURIComponent(t.threadId)}&sender=${encodeURIComponent(t.senderEmail)}`,
                    )
                      .then((p) => {
                        if (active.current && read === threadGeneration.current) {
                          setThread(p.thread);
                          setThreadMailbox(t.senderEmail);
                        }
                      })
                      .catch((e) => setError(e.message));
                  }}
                >
                  Read linked thread
                </button>{" "}
                <a
                  href={
                    buildManagedGmailThreadDestination(t.senderEmail, t.threadId)?.href
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open exact thread in sender mailbox
                </a>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
}
