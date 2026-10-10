"use client";
import { buildManagedGmailThreadDestination } from "@/lib/lease-renewal/desk-destinations";
import { applyBusinessSignature } from "@/lib/gmail-hub/business-signature";
import type { StaffBusinessProfile } from "@/lib/staff/business-profile";
import { describeSequenceState } from "@/lib/gmail-hub/communication-state";
import { classifyIncomingMessage } from "@/lib/gmail-hub/inbound-classification";
import type { GmailThreadView } from "@/lib/gmail-runtime/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { RichMessageEditor } from "./RichMessageEditor";
import { RefineWithAi } from "@/components/email/RefineWithAi";
import {
  RichCommunicationMessageSchema,
  renderEditableCommunicationBody,
  type CommunicationAttachment,
  type CommunicationSequence,
  type RichCommunicationMessage,
  type SequenceDraft,
} from "@/lib/gmail-hub/sequence-model";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import type { CommunicationSchedule } from "@/lib/gmail-hub/schedule-calendar";
import { workflowEntityHref } from "@/lib/gmail-hub/workflow-context";

interface SequencePayload {
  sequence: CommunicationSequence;
  reviewedDraftHash: string;
  notice?: string;
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
  target: { label: string; to: string[]; cc: string[]; blockers?: string[] };
  attachmentNotice: string | null;
  reviewedTargetHash: string;
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
  const payload = await response.json();
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
  const [thread, setThread] = useState<GmailThreadView | null>(null);
  const [threadMailbox, setThreadMailbox] = useState<string | null>(null);
  const threadGeneration = useRef(0);
  const [saveTick, setSaveTick] = useState(0),
    [conflict, setConflict] = useState(false),
    [pendingFile, setPendingFile] = useState(false);
  const uploadIntent = useRef<{
    id: string;
    file: File;
    which: "initial" | "followUp";
  } | null>(null);
  const [draft, setDraft] = useState<SequenceDraft | null>(null),
    [sequence, setSequence] = useState<CommunicationSequence | null>(null);
  const [reviewedTargetHash, setReviewedTargetHash] = useState("");
  const [target, setTarget] = useState<Composition["target"] | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Loading communication…"),
    [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<Record<string, CommunicationAttachment>>(
      {},
    ),
    [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false),
    [date, setDate] = useState(""),
    [time, setTime] = useState(""),
    [zone, setZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    [every, setEvery] = useState(""),
    [end, setEnd] = useState(""),
    [limit, setLimit] = useState("");
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
  const lastResponse = useRef<SequencePayload | null>(null),
    saveFlight = useRef<Promise<SequencePayload> | null>(null),
    locked = useRef(false),
    active = useRef(true);
  const entryKey = JSON.stringify(entry);
  const accept = useCallback((p: SequencePayload) => {
    lastResponse.current = p;
    version.current = p.sequence.version;
    hash.current = p.reviewedDraftHash;
    setSequence(p.sequence);
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
    void (async () => {
      try {
        let next: SequenceDraft;
        if ("id" in entry) {
          const p = await jsonRequest<SequencePayload>(
            `/api/gmail-hub/sequences?id=${encodeURIComponent(entry.id)}`,
          );
          if (!active.current) return;
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
              if (active.current)
                setAttachments((old) => ({ ...old, [id]: r.attachment }));
            }),
          ).catch(() => {
            if (active.current)
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
          void jsonRequest<Composition>(`/api/gmail-hub/composition?${q}`)
            .then((r) => {
              if (active.current) {
                setTarget(r.target);
                setReviewedTargetHash(r.reviewedTargetHash);
                setAttachmentNotice(r.attachmentNotice);
              }
            })
            .catch(() => {
              if (active.current)
                setAttachmentNotice(
                  "Current recipients are unavailable. Drafting and history stay available; Send/Schedule waits for a fresh source read.",
                );
            });
        } else {
          const q = new URLSearchParams(entry as Record<string, string>);
          const p = await jsonRequest<Composition>(`/api/gmail-hub/composition?${q}`);
          if (!active.current) return;
          next = {
            id: crypto.randomUUID(),
            context: p.context,
            initial: p.initial,
            followUp: null,
          };
          setTarget(p.target);
          setReviewedTargetHash(p.reviewedTargetHash);
          setAttachmentNotice(p.attachmentNotice);
          setStatus("Saving draft…");
        }
        currentDraft.current = next;
        setDraft(next);
      } catch (e) {
        if (active.current) {
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
  }, [entryKey, accept]);
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
      JSON.stringify(draft) === savedJson.current ||
      saveIntent.current
    )
      return;
    const parsed = RichCommunicationMessageSchema.safeParse(draft.initial);
    if (
      !parsed.success ||
      (draft.followUp &&
        !RichCommunicationMessageSchema.safeParse(draft.followUp).success)
    ) {
      return;
    }
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
    if (locked.current || !currentDraft.current) return;
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
      setPendingFile(true);
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
      setPendingFile(false);
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
      const r = renderEditableCommunicationBody(message.paragraphs);
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
        <button onClick={onClose}>Close</button>
      </section>
    );
  const terminal = !!sequence && ["completed", "cancelled"].includes(sequence.state),
    canAuthorize = !sequence || sequence.senderEmail === authenticatedEmail.toLowerCase();
  const recipientTo = target?.to ?? sequence?.authorization?.to ?? [],
    recipientCc = target?.cc ?? sequence?.authorization?.cc ?? [];
  const blocks = target?.blockers ?? [];
  const draftIncomplete =
    !RichCommunicationMessageSchema.safeParse(draft.initial).success ||
    !!(
      draft.followUp && !RichCommunicationMessageSchema.safeParse(draft.followUp).success
    );
  const filesUnverified = [
    ...draft.initial.attachmentIds,
    ...(draft.followUp?.attachmentIds ?? []),
  ].some((id) => !attachments[id]);
  return (
    <section
      className="ui-card ui-stack communication-composer"
      aria-label="Workflow communication composer"
    >
      <div className="ui-row">
        <h2>
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
      <p>
        Responsible sender: <strong>{sequence?.senderEmail ?? authenticatedEmail}</strong>
      </p>
      <p>
        To: {recipientTo.join(", ") || "Current verified recipient waits for source read"}
        {recipientCc.length ? ` · Cc: ${recipientCc.join(", ")}` : ""}
      </p>
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
        {draftIncomplete ? "Finish the subject and message to save" : status}
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
          Paused: {sequence.pause.cause.replaceAll("_", " ")}. Review the linked history
          before resuming.
        </p>
      ) : null}
      {sequence?.observation?.state === "unavailable" ? (
        <p>Incoming evidence is unavailable. Sending waits for a complete check.</p>
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
              appliedNotice="Revision applied to the message. Review its wording and formatting before Send or Schedule."
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
                      "Your current business signature was added as an explicit draft edit. Review and remove any prior inline signature before Send or Schedule.",
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
      <div className="ui-row">
        <button
          disabled={busy || terminal}
          onClick={() => void save().catch((e) => setError(e.message))}
        >
          {saveNeedsRetry ? "Retry same save" : "Save draft"}
        </button>
        <button
          disabled={
            busy ||
            terminal ||
            !canAuthorize ||
            filesUnverified ||
            !reviewedTargetHash ||
            !!sequence?.unresolvedOccurrenceId ||
            !!blocks.length
          }
          onClick={() => void run("send")}
        >
          Send
        </button>
        <button
          disabled={
            busy ||
            terminal ||
            !canAuthorize ||
            filesUnverified ||
            !reviewedTargetHash ||
            !!sequence?.unresolvedOccurrenceId
          }
          onClick={() => setScheduleOpen(!scheduleOpen)}
        >
          Schedule
        </button>
      </div>
      {scheduleOpen ? (
        <fieldset disabled={busy || terminal} className="ui-stack">
          <legend>Schedule this reviewed communication</legend>
          <div className="ui-row">
            <label>
              First date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              Local time
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <label>
              Timezone
              <input value={zone} onChange={(e) => setZone(e.target.value)} />
            </label>
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
            catch up in a burst.
          </p>
          <button
            type="button"
            disabled={
              !canAuthorize || filesUnverified || !reviewedTargetHash || !!blocks.length
            }
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
              disabled={
                busy ||
                !canAuthorize ||
                filesUnverified ||
                !reviewedTargetHash ||
                !!sequence.unresolvedOccurrenceId
              }
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
            A transfer pauses future messages. The new sender reviews and authorizes the
            next operation.
          </p>
        </div>
      ) : null}
      {thread ? (
        <section className="ui-stack" aria-label="Linked incoming history">
          <h3>Linked conversation</h3>
          {thread.truncated ? (
            <p>
              Only part of this conversation is available. Dispatch waits for a complete
              read.
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
                  : `Confirmed send ${new Date(t.sentAtMs).toLocaleString()}`}{" "}
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
