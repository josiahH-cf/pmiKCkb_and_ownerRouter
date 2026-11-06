"use client";

// S249 ARCH-S249-2 / R-S249-7 to R-S249-12: the lease's ONE message record on the Now card. The
// message editor (RenewalMessagePreparation) holds the record and gives this block its live
// content, so the preview, "Review and send", "Schedule", "Create Gmail draft instead", "Copy" and
// the Communications composer opened for the lease all carry the same revision.
//
// Send and Schedule are the existing staff-confirmed S189 to S192 contract, unchanged: the message
// is saved, the app's composition for the lease is read, the communication draft is saved, and the
// exact saved message is shown for review; the one confirmation then sends or schedules it with
// the saved draft's and the recipients' review hashes. Nothing here sends, schedules or creates a
// Gmail draft without that review and that confirmation.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button, ConfirmationDialog } from "@/components/ui";
import { formatBusinessTimestamp } from "@/lib/date-display";
import { renderEditableCommunicationBody } from "@/lib/gmail-hub/sequence-model";
import type {
  CommunicationSequence,
  RichCommunicationMessage,
} from "@/lib/gmail-hub/sequence-model";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import { BUSINESS_TIME_ZONE } from "@/lib/lease-renewal/business-calendar";
import { messageRevisionLabel } from "@/lib/lease-renewal/message-revision";
import type { RenewalPathStepId } from "@/lib/lease-renewal/renewal-path";
import {
  KICKOFF_WORDS,
  SEND_READINESS_KEYS,
  sendReady,
  withLiveKickoff,
  type RenewalPreparation,
} from "@/lib/lease-renewal/renewal-preparation";
import { workingRenewalTerms } from "@/lib/lease-renewal/working-record";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";
import { focusRenewalDashboardControl } from "./RenewalDashboardNavigation";
import { RentToRecommendField, StoredComparisonSummary } from "./RenewalKickoffFields";
import { nowSlotKey, useRenewalNowCard } from "./RenewalNowCardContext";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";

export interface PreparedSignatureFields {
  readonly name: string;
  readonly role: string;
  readonly phone: string;
}

/** What the message editor reads out; plain data, so it travels as one prop. */
export type PreparedMessageData = Omit<
  PreparedMessageApi,
  | "saveSignature"
  | "setReason"
  | "commitReason"
  | "flush"
  | "copy"
  | "openComposer"
  | "draft"
> & {
  readonly draft: Omit<
    PreparedMessageApi["draft"],
    "requestPreview" | "create" | "cancel"
  >;
};

/** The editor's own actions, each its own prop (they read the editor's save state when run). */
export interface PreparedMessageHandlers {
  readonly onSaveSignature: PreparedMessageApi["saveSignature"];
  readonly onReasonChange: PreparedMessageApi["setReason"];
  readonly onReasonCommit: PreparedMessageApi["commitReason"];
  readonly onFlush: PreparedMessageApi["flush"];
  readonly onCopy: PreparedMessageApi["copy"];
  readonly onOpenComposer: PreparedMessageApi["openComposer"];
  readonly onDraftPreview: PreparedMessageApi["draft"]["requestPreview"];
  readonly onDraftCreate: PreparedMessageApi["draft"]["create"];
}

export interface PreparedMessageApi {
  readonly channel: "owner" | "tenant";
  readonly leaseId: string;
  readonly canEdit: boolean;
  readonly subject: string;
  readonly plainText: string;
  readonly htmlBody: string;
  readonly revision: string;
  readonly to: string | null;
  readonly cc: readonly string[];
  readonly recipientReasons: readonly string[];
  readonly senderEmail: string;
  readonly templateApproved: boolean;
  /** When the message record was last saved. */
  readonly lastEditedAt: string | null;
  /** The marked values the message still carries, in its own words. */
  readonly marked: readonly string[];
  readonly signaturePresent: boolean;
  /** Fill and save the sender's own signature on this message (it is kept for the sender). */
  readonly saveSignature: (fields: PreparedSignatureFields) => string | null;
  readonly reason: string;
  readonly setReason: (value: string) => void;
  readonly commitReason: () => void;
  /** Save what is on screen and resolve true once the saved message reads back the same. */
  readonly flush: () => Promise<boolean>;
  readonly copy: () => Promise<void>;
  readonly composerHref: string;
  readonly openComposer: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  readonly draft: {
    readonly available: boolean;
    readonly pending: boolean;
    /** The revision a created Gmail draft carries; null when none was created from this record. */
    readonly createdRevision: string | null;
    readonly preview: {
      readonly subject: string;
      readonly body: string;
      readonly to: string;
    } | null;
    readonly requestPreview: () => Promise<void>;
    readonly create: () => Promise<void>;
    readonly cancel: () => void;
  };
  readonly notice: string;
}

const STEP_FOR_CHANNEL: Record<"owner" | "tenant", RenewalPathStepId> = {
  owner: "ask-owner",
  tenant: "offer-tenant",
};

interface ReviewState {
  readonly mode: "send" | "schedule";
  readonly sequence: CommunicationSequence;
  readonly reviewedDraftHash: string;
  readonly reviewedTargetHash: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly subject: string;
  readonly body: string;
}

async function json<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetchWithDeadline(
    url,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok)
    throw Object.assign(new Error(payload.error ?? "This was not completed."), {
      status: response.status,
    });
  return payload;
}

function tomorrowIso(): string {
  return new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
  });
}

export function PreparedMessageSlot({
  data,
  onSaveSignature,
  onReasonChange,
  onReasonCommit,
  onFlush,
  onCopy,
  onOpenComposer,
  onDraftPreview,
  onDraftCreate,
}: Readonly<{ data: PreparedMessageData } & PreparedMessageHandlers>) {
  const nowCard = useRenewalNowCard();
  const step = STEP_FOR_CHANNEL[data.channel];
  const api: PreparedMessageApi = {
    ...data,
    saveSignature: onSaveSignature,
    setReason: onReasonChange,
    commitReason: onReasonCommit,
    flush: onFlush,
    copy: onCopy,
    openComposer: onOpenComposer,
    draft: {
      ...data.draft,
      requestPreview: onDraftPreview,
      create: onDraftCreate,
      cancel: () => undefined,
    },
  };
  const preview = nowCard?.slots[nowSlotKey(step, "message-preview")] ?? null;
  const actions = nowCard?.slots[nowSlotKey(step, "review-and-send")] ?? null;
  // Only a shown Now card step that sends this audience's message takes the block.
  if (!nowCard || !preview) return null;
  return (
    <PreparedMessageBlock
      actionsSlot={actions}
      api={api}
      preparation={nowCard?.preparation ?? null}
      previewSlot={preview}
      setPrimary={nowCard?.setPrimary ?? null}
      step={step}
    />
  );
}

function PreparedMessageBlock({
  api,
  preparation,
  previewSlot,
  actionsSlot,
  setPrimary,
  step,
}: Readonly<{
  api: PreparedMessageApi;
  preparation: RenewalPreparation | null;
  previewSlot: HTMLElement | null;
  actionsSlot: HTMLElement | null;
  setPrimary: NonNullable<ReturnType<typeof useRenewalNowCard>>["setPrimary"] | null;
  step: RenewalPathStepId;
}>) {
  const router = useRouter();
  const working = useRenewalWorkingRecord();
  const base = useId();
  const [review, setReview] = useState<ReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scheduleDate, setScheduleDate] = useState(tomorrowIso);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [draftOpen, setDraftOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signature, setSignature] = useState<PreparedSignatureFields>({
    name: "",
    role: "",
    phone: "",
  });
  const [signatureNotice, setSignatureNotice] = useState("");
  const sequenceRef = useRef<{ id: string; version: number } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const typedRent = workingRenewalTerms(working?.record ?? null).rent;
  const live = useMemo(
    () =>
      preparation && api.channel === "owner"
        ? withLiveKickoff(preparation, {
            signature: api.signaturePresent,
            typedRent,
            recipientReady: api.to !== null,
            templateApproved: api.templateApproved,
            marked: api.marked,
          })
        : null,
    [
      preparation,
      api.channel,
      api.signaturePresent,
      typedRent,
      api.to,
      api.templateApproved,
      api.marked,
    ],
  );
  // The items Send needs. For the owner they come from the one projection; for the tenant offer
  // they are the same four read from its own message.
  const needs = live
    ? live.items.filter((item) => SEND_READINESS_KEYS.includes(item.key))
    : [
        {
          key: "recipient" as const,
          label: "Verified tenant recipient",
          ready: api.to !== null,
          missing: api.to !== null ? null : "a verified tenant recipient",
          fix: null,
        },
        {
          key: "signature" as const,
          label: "Your signature",
          ready: api.signaturePresent,
          missing: api.signaturePresent ? null : "your signature",
          fix: null,
        },
        {
          key: "template" as const,
          label: "Approved template",
          ready: api.templateApproved,
          missing: api.templateApproved ? null : "an approved tenant template",
          fix: null,
        },
        {
          key: "marked_values" as const,
          label: "Complete marked values",
          ready: api.marked.length === 0,
          missing: api.marked.length === 0 ? null : api.marked.join(", "),
          fix: null,
        },
      ];
  const ready = live ? sendReady(live) : needs.every((item) => item.ready);
  const missingWords = needs.filter((item) => !item.ready && item.missing);
  const staleDraft =
    api.draft.createdRevision !== null && api.draft.createdRevision !== api.revision;

  /** Save the message, read the lease composition and save the communication draft for review. */
  const prepareReview = async (mode: "send" | "schedule") => {
    setBusy(true);
    setMessage("");
    try {
      if (!(await api.flush())) {
        setMessage(
          "Your latest wording could not be saved, so nothing was prepared for review. Your words are kept; correct or retry the save.",
        );
        return;
      }
      const composition = await json<{
        context: WorkflowCommunicationContext;
        initial: RichCommunicationMessage;
        target: { to: string[]; cc: string[]; blockers?: string[] };
        reviewedTargetHash: string;
      }>(
        `/api/gmail-hub/composition?purpose=${api.channel === "owner" ? "renewal_owner" : "renewal_tenant"}&lease=${encodeURIComponent(api.leaseId)}`,
      );
      if (composition.target.blockers?.length) {
        setMessage(
          `This message cannot be sent yet: ${composition.target.blockers.join(" ")}`,
        );
        return;
      }
      const save = async (prior: { id: string; version: number } | null) =>
        json<{ sequence: CommunicationSequence; reviewedDraftHash: string }>(
          "/api/gmail-hub/sequences",
          {
            action: "save",
            draft: {
              id: prior?.id ?? crypto.randomUUID(),
              context: composition.context,
              initial: composition.initial,
              followUp: null,
            },
            expectedVersion: prior?.version ?? 0,
            operationId: crypto.randomUUID(),
          },
        );
      let saved;
      try {
        saved = await save(sequenceRef.current);
      } catch {
        // A communication already sent, scheduled or changed elsewhere starts a new one.
        sequenceRef.current = null;
        saved = await save(null);
      }
      sequenceRef.current = { id: saved.sequence.id, version: saved.sequence.version };
      const rendered = renderEditableCommunicationBody(saved.sequence.initial.paragraphs);
      setReview({
        mode,
        sequence: saved.sequence,
        reviewedDraftHash: saved.reviewedDraftHash,
        reviewedTargetHash: composition.reviewedTargetHash,
        to: composition.target.to,
        cc: composition.target.cc,
        subject: saved.sequence.initial.subject,
        body: rendered.plainText,
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The review could not be prepared. Nothing was sent.",
      );
    } finally {
      setBusy(false);
    }
  };

  async function confirm() {
    if (!review) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await json<{ sequence: CommunicationSequence }>(
        "/api/gmail-hub/sequences",
        {
          action: review.mode,
          id: review.sequence.id,
          expectedVersion: review.sequence.version,
          operationId: crypto.randomUUID(),
          reviewedDraftHash: review.reviewedDraftHash,
          reviewedTargetHash: review.reviewedTargetHash,
          schedule:
            review.mode === "schedule"
              ? {
                  firstDate: scheduleDate,
                  time: scheduleTime,
                  timeZone: BUSINESS_TIME_ZONE,
                  everyDays: null,
                  endDate: null,
                  sendLimit: 1,
                }
              : null,
        },
      );
      sequenceRef.current = null;
      setReview(null);
      const accepted = (result.sequence.threads ?? []).length > 0;
      setMessage(
        review.mode === "schedule"
          ? `Scheduled for ${scheduleDate} at ${scheduleTime} Central. It counts as sent once Gmail accepts it.`
          : accepted
            ? "Sent. Gmail accepted the message; the lease now waits on the reply."
            : "The send is recorded, and Gmail has not confirmed it yet. The lease says what happens next.",
      );
      // R-S249-5: a prefilled figure becomes the staff reviewed recommendation once it is sent.
      if (
        api.channel === "owner" &&
        accepted &&
        live &&
        live.rent.origin !== "typed" &&
        live.rent.value !== null &&
        working?.canEdit
      )
        await working
          .save("terms_rent", live.rent.value, {
            origin: "adopted_source",
            sourceLabel:
              live.rent.origin === "agreement"
                ? "Standing agreement"
                : "Comparable-rent recommendation",
            context:
              `Sent in the owner message, revision ${api.revision}. ${live.rent.basis}`.slice(
                0,
                1000,
              ),
          })
          .catch(() => false);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `${error.message} Check the lease before trying again; nothing is sent twice.`
          : "The response did not arrive. Check the lease before trying again; nothing is sent twice.",
      );
    } finally {
      setBusy(false);
    }
  }

  // R-S249-8: "Review and send" is the Now card's primary action while the step asks for its send.
  const runReview = () => {
    if (!ready) {
      const first = needs.find((item) => !item.ready);
      if (first?.key === "signature") setSignatureOpen(true);
      else if (first?.fix) focusRenewalDashboardControl(first.fix.target);
      return;
    }
    void prepareReview("send");
  };
  const reason = ready
    ? null
    : `Before sending, add ${missingWords.map((item) => item.missing).join(", ")}.`;
  // The Now card holds one stable action; it always runs the latest review step.
  const latestRun = useRef(runReview);
  useEffect(() => {
    latestRun.current = runReview;
  });
  const stableRun = useCallback(() => latestRun.current(), []);
  useEffect(() => {
    if (!setPrimary) return;
    setPrimary(step, {
      label: KICKOFF_WORDS.reviewAndSend,
      run: stableRun,
      busy,
      disabled: busy || !api.canEdit,
      reason,
    });
  }, [setPrimary, step, stableRun, busy, api.canEdit, reason]);
  useEffect(
    () => (setPrimary ? () => setPrimary(step, null) : undefined),
    [setPrimary, step],
  );

  if (!previewSlot) return null;
  const previewBlock = (
    <section
      aria-label={api.channel === "owner" ? "Owner message" : "Tenant offer"}
      className="ui-stack-tight renewal-now-message"
      data-renewal-message-revision={api.revision}
    >
      {api.channel === "owner" && live ? (
        <>
          <StoredComparisonSummary preparation={live} />
          <RentToRecommendField preparation={live} />
          <div className="ui-stack-tight">
            <label htmlFor={`${base}-reason`}>{KICKOFF_WORDS.reasonToInclude}</label>
            <input
              disabled={!api.canEdit}
              id={`${base}-reason`}
              maxLength={300}
              onBlur={api.commitReason}
              onChange={(event) => api.setReason(event.target.value)}
              placeholder="For example: current market conditions"
              value={api.reason}
            />
            <p className="muted">
              Placed in the message beside the rent, exactly as typed.
            </p>
          </div>
        </>
      ) : null}
      <ul aria-label="What sending needs" className="renewal-now-readiness">
        {needs.map((item) => (
          <li data-renewal-ready={item.ready ? "ready" : "missing"} key={item.key}>
            {item.label}: {item.ready ? "Ready" : `Missing ${item.missing ?? ""}`}
            {!item.ready && item.key === "signature" ? (
              <>
                {" "}
                <button
                  className="text-link"
                  id="renewal-now-signature"
                  onClick={() => setSignatureOpen(true)}
                  type="button"
                >
                  Set up your signature
                </button>
              </>
            ) : !item.ready && item.fix ? (
              <>
                {" "}
                <button
                  className="text-link"
                  onClick={() => focusRenewalDashboardControl(item.fix!.target)}
                  type="button"
                >
                  {item.fix.label}
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {signatureOpen ? (
        // R-S249-11 / L45: a staff member with no signature sets one up here, on the lease.
        <form
          aria-label="Your signature"
          className="ui-stack-tight renewal-now-signature-form"
          onSubmit={(event) => {
            event.preventDefault();
            const refusal = api.saveSignature(signature);
            if (refusal) setSignatureNotice(refusal);
            else {
              setSignatureNotice(
                "Your signature is on this message. It saves with the message and is kept for your next lease.",
              );
              setSignatureOpen(false);
            }
          }}
        >
          {(
            [
              ["name", "Sender name"],
              ["role", "Approved role / organization (optional)"],
              ["phone", "Verified phone (optional)"],
            ] as const
          ).map(([field, label]) => (
            <div className="ui-stack-tight" key={field}>
              <label htmlFor={`${base}-sig-${field}`}>{label}</label>
              <input
                id={`${base}-sig-${field}`}
                onChange={(event) =>
                  setSignature((previous) => ({
                    ...previous,
                    [field]: event.target.value,
                  }))
                }
                value={signature[field]}
              />
            </div>
          ))}
          <div className="ui-row">
            <Button size="compact" type="submit">
              Save my signature
            </Button>
            <Button
              onClick={() => setSignatureOpen(false)}
              size="compact"
              variant="tertiary"
            >
              Not now
            </Button>
          </div>
        </form>
      ) : null}
      {signatureNotice ? (
        <p data-renewal-field="signature-notice" role="status">
          {signatureNotice}
        </p>
      ) : null}
      <div className="renewal-now-preview" data-renewal-field="message-preview">
        <p>
          <strong>To:</strong>{" "}
          {api.to ?? `No verified recipient yet. ${api.recipientReasons.join(" ")}`}
          {api.cc.length ? (
            <>
              {" "}
              <strong>Cc:</strong> {api.cc.join(", ")}
            </>
          ) : null}
        </p>
        <p>
          <strong>Subject:</strong> {api.subject}
        </p>
        <div
          aria-label="Message preview"
          className="renewal-message-preview"
          dangerouslySetInnerHTML={{ __html: api.htmlBody }}
          role="document"
        />
        <p className="muted" data-renewal-field="message-revision">
          Message revision {messageRevisionLabel(api.revision)}.{" "}
          {api.lastEditedAt
            ? `Last edited ${formatBusinessTimestamp(api.lastEditedAt)}.`
            : "Not edited yet; prepared from the lease facts."}
        </p>
      </div>
      {staleDraft ? (
        // R-S249-9: a Gmail draft never goes stale silently.
        <p className="renewal-notice" data-renewal-field="draft-older" role="note">
          {KICKOFF_WORDS.draftOlder} (draft revision{" "}
          {messageRevisionLabel(api.draft.createdRevision!)}, message revision{" "}
          {messageRevisionLabel(api.revision)}).{" "}
          <Button
            disabled={!api.draft.available || api.draft.pending}
            onClick={() => {
              setDraftOpen(true);
              void api.draft.requestPreview();
            }}
            size="compact"
            variant="secondary"
          >
            {KICKOFF_WORDS.replaceDraft}
          </Button>
        </p>
      ) : api.draft.createdRevision ? (
        <p className="muted" data-renewal-field="draft-current">
          The unsent Gmail draft carries this message revision.
        </p>
      ) : null}
      {message || api.notice ? <p role="status">{message || api.notice}</p> : null}
    </section>
  );
  const actionsBlock = (
    <div className="ui-row renewal-now-delivery">
      <Button
        disabled={busy || !api.canEdit || !ready}
        onClick={(event) => {
          trigger.current = event.currentTarget;
          void prepareReview("schedule");
        }}
        size="compact"
        variant="secondary"
      >
        {KICKOFF_WORDS.schedule}
      </Button>
      <Button
        disabled={!api.draft.available || api.draft.pending || busy}
        onClick={(event) => {
          trigger.current = event.currentTarget;
          setDraftOpen(true);
          void api.draft.requestPreview();
        }}
        size="compact"
        variant="secondary"
      >
        {KICKOFF_WORDS.createGmailDraft}
      </Button>
      <Button onClick={() => void api.copy()} size="compact" variant="secondary">
        {KICKOFF_WORDS.copy}
      </Button>
      <a
        className="text-link"
        data-renewal-field="composer-link"
        href={api.composerHref}
        // The composer opens with the saved message record; what is on screen is saved first.
        onClick={api.openComposer}
        rel="noopener noreferrer"
        target="_blank"
      >
        Open in Communications
      </a>
    </div>
  );
  return (
    <>
      {createPortal(previewBlock, previewSlot)}
      {actionsSlot ? createPortal(actionsBlock, actionsSlot) : null}
      <ConfirmationDialog
        busy={busy}
        busyLabel={review?.mode === "schedule" ? "Scheduling…" : "Sending…"}
        confirmDisabled={!review}
        confirmLabel={
          review?.mode === "schedule" ? "Schedule this message" : "Send this message"
        }
        description="Review the exact message, recipients and sender. Confirming is the one step that sends or schedules it."
        error={review && message ? message : undefined}
        onCancel={() => setReview(null)}
        onConfirm={() => void confirm()}
        open={review !== null}
        title={review?.mode === "schedule" ? "Review and schedule" : "Review and send"}
        triggerRef={trigger}
      >
        {review ? (
          <div className="ui-stack-tight" data-renewal-field="exact-review">
            <p>
              From {review.sequence.senderEmail} · To {review.to.join(", ")}
              {review.cc.length ? ` · Cc ${review.cc.join(", ")}` : ""}
            </p>
            <p>
              <strong>{review.subject}</strong>
            </p>
            <div className="draft-box">{review.body}</div>
            {review.mode === "schedule" ? (
              <div className="ui-row">
                <label>
                  Date
                  <input
                    onChange={(event) => setScheduleDate(event.target.value)}
                    type="date"
                    value={scheduleDate}
                  />
                </label>
                <label>
                  Time (Central)
                  <input
                    onChange={(event) => setScheduleTime(event.target.value)}
                    type="time"
                    value={scheduleTime}
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}
      </ConfirmationDialog>
      <ConfirmationDialog
        busy={api.draft.pending}
        busyLabel="Working…"
        confirmDisabled={!api.draft.preview}
        confirmLabel="Create this unsent draft"
        description="Review the exact unsent draft. Confirming creates it in the displayed managed mailbox. Nothing is sent; a person sends it from Gmail."
        onCancel={() => {
          setDraftOpen(false);
          api.draft.cancel();
        }}
        onConfirm={() => {
          void api.draft.create().then(() => setDraftOpen(false));
        }}
        open={draftOpen}
        title={staleDraft ? KICKOFF_WORDS.replaceDraft : KICKOFF_WORDS.createGmailDraft}
        triggerRef={trigger}
      >
        {api.draft.preview ? (
          <div className="ui-stack-tight" data-renewal-field="draft-review">
            <p>
              From {api.senderEmail} · To {api.draft.preview.to}
            </p>
            <p>
              <strong>{api.draft.preview.subject}</strong>
            </p>
            <div className="draft-box">{api.draft.preview.body}</div>
            {staleDraft ? (
              <p role="note">
                The earlier draft stays in Gmail until you delete it there; send only this
                one.
              </p>
            ) : null}
          </div>
        ) : (
          <p role="status">{api.notice || "Preparing the exact draft for review…"}</p>
        )}
      </ConfirmationDialog>
    </>
  );
}
