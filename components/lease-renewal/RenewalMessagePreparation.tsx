"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { boundedLocalWait, LocalWaitError } from "@/lib/ui/local-lifetime";
import { formatBusinessTimestamp, formatSourceCalendarDate } from "@/lib/date-display";

import { renewalCardTitle } from "@/components/lease-renewal/RenewalSectionHeading";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
  type ExternalDeskDestination,
} from "@/lib/lease-renewal/desk-destinations";
import { Button, Card, Field } from "@/components/ui";
import {
  AUTOSAVE_IDLE,
  AutosaveStatus,
  type AutosaveState,
} from "@/components/lease-renewal/AutosaveStatus";
import { useRenewalManualWorkspace } from "@/components/lease-renewal/RenewalManualWorkspace";
import { useRenewalWorkingRecord } from "@/components/lease-renewal/RenewalWorkingRecord";
import { useRenewalPolicy } from "@/components/lease-renewal/RenewalPolicyContext";
import {
  policyMessageGates,
  projectPolicyApplicability,
} from "@/lib/lease-renewal/policy-content";
import {
  PREFLIGHT_STATE_LABELS,
  projectMessagePreflight,
} from "@/lib/lease-renewal/message-preflight";
import { focusRenewalDashboardControl } from "@/components/lease-renewal/RenewalDashboardNavigation";
import {
  composeRenewalMessage,
  MESSAGE_CHARGES,
  MessageChargeSchema,
  RenewalMessageEditsSchema,
  responseRequestParagraph,
  type MessageCharge,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import {
  MESSAGE_CONTROL_IDS,
  projectMessageReadiness,
  type MessageMissingInput,
} from "@/lib/lease-renewal/message-readiness";
import {
  emptyMessagePreparationInputs,
  MessagePreparationInputsSchema,
  type MessagePreparationInputs,
  type MessagePreparationRecord,
} from "@/lib/lease-renewal/renewal-message-preparation";
import {
  RenewalNoticeDraftOutcomeSchema,
  type RenewalNoticeDraftOutcome,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";
import { formatRecipientsForCopy } from "@/lib/lease-renewal/recipient-resolution";
import { RefineWithAi } from "@/components/email/RefineWithAi";
import { GEMINI_IN_GMAIL_HINT } from "@/lib/email-refinement/hint";
import {
  AuthoredSubjectSchema,
  RefinedBodySchema,
  STALE_REFINED_BODY_MESSAGE,
  UNREADABLE_REFINED_BODY_MESSAGE,
  applyAuthoredSubject,
  applyRefinedBody,
  type RefinedBody,
  type RefinedBodyState,
} from "@/lib/lease-renewal/refined-message";

interface ChargeInventoryLine {
  id: string;
  label: string;
  amount: number;
  frequency: number;
  startDate: string | null;
  current: boolean | null;
  sourceRef: string;
}

interface Preparation {
  /** S116: the complete same-audience recipient set, or the refusal a person resolves at the source. */
  recipients?:
    | { status: "ready"; to: string; cc: string[] }
    | { status: "blocked"; reasons: string[] };
  destinations?: {
    gmailDrafts: ExternalDeskDestination | null;
    lease: ExternalDeskDestination | null;
    messages: ExternalDeskDestination | null;
    owners: Array<{
      name: string;
      record: ExternalDeskDestination;
      messages: ExternalDeskDestination;
    }>;
  };
  previousDraftAttempts?: Array<{
    executionId: string;
    cycleId: string;
    state: string;
    recoveryAvailable: boolean;
  }>;
  availableCompScreenshot?: {
    receiptId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  } | null;
  draftAttempt: {
    executionId: string;
    state: string;
    recoveryAvailable: boolean;
    outcome: RenewalNoticeDraftOutcome | null;
  } | null;
  senderEmail: string;
  /** The work record this message is stored under; null until its first save establishes one. */
  cycleId: string | null;
  saved: MessagePreparationRecord | null;
  inputs: MessagePreparationInputs;
  facts: RenewalMessageFacts;
  /** The server's own callout for the saved message; a more specific wording is carried over. */
  content?: { missing?: Array<{ field: string; message: string }> };
  sourceFingerprint: string;
  signatureMatchesActor: boolean;
  /** S120: where the current signature came from. */
  signatureOrigin?:
    | { kind: "none" }
    | { kind: "saved" }
    | { kind: "retained_sender"; recordedAt: string };
  /** S120: the signed-in sender's own retained signature, if any. */
  retainedSignature?: MessagePreparationInputs["signature"] | null;
  /** S120: current non-rent recurring charges a person may deliberately fill a charge from. */
  chargeInventory?: ChargeInventoryLine[] | null;
  publication: { status: string; ref?: string; reason?: string };
  /** S139/S161: the saved authored body and whether the facts changed after it was written. */
  bodyOverride?: RefinedBodyState | null;
  /** Hash of the body composed from the current facts; authored wording records it. */
  bodyBaseHash?: string;
  /** S161: the saved authored subject, or null for the composed subject. */
  subjectOverride?: string | null;
  notices: string[];
  /** S129/S161: policy notes for this audience, listed as information. */
  policyGates?: Array<{ field: string; message: string }>;
}

export function RenewalMessagePreparation({
  channel,
  canEdit,
}: {
  channel: "owner" | "tenant";
  canEdit: boolean;
}) {
  const context = useRenewalManualWorkspace();
  const working = useRenewalWorkingRecord();
  // S154: no cycle step precedes a message. The editor is the same one before and after the
  // lease's work record exists, so nothing typed is lost when the first save establishes it.
  return context ? (
    <MessagePreparationEditor
      key={`${context.leaseId}:${channel}`}
      leaseId={context.leaseId}
      refreshBasis={`${context.state?.cycleId}:${context.state?.revision}:${context.state?.termsRevision}:${context.state?.preparation?.revision}:${working?.record?.revision ?? 0}`}
      channel={channel}
      canEdit={canEdit}
    />
  ) : null;
}

/** The server's saved authored body as editor state. */
function savedOverride(saved: RefinedBodyState | null): {
  override: RefinedBody | null;
  state: RefinedBodyState["state"] | null;
} {
  return {
    override:
      saved && saved.state !== "unreadable"
        ? { text: saved.text, baseHash: saved.baseHash }
        : null,
    state: saved?.state ?? null,
  };
}

function chargeFillSource(line: ChargeInventoryLine) {
  return `RentVine recurring charge: ${line.label} (${line.id})`;
}

function externalLink(destination: ExternalDeskDestination, text: string) {
  return (
    <a
      href={destination.href}
      target={EXTERNAL_LINK_TARGET}
      rel={EXTERNAL_LINK_REL}
      title={destination.label}
    >
      {text}
    </a>
  );
}

/** Key-order independent comparison of saved and local values. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry as Record<string, unknown>).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : entry,
  );
}

/** S161 (R-S161-5): a source staff leave blank is their own entry here; it is never asked for. */
const STAFF_ENTRY_SOURCE = "Staff entry on the message";
const NO_BASE_HASH = "0".repeat(64);
const STALE_ATTACHMENT_MESSAGE =
  "The selected screenshot is no longer the current one, so it is left off this message. Choose the current screenshot or clear the selection.";

/**
 * The inputs as they would be saved now. A finished entry is taken as typed. An unfinished or
 * unusable entry stays in its control, is named in `unfinished`, and falls back to its last saved
 * value here, so one half-typed field never holds back the rest of the message (S155).
 */
function savableInputs(
  raw: MessagePreparationInputs,
  saved: MessagePreparationInputs,
): { inputs: MessagePreparationInputs; unfinished: string[] } {
  const unfinished: string[] = [];
  const sourceOr = (value: string | null | undefined) =>
    value?.trim() || STAFF_ENTRY_SOURCE;
  const edits = RenewalMessageEditsSchema.safeParse(raw.edits);
  if (!edits.success) unfinished.push("Response request wording");
  const charges = raw.charges.map((charge) => {
    const parsed = MessageChargeSchema.safeParse({
      ...charge,
      source: charge.source?.trim() || null,
    });
    if (parsed.success) return parsed.data;
    unfinished.push(`${MESSAGE_CHARGES[charge.id]} charge`);
    return (
      saved.charges.find((value) => value.id === charge.id) ?? {
        id: charge.id,
        applicable: null,
        amount: null,
        cadence: null,
        effectiveDate: null,
        source: null,
        comparison: "unverified" as const,
      }
    );
  });
  let signature = saved.signature;
  const typed = raw.signature;
  if (!typed || !Object.values({ ...typed, source: "" }).some(Boolean)) signature = null;
  else {
    const parsed = MessagePreparationInputsSchema.shape.signature.safeParse({
      ...typed,
      source: sourceOr(typed.source),
      website: typed.website
        ? { url: typed.website.url, source: sourceOr(typed.website.source) }
        : null,
    });
    if (parsed.success) signature = parsed.data;
    else unfinished.push("Sender signature");
  }
  return {
    inputs: {
      edits: edits.success ? edits.data : saved.edits,
      compScreenshotReceiptId: raw.compScreenshotReceiptId,
      charges,
      leaseOrigin: raw.leaseOrigin
        ? { kind: raw.leaseOrigin.kind, source: sourceOr(raw.leaseOrigin.source) }
        : null,
      insuranceTransition: raw.insuranceTransition
        ? {
            applicable: raw.insuranceTransition.applicable,
            source: sourceOr(raw.insuranceTransition.source),
          }
        : null,
      otherChargesComparison: raw.otherChargesComparison
        ? {
            unchanged: raw.otherChargesComparison.unchanged,
            source: sourceOr(raw.otherChargesComparison.source),
          }
        : null,
      signature,
    },
    unfinished,
  };
}

interface LocalMessage {
  inputs: MessagePreparationInputs;
  override: RefinedBody | null;
  subjectText: string | null;
}

/** What one save would store for the local message, and what is still unfinished in it. */
function savePayload(local: LocalMessage, server: Preparation) {
  const effective = savableInputs(local.inputs, server.inputs);
  const unfinished = [...effective.unfinished];
  const savedBody = savedOverride(server.bodyOverride ?? null).override;
  // Blank wording is not authored wording: the text then follows the standard wording.
  const body = local.override?.text.trim()
    ? RefinedBodySchema.safeParse(local.override)
    : null;
  const subject = local.subjectText?.trim()
    ? AuthoredSubjectSchema.safeParse(local.subjectText)
    : null;
  if (body && !body.success) unfinished.push("Email body");
  if (subject && !subject.success) unfinished.push("Subject");
  return {
    effective: effective.inputs,
    unfinished,
    /** The wording itself cannot be stored as typed, so a draft of it is not prepared yet. */
    wordingUnfinished: Boolean((body && !body.success) || (subject && !subject.success)),
    value: {
      inputs: effective.inputs,
      bodyOverride: body ? (body.success ? body.data : savedBody) : null,
      subjectOverride: subject
        ? subject.success
          ? subject.data
          : (server.subjectOverride ?? null)
        : null,
    },
  };
}

/** The server's saved message in the same shape a save would send, for change detection. */
function savedPayload(server: Preparation): string {
  return canonical(
    savePayload(
      {
        inputs: server.inputs,
        override: savedOverride(server.bodyOverride ?? null).override,
        subjectText: server.subjectOverride ?? null,
      },
      server,
    ).value,
  );
}

function MessagePreparationEditor({
  leaseId,
  refreshBasis,
  channel,
  canEdit,
}: {
  leaseId: string;
  refreshBasis: string;
  channel: "owner" | "tenant";
  canEdit: boolean;
}) {
  const [current, setCurrent] = useState<Preparation | null>(null);
  const [inputs, setInputs] = useState(emptyMessagePreparationInputs);
  // S161: the authored body (typed here or accepted from a refinement) and the authored subject.
  // Null means the text follows the standard wording composed from the current information.
  const [override, setOverride] = useState<RefinedBody | null>(null);
  const [overrideState, setOverrideState] = useState<RefinedBodyState["state"] | null>(
    null,
  );
  const [previousOverride, setPreviousOverride] = useState<
    RefinedBody | null | undefined
  >(undefined);
  const [subjectText, setSubjectText] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [autosave, setAutosave] = useState<AutosaveState>(AUTOSAVE_IDLE);
  const [commitTick, setCommitTick] = useState(0);
  const [pending, setPending] = useState(false),
    [notice, setNotice] = useState("");
  const [outcome, setOutcome] = useState<RenewalNoticeDraftOutcome | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loadedAtIso, setLoadedAtIso] = useState<string | null>(null);
  const base = useId();
  const loadSequence = useRef(0);
  // Local entries the server has not confirmed, or cannot store yet. A refresh never replaces them.
  const touchedRef = useRef(false);
  const currentRef = useRef<Preparation | null>(null);
  const localRef = useRef<LocalMessage>({ inputs, override, subjectText });
  const lastSavedRef = useRef("");
  const outstanding = useRef<{ payload: string; id: string } | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const queued = useRef(false);
  // The save that runs a queued commit is the latest one, reached through a ref (the callback
  // cannot name itself while it is being declared).
  const runQueued = useRef<() => Promise<void>>(() => Promise.resolve());
  const readinessRef = useRef<HTMLDetailsElement | null>(null);
  const readinessSummaryId = `${MESSAGE_CONTROL_IDS.readiness(channel)}-summary`;
  // S131: the same applicability projection the policy panel shows; empty for an unrelated lease.
  const policy = useRenewalPolicy();
  const manual = useRenewalManualWorkspace();
  const policyGates = policy
    ? policyMessageGates(
        projectPolicyApplicability({
          productKey: "rhino",
          leaseId,
          manualState: manual?.state,
          material: policy.material,
          facts: policy.facts,
          sheetLegacyValue: policy.sheetLegacyValue,
          todayIso: policy.todayIso,
        }),
        channel,
        policy.material,
        policy.facts,
      )
    : [];
  // S129/S161: the server projected the same notes from the saved state; a note present on either
  // side is listed once.
  const policyNotes = [
    ...policyGates,
    ...(current?.policyGates ?? []).filter(
      (gate) => !policyGates.some((entry) => entry.field === gate.field),
    ),
  ];
  useEffect(() => {
    localRef.current = { inputs, override, subjectText };
  });
  /** Take the server's message as the local one. Only used while nothing local is unconfirmed. */
  const adopt = useCallback((result: Preparation) => {
    setInputs(result.inputs);
    const saved = savedOverride(result.bodyOverride ?? null);
    setOverride(saved.override);
    setOverrideState(saved.state);
    setPreviousOverride(undefined);
    setSubjectText(result.subjectOverride ?? null);
  }, []);
  const load = useCallback(() => {
    const sequence = ++loadSequence.current;
    return fetch(
      `/api/lease-renewal/message-preparation?leaseId=${encodeURIComponent(leaseId)}&channel=${channel}`,
      { cache: "no-store" },
    ).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The message could not be loaded.");
      const result = data as Preparation;
      if (sequence !== loadSequence.current) return;
      // A read that started before a save finished never replaces that save's newer revision.
      const known = currentRef.current;
      if (
        known &&
        known.cycleId === result.cycleId &&
        (result.saved?.revision ?? 0) < (known.saved?.revision ?? 0)
      )
        return;
      currentRef.current = result;
      lastSavedRef.current = savedPayload(result);
      setCurrent(result);
      setLoadedAtIso(new Date().toISOString());
      if (result.draftAttempt?.recoveryAvailable) {
        if (["Executing", "Needs reconciliation"].includes(result.draftAttempt.state))
          setOutcome({
            status: "needs_reconciliation",
            channel,
            executionId: result.draftAttempt.executionId,
            reason: "Recover the saved exact attempt before creating another draft.",
          });
        else if (result.draftAttempt.outcome) setOutcome(result.draftAttempt.outcome);
      }
      // S161 (R-S161-7): refreshed facts never replace wording or entries still held here.
      if (!touchedRef.current) adopt(result);
    });
  }, [adopt, channel, leaseId]);
  useEffect(() => {
    let active = true;
    load().catch((error) => {
      if (active) setNotice(error.message);
    });
    return () => {
      active = false;
      loadSequence.current++;
    };
  }, [load, refreshBasis]); // source and working changes refresh the facts; entries are kept

  /**
   * S155/S161: save the message as it stands. A completed entry saves by itself; nothing is
   * reviewed or confirmed. One save runs at a time and a later entry saves after it, so an older
   * response never replaces newer wording. A failed save keeps everything on screen and the same
   * unchanged request is retried under the same operation id.
   */
  const runAutosave = useCallback(
    (force = false): Promise<void> => {
      const server = currentRef.current;
      if (!canEdit || !server) return Promise.resolve();
      if (saving.current) {
        queued.current = true;
        return saving.current;
      }
      const local = localRef.current;
      const payload = savePayload(local, server);
      const serialized = canonical(payload.value);
      if (!force && serialized === lastSavedRef.current) return Promise.resolve();
      const request = {
        kind: "save",
        leaseId,
        channel,
        ...(server.cycleId ? { cycleId: server.cycleId } : {}),
        expectedRevision: server.saved?.revision ?? 0,
        ...payload.value,
      };
      const requestKey = canonical(request);
      if (outstanding.current?.payload !== requestKey)
        outstanding.current = { payload: requestKey, id: crypto.randomUUID() };
      const operationId = outstanding.current.id;
      setAutosave({ phase: "saving" });
      const run = (async () => {
        try {
          const response = await fetch("/api/lease-renewal/message-preparation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...request, operationId }),
          });
          const data = (await response.json().catch(() => ({}))) as Preparation & {
            error?: string;
          };
          if (!response.ok) {
            setAutosave({
              phase: "failed",
              message: data.error ?? "The message could not be saved.",
              conflict: response.status === 409,
            });
            return;
          }
          outstanding.current = null;
          currentRef.current = data;
          lastSavedRef.current = serialized;
          setCurrent(data);
          setLoadedAtIso(new Date().toISOString());
          const latest = localRef.current;
          // Everything entered was stored as typed and nothing newer was entered meanwhile.
          if (
            !payload.unfinished.length &&
            canonical(savePayload(latest, data).value) === serialized
          )
            touchedRef.current = false;
          const savedBody = data.bodyOverride ?? null;
          if (
            latest.override &&
            savedBody &&
            savedBody.state !== "unreadable" &&
            savedBody.text === latest.override.text.trim()
          )
            setOverrideState(savedBody.state);
          // S155: an entry made while this save was in flight is still unsaved; it saves next.
          setAutosave(queued.current ? { phase: "saving" } : { phase: "saved" });
        } catch {
          setAutosave({
            phase: "failed",
            message: "The connection was interrupted.",
          });
        }
      })().finally(() => {
        saving.current = null;
        if (queued.current) {
          queued.current = false;
          void runQueued.current();
        }
      });
      saving.current = run;
      return run;
    },
    [canEdit, channel, leaseId],
  );
  useEffect(() => {
    runQueued.current = () => runAutosave();
  }, [runAutosave]);
  // A commit is requested after the entry is in state (a blur, a choice, a button), so the save
  // that runs here always carries the latest values.
  useEffect(() => {
    if (commitTick > 0) void runAutosave();
  }, [commitTick, runAutosave]);
  const commit = () => setCommitTick((tick) => tick + 1);
  /** Try again after a failure. After a conflict, read the other person's save first, then save this entry. */
  async function retryAutosave() {
    if (autosave.phase === "failed" && autosave.conflict)
      await load().catch(() => undefined);
    await runAutosave(true);
  }
  function touch() {
    touchedRef.current = true;
    if (autosave.phase !== "idle" && autosave.phase !== "saving")
      setAutosave(AUTOSAVE_IDLE);
    if (outcome?.status === "preview") setOutcome(null);
    setConfirming(false);
  }
  function change(next: MessagePreparationInputs) {
    setInputs(next);
    touch();
  }
  /** Authored wording is an ordinary entry: it is kept exactly and saves by itself. */
  function overrideChange(next: RefinedBody | null, remember = false) {
    if (remember) setPreviousOverride(override);
    setOverride(next);
    setOverrideState(
      next
        ? overrideState === "stale" && next.baseHash === override?.baseHash
          ? "stale"
          : "applied"
        : null,
    );
    touch();
  }
  function chargeChange(id: MessageCharge["id"], changeValue: Partial<MessageCharge>) {
    change({
      ...inputs,
      charges: inputs.charges.map((value) =>
        value.id === id ? { ...value, ...changeValue } : value,
      ),
    });
  }
  function fillChargeFromInventory(id: MessageCharge["id"], lineId: string) {
    const line = current?.chargeInventory?.find((value) => value.id === lineId);
    if (!line) return;
    // A deliberate fill from one named current charge. The comparison with the outgoing lease
    // stays a human judgment, so it remains open until a person records it.
    chargeChange(id, {
      applicable: true,
      amount: line.amount,
      cadence: line.frequency === 1 ? "monthly" : null,
      effectiveDate: line.startDate,
      source: chargeFillSource(line),
    });
  }
  const signature = inputs.signature;
  function signatureChange(
    field: "name" | "role" | "phone" | "hours" | "source",
    value: string,
  ) {
    change({
      ...inputs,
      signature: {
        name: "",
        role: null,
        phone: null,
        hours: null,
        website: null,
        source: "",
        ...signature,
        [field]: value || (field === "name" || field === "source" ? "" : null),
      },
    });
  }
  // The message is composed from what would be saved now, so what is shown, copied and drafted is
  // one and the same text. Composition never refuses: a gap is a named marker and a callout line.
  const payload = current
    ? savePayload({ inputs, override, subjectText }, current)
    : null;
  let content: ReturnType<typeof composeRenewalMessage> | null = null;
  if (current && payload) {
    const effective = payload.effective;
    content = composeRenewalMessage(
      {
        ...current.facts,
        attachments:
          inputs.compScreenshotReceiptId &&
          inputs.compScreenshotReceiptId === current.availableCompScreenshot?.receiptId
            ? [
                {
                  filename: current.availableCompScreenshot.filename,
                  source: `comp-screenshot-receipt:${inputs.compScreenshotReceiptId}`,
                },
              ]
            : [],
        charges: effective.charges,
        leaseOrigin: effective.leaseOrigin,
        insuranceTransition: effective.insuranceTransition,
        otherChargesComparison: effective.otherChargesComparison,
        signature: effective.signature
          ? {
              ...effective.signature,
              email:
                current.signatureMatchesActor ||
                canonical(effective.signature) !==
                  canonical(current.saved?.inputs.signature ?? null)
                  ? current.senderEmail
                  : (current.saved?.signatureEmail ?? current.senderEmail),
            }
          : null,
      },
      effective.edits,
    );
    const serverRange = current.content?.missing?.find(
      (entry) => entry.field === "range",
    );
    const localRange = content.missing.find((entry) => entry.field === "range");
    if (serverRange && localRange) localRange.message = serverRange.message;
    if (
      inputs.compScreenshotReceiptId &&
      inputs.compScreenshotReceiptId !== current.availableCompScreenshot?.receiptId
    )
      content.missing.push({ field: "attachment", message: STALE_ATTACHMENT_MESSAGE });
  }
  // S161 (R-S161-7): authored wording is the body exactly as written, also after the information
  // it started from changed. Only a deliberate return to the standard wording replaces it.
  const authoredBody = override && override.text.trim() ? override.text : null;
  const authoredSubject =
    subjectText !== null && subjectText.trim() ? subjectText.trim() : null;
  let shownContent = content;
  if (shownContent && authoredBody)
    shownContent = applyRefinedBody(shownContent, authoredBody);
  if (shownContent && authoredSubject)
    shownContent = applyAuthoredSubject(shownContent, authoredSubject);
  const wordingChangedSince = Boolean(authoredBody && overrideState === "stale");
  const refineDisabledReason = !canEdit
    ? "Refining wording needs edit access to this renewal."
    : null;
  // S161 (R-S161-4): the concise missing-value callout. It is information; nothing waits on it.
  const readiness =
    current && shownContent
      ? projectMessageReadiness({
          channel,
          missing: shownContent.missing,
          policyGates: policyNotes,
        })
      : null;
  // S129 (R-F09-07): the meeting preflight from the same facts, callout and destinations.
  const preflight = current
    ? projectMessagePreflight({
        channel,
        canEdit,
        senderEmail: current.senderEmail,
        signatureOrigin: current.signatureOrigin?.kind ?? "none",
        signatureMatchesActor: current.signatureMatchesActor,
        readiness,
        recipients: current.recipients ?? null,
        publication: current.publication,
        gmailDestination: Boolean(current.destinations?.gmailDrafts),
        draftAttempt: current.draftAttempt,
        notices: current.notices,
        loadedAtIso,
      })
    : null;
  function openMissingInput(item: MessageMissingInput) {
    if (item.target.kind === "control") focusRenewalDashboardControl(item.target.id);
  }
  /** S162 (R-S162-1/2/3): copy is exactly what is on screen, whatever the save is doing. */
  async function copy(kind: "subject" | "plain" | "formatted" | "recipients") {
    const content = shownContent;
    if (!content || copying) return;
    setCopying(true);
    setNotice("Copying the displayed message…");
    try {
      if (kind === "recipients") {
        // S116: the complete To/Cc set, in the same order the draft carries it. Nothing is sent.
        if (current?.recipients?.status !== "ready") return;
        await boundedLocalWait(
          navigator.clipboard.writeText(
            formatRecipientsForCopy({
              to: current.recipients.to,
              cc: current.recipients.cc,
            }),
          ),
        );
        setNotice(
          `Recipients copied (${1 + current.recipients.cc.length} ${channel} ${
            current.recipients.cc.length === 0 ? "address" : "addresses"
          }). Nothing was sent.`,
        );
        return;
      }
      if (kind === "formatted") {
        await boundedLocalWait(
          navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([content.htmlBody], { type: "text/html" }),
              "text/plain": new Blob([content.plainText], { type: "text/plain" }),
            }),
          ]),
        );
      } else
        await boundedLocalWait(
          navigator.clipboard.writeText(
            kind === "subject" ? content.subject : content.plainText,
          ),
        );
      setNotice(
        `${kind === "subject" ? "Subject" : "Body"} copied as shown. Attachments are separate. Nothing was sent.`,
      );
    } catch (error) {
      setNotice(
        error instanceof LocalWaitError
          ? "Clipboard copying was not confirmed. Select and copy the displayed subject or body; your wording is kept."
          : "Clipboard access was denied. Select and copy the subject or body below; your wording is kept.",
      );
    } finally {
      setCopying(false);
    }
  }
  /**
   * S162: the deliberate unsent-draft step. The preview request carries exactly what is displayed
   * and, when it is not saved yet, the message itself, so the one action saves, binds and previews
   * it. Creation stays a separate exact confirmation of that preview. Nothing is ever sent.
   */
  async function draft(
    kind: "preview" | "create" | "reconcile",
    priorExecutionId?: string,
  ) {
    setPending(true);
    setConfirming(false);
    setNotice("");
    try {
      let preview: Record<string, unknown> = {};
      let savedWith: string | null = null;
      if (kind === "preview") {
        // An autosave already on its way finishes first, so the two never save over each other.
        await saving.current?.catch(() => undefined);
        const server = currentRef.current;
        if (!server || !shownContent) return;
        const state = savePayload(localRef.current, server);
        if (state.wordingUnfinished) {
          setNotice(
            "The wording has characters that cannot be saved, so no draft was prepared. Remove double braces and control characters, then preview again.",
          );
          return;
        }
        const serialized = canonical(state.value);
        const needsSave = serialized !== lastSavedRef.current || !server.saved;
        if (needsSave) savedWith = serialized;
        preview = {
          displayed: { subject: shownContent.subject, body: shownContent.plainText },
          ...(needsSave
            ? {
                save: {
                  ...(server.cycleId ? { cycleId: server.cycleId } : {}),
                  expectedRevision: server.saved?.revision ?? 0,
                  operationId: crypto.randomUUID(),
                  ...state.value,
                },
              }
            : {}),
        };
      }
      const request = {
        kind: "draft",
        leaseId,
        channel,
        ...preview,
        ...(kind === "create" && outcome?.status === "preview"
          ? {
              confirm: {
                executionId: outcome.executionId,
                previewHash: outcome.previewHash,
              },
            }
          : {}),
        ...(kind === "reconcile" &&
        (priorExecutionId || (outcome && "executionId" in outcome))
          ? {
              reconcile: {
                executionId:
                  priorExecutionId ??
                  (outcome && "executionId" in outcome ? outcome.executionId : ""),
              },
            }
          : {}),
      };
      const response = await fetch("/api/lease-renewal/message-preparation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = await response.json();
      if (!response.ok && data.providerCallAttempted === false) {
        setNotice(data.error);
        // The message was saved but reads differently now: show the current message.
        if (data.code === "message_changed") {
          if (savedWith) lastSavedRef.current = savedWith;
          await load().catch(() => undefined);
        }
        return;
      }
      if (!response.ok)
        throw new Error(
          data.error ??
            "Gmail drafting is unavailable. Copy remains available; no new draft is confirmed.",
        );
      if (savedWith) {
        // The draft action saved the message. Read its new revision; what is on screen stays.
        lastSavedRef.current = savedWith;
        outstanding.current = null;
        await load().catch(() => undefined);
      }
      const parsed = RenewalNoticeDraftOutcomeSchema.parse(data);
      setOutcome(parsed);
      if (parsed.status === "blocked") setNotice(parsed.reasons.join(" "));
      if (parsed.status === "created")
        setNotice(
          "An unsent Gmail draft was created and recorded. Review it in Gmail before you send it; a person sends it.",
        );
      if (parsed.status === "needs_reconciliation" || parsed.status === "reconciliation")
        setNotice(parsed.reason);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Gmail drafting failed. Copy remains available.",
      );
      if (kind === "create" && outcome?.status === "preview")
        setOutcome({
          status: "needs_reconciliation",
          channel,
          executionId: outcome.executionId,
          reason:
            "The create response is uncertain. Recover this exact attempt before preparing another draft.",
        });
    } finally {
      setPending(false);
    }
  }
  const unresolved =
    outcome?.status === "needs_reconciliation" ||
    (outcome?.status === "reconciliation" && outcome.resolution !== "created");
  // S162 (R-S162-5, R-S162-9): only what the exact Gmail action needs is asked of it. Missing
  // business values, an unrecorded response and an unsaved message never withhold the step.
  const canDraft = Boolean(
    canEdit &&
    current &&
    shownContent &&
    current.publication.status === "approved" &&
    !unresolved,
  );
  const paragraph = responseRequestParagraph(
    channel,
    payload?.effective.edits ?? { responseRequest: "" },
  );
  const signatureEdited =
    canonical(signature ?? null) !== canonical(current?.inputs.signature ?? null);
  const retainedDiffers =
    Boolean(current?.retainedSignature) &&
    canonical(signature ?? null) !== canonical(current?.retainedSignature ?? null);
  const channelLabel = channel === "owner" ? "Owner" : "Tenant";
  return (
    <Card
      title={renewalCardTitle(
        channel === "owner" ? "message-preparation-owner" : "message-preparation-tenant",
        `${channelLabel} message preparation`,
      )}
      ariaLabel={`${channelLabel} message preparation`}
      id={`renewal-card-message-${channel}`}
    >
      <p className="muted">Edits save in the app. A person sends from Gmail.</p>
      {notice ? <p role="status">{notice}</p> : null}
      {[...new Set(current?.notices ?? [])].map((value) => (
        <p key={value} className="muted">
          {value}
        </p>
      ))}
      {!current ? (
        <Button
          disabled={pending}
          onClick={() => load().catch((error) => setNotice(error.message))}
        >
          Reload message preparation
        </Button>
      ) : (
        <>
          {/* S162: copy uses exactly the subject and body shown here, with their markers,
              whatever the save or the missing values are doing. */}
          <section
            aria-label="Copy the message"
            className="ui-stack-tight renewal-message-group"
          >
            <h3 className="renewal-message-group-title">Copy the message</h3>
            <Field htmlFor={MESSAGE_CONTROL_IDS.subject(channel)} label="Subject">
              <input
                id={MESSAGE_CONTROL_IDS.subject(channel)}
                readOnly={!canEdit}
                value={subjectText ?? content?.subject ?? ""}
                onChange={(event) => {
                  setSubjectText(
                    event.target.value === content?.subject ? null : event.target.value,
                  );
                  touch();
                }}
                onBlur={() => {
                  if (subjectText !== null && !subjectText.trim()) setSubjectText(null);
                  commit();
                }}
              />
            </Field>
            {current?.recipients ? (
              current.recipients.status === "ready" ? (
                <p className="renewal-message-recipients">
                  <strong>To:</strong> {current.recipients.to}
                  {current.recipients.cc.length > 0 ? (
                    <>
                      {" "}
                      <strong>Cc:</strong> {current.recipients.cc.join(", ")}
                    </>
                  ) : null}
                </p>
              ) : (
                <ul className="renewal-message-recipients" role="status">
                  {[...new Set(current.recipients.reasons)].map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )
            ) : null}
            <div className="ui-actions">
              <Button
                variant="secondary"
                disabled={!shownContent || copying}
                onClick={() => copy("subject")}
              >
                Copy subject
              </Button>
              <Button
                variant="secondary"
                disabled={!shownContent || copying}
                onClick={() => copy("formatted")}
              >
                Copy formatted body
              </Button>
              <Button
                variant="secondary"
                disabled={!shownContent || copying}
                onClick={() => copy("plain")}
              >
                Copy plain text
              </Button>
              {current?.recipients ? (
                <Button
                  variant="secondary"
                  disabled={current.recipients.status !== "ready" || copying}
                  onClick={() => copy("recipients")}
                >
                  Copy recipients
                </Button>
              ) : null}
            </div>
            {current.destinations ? (
              <p className="muted renewal-message-destinations">
                RentVine:{" "}
                {channel === "owner"
                  ? current.destinations.owners.map((owner, index) => (
                      <span key={owner.record.href}>
                        {index > 0 ? " · " : ""}
                        {externalLink(
                          owner.messages,
                          `${owner.name}: open owner messages in RentVine`,
                        )}
                        {" · "}
                        {externalLink(owner.record, "open owner record in RentVine")}
                      </span>
                    ))
                  : current.destinations.messages
                    ? externalLink(
                        current.destinations.messages,
                        "Open lease messages in RentVine",
                      )
                    : null}
                {current.destinations.lease ? (
                  <>
                    {" · "}
                    {externalLink(
                      current.destinations.lease,
                      "Open lease record in RentVine",
                    )}
                  </>
                ) : null}
              </p>
            ) : null}
          </section>
          {shownContent ? (
            <>
              <Field
                htmlFor={MESSAGE_CONTROL_IDS.body(channel)}
                label="Email body"
                hint="Copy and Gmail draft use the wording shown, including unresolved markers."
              >
                <textarea
                  id={MESSAGE_CONTROL_IDS.body(channel)}
                  readOnly={!canEdit}
                  rows={16}
                  value={override ? override.text : (content?.plainText ?? "")}
                  onChange={(event) =>
                    overrideChange(
                      event.target.value === content?.plainText
                        ? null
                        : {
                            text: event.target.value,
                            baseHash:
                              override?.baseHash ?? current.bodyBaseHash ?? NO_BASE_HASH,
                          },
                    )
                  }
                  onBlur={() => {
                    if (override && !override.text.trim()) overrideChange(null);
                    commit();
                  }}
                />
              </Field>
              {authoredBody ? (
                <div className="ui-stack-tight">
                  <p className="muted" role="status">
                    {wordingChangedSince
                      ? STALE_REFINED_BODY_MESSAGE
                      : "Your wording is kept exactly as written. It is not replaced when the lease information changes."}
                  </p>
                  {canEdit ? (
                    <div className="ui-actions">
                      {previousOverride !== undefined ? (
                        <Button
                          onClick={() => {
                            overrideChange(previousOverride);
                            setPreviousOverride(undefined);
                            commit();
                          }}
                          type="button"
                          variant="secondary"
                        >
                          Undo the last refinement
                        </Button>
                      ) : null}
                      <Button
                        onClick={() => {
                          overrideChange(null, true);
                          commit();
                        }}
                        type="button"
                        variant="secondary"
                      >
                        Return to the standard wording
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {overrideState === "unreadable" && !override ? (
                <p role="status">{UNREADABLE_REFINED_BODY_MESSAGE}</p>
              ) : null}
              <details open>
                <summary>Formatted preview</summary>
                <div
                  aria-label={`${channel} formatted body`}
                  className="renewal-message-preview"
                  dangerouslySetInnerHTML={{ __html: shownContent.htmlBody }}
                />
              </details>
              <fieldset
                className="ui-stack-tight renewal-message-group"
                disabled={!canEdit || pending}
              >
                <RefineWithAi
                  appliedNotice="Revision applied to the email body. It saves by itself; edit it further if you like."
                  currentBody={shownContent.plainText}
                  disabledReason={refineDisabledReason}
                  id={MESSAGE_CONTROL_IDS.refine(channel)}
                  onApply={(revision) => {
                    overrideChange(
                      {
                        text: revision.body,
                        baseHash:
                          revision.baseHash ?? current.bodyBaseHash ?? NO_BASE_HASH,
                      },
                      true,
                    );
                    commit();
                  }}
                  request={{ surface: "renewal_message", leaseId, channel }}
                />
              </fieldset>
            </>
          ) : null}
          <section
            aria-label="Unsent Gmail draft"
            className="ui-stack-tight renewal-message-group"
          >
            <h3 className="renewal-message-group-title">Unsent Gmail draft</h3>
            {current.publication.status !== "approved" ? (
              <p className="muted">{current.publication.reason}</p>
            ) : null}
            <div className="ui-actions">
              <Button disabled={!canDraft || pending} onClick={() => draft("preview")}>
                Preview unsent Gmail draft
              </Button>
              {current.destinations?.gmailDrafts
                ? externalLink(
                    current.destinations.gmailDrafts,
                    "Open the Gmail Drafts folder",
                  )
                : null}
            </div>
            {outcome?.status === "preview" ? (
              <div className="ui-stack">
                <p>
                  From {current.senderEmail} · To {outcome.recipient.to}
                  {outcome.recipient.cc?.length
                    ? ` · Cc ${outcome.recipient.cc.join(", ")}`
                    : ""}
                </p>
                <p>{outcome.subject}</p>
                <div className="draft-box">{outcome.body}</div>
                {current.draftAttempt?.outcome?.status === "created" &&
                current.draftAttempt.executionId !== outcome.executionId ? (
                  <p role="note">
                    A Gmail draft from an earlier version of this message already exists.
                    Creating this one adds a second, separate unsent draft; the app cannot
                    replace the earlier one, so delete it in Gmail and send only one.
                  </p>
                ) : null}
                {outcome.attachment ? (
                  <p>
                    {outcome.attachment.label} · {outcome.attachment.mimeType} ·{" "}
                    {outcome.attachment.sizeBytes} bytes
                  </p>
                ) : null}
                {!confirming ? (
                  <Button
                    disabled={pending || !canDraft}
                    onClick={() => setConfirming(true)}
                  >
                    Review creation confirmation
                  </Button>
                ) : (
                  <div role="group" aria-label="Confirm exact unsent draft">
                    <p>
                      Create this exact unsent draft, with the recipients and wording
                      shown above, in the displayed managed mailbox? Nothing is sent.
                      Review it in Gmail before you send it; anything still marked stays
                      marked in the draft.
                    </p>
                    <Button onClick={() => setConfirming(false)}>Cancel</Button>
                    <Button
                      disabled={pending || !canDraft}
                      onClick={() => draft("create")}
                    >
                      Create this unsent draft
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
            {unresolved ? (
              <div>
                <p>
                  Do not create a duplicate. Recover the exact consumed attempt; copy
                  remains available.
                </p>
                <Button disabled={pending} onClick={() => draft("reconcile")}>
                  Recover exact Gmail attempt
                </Button>
              </div>
            ) : null}
            {outcome && "draftId" in outcome && outcome.draftId ? (
              <p className="muted">
                {current.destinations?.gmailDrafts ? (
                  <a
                    href={current.destinations.gmailDrafts.href}
                    target={EXTERNAL_LINK_TARGET}
                    rel={EXTERNAL_LINK_REL}
                  >
                    Open the Drafts folder to find this draft
                  </a>
                ) : (
                  "Open the Drafts folder in your managed Gmail mailbox to find this draft."
                )}{" "}
                Mailbox: {current.senderEmail}. A person sends from Gmail.
              </p>
            ) : null}
            {outcome?.status === "created" ||
            (outcome?.status === "reconciliation" && outcome.resolution === "created") ? (
              <p className="muted">{GEMINI_IN_GMAIL_HINT}</p>
            ) : null}
          </section>
          <fieldset
            id={MESSAGE_CONTROL_IDS.inputs(channel)}
            disabled={!canEdit}
            className="ui-stack"
            onBlur={commit}
            onChange={(event) => {
              // A choice saves when it is made; typed text saves when its field is left.
              const target = event.target as unknown;
              if (
                target instanceof HTMLSelectElement ||
                (target instanceof HTMLInputElement && target.type === "checkbox")
              )
                commit();
            }}
          >
            <Field
              htmlFor={`${base}-response`}
              label="Response request (optional wording edit)"
              hint="Replaces the paragraph after the terms, charges and insurance wording, before the request to complete the renewal information form. Blank keeps approved wording; amounts, dates and recipients remain in the email body."
            >
              <textarea
                id={`${base}-response`}
                value={inputs.edits.responseRequest}
                onChange={(event) =>
                  change({ ...inputs, edits: { responseRequest: event.target.value } })
                }
              />
            </Field>
            <p className="muted" data-testid="renewal-message-response-paragraph">
              Current paragraph in the preview (
              {paragraph.isDefault ? "approved default" : "your wording"}): &ldquo;
              {paragraph.text}&rdquo;
            </p>
            {channel === "tenant" ? (
              <>
                <details>
                  <summary>Lease origin and charges (optional details)</summary>
                  <div className="ui-stack">
                    <Field
                      htmlFor={MESSAGE_CONTROL_IDS.origin(channel)}
                      label="Current lease origin"
                    >
                      <select
                        id={MESSAGE_CONTROL_IDS.origin(channel)}
                        value={inputs.leaseOrigin?.kind ?? ""}
                        onChange={(event) =>
                          change({
                            ...inputs,
                            leaseOrigin: event.target.value
                              ? {
                                  kind: event.target.value as "pmi" | "third_party",
                                  source: inputs.leaseOrigin?.source ?? "",
                                }
                              : null,
                          })
                        }
                      >
                        <option value="">Not entered</option>
                        <option value="pmi">PMI lease</option>
                        <option value="third_party">Third-party lease</option>
                      </select>
                    </Field>
                    {inputs.leaseOrigin ? (
                      <Field
                        htmlFor={`${base}-origin-source`}
                        label="Lease-origin source (optional)"
                      >
                        <input
                          id={`${base}-origin-source`}
                          value={inputs.leaseOrigin.source}
                          onChange={(event) =>
                            change({
                              ...inputs,
                              leaseOrigin: {
                                ...inputs.leaseOrigin!,
                                source: event.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                    ) : null}
                    {inputs.charges.map((charge) => {
                      const filledFrom = current.chargeInventory?.find(
                        (line) => chargeFillSource(line) === charge.source,
                      );
                      return (
                        <details
                          key={charge.id}
                          id={MESSAGE_CONTROL_IDS.charge(channel, charge.id)}
                        >
                          <summary>
                            {MESSAGE_CHARGES[charge.id]} ·{" "}
                            {charge.applicable === null
                              ? "Not entered"
                              : charge.applicable
                                ? "Applies"
                                : "Does not apply"}
                          </summary>
                          <div className="ui-stack">
                            {current.chargeInventory?.length ? (
                              <Field
                                htmlFor={`${base}-${charge.id}-fill`}
                                label="Fill from a current RentVine charge"
                                hint="Verified current charge · comparison remains staff-recorded."
                              >
                                <select
                                  id={`${base}-${charge.id}-fill`}
                                  value={filledFrom?.id ?? ""}
                                  onChange={(event) =>
                                    fillChargeFromInventory(charge.id, event.target.value)
                                  }
                                >
                                  <option value="">Choose a current charge</option>
                                  {current.chargeInventory.map((line) => (
                                    <option key={line.id} value={line.id}>
                                      {line.label}: ${line.amount.toFixed(2)}
                                      {line.frequency === 1
                                        ? " per month"
                                        : ` every ${line.frequency} months`}
                                      {line.startDate
                                        ? ` from ${formatSourceCalendarDate(line.startDate)}`
                                        : ""}
                                      {line.current === false ? " (not current)" : ""}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            ) : null}
                            {filledFrom ? (
                              <p
                                className="muted"
                                data-testid={`renewal-message-charge-origin-${charge.id}`}
                              >
                                Filled from RentVine recurring charge {filledFrom.label}.
                                Change anything that differs for the renewal.
                              </p>
                            ) : null}
                            <Field
                              htmlFor={`${base}-${charge.id}-applies`}
                              label="Does this charge apply?"
                            >
                              <select
                                id={`${base}-${charge.id}-applies`}
                                value={
                                  charge.applicable === null
                                    ? ""
                                    : String(charge.applicable)
                                }
                                onChange={(event) =>
                                  chargeChange(charge.id, {
                                    applicable:
                                      event.target.value === ""
                                        ? null
                                        : event.target.value === "true",
                                  })
                                }
                              >
                                <option value="">Not entered</option>
                                <option value="true">Applies</option>
                                <option value="false">Does not apply</option>
                              </select>
                            </Field>
                            {charge.applicable ? (
                              <>
                                <Field
                                  htmlFor={`${base}-${charge.id}-amount`}
                                  label="Charge amount ($)"
                                >
                                  <input
                                    id={`${base}-${charge.id}-amount`}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={charge.amount ?? ""}
                                    onChange={(event) =>
                                      chargeChange(charge.id, {
                                        amount:
                                          event.target.value === ""
                                            ? null
                                            : Number(event.target.value),
                                      })
                                    }
                                  />
                                </Field>
                                <Field
                                  htmlFor={`${base}-${charge.id}-cadence`}
                                  label="How often is it charged?"
                                >
                                  <select
                                    id={`${base}-${charge.id}-cadence`}
                                    value={charge.cadence ?? ""}
                                    onChange={(event) =>
                                      chargeChange(charge.id, {
                                        cadence: (event.target.value ||
                                          null) as MessageCharge["cadence"],
                                      })
                                    }
                                  >
                                    <option value="">Not entered</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="one_time">One time</option>
                                  </select>
                                </Field>
                                <Field
                                  htmlFor={`${base}-${charge.id}-date`}
                                  label="Charge start date"
                                >
                                  <input
                                    id={`${base}-${charge.id}-date`}
                                    type="date"
                                    value={charge.effectiveDate ?? ""}
                                    onChange={(event) =>
                                      chargeChange(charge.id, {
                                        effectiveDate: event.target.value || null,
                                      })
                                    }
                                  />
                                </Field>
                                <Field
                                  htmlFor={`${base}-${charge.id}-comparison`}
                                  label="Compared with current charges"
                                >
                                  <select
                                    id={`${base}-${charge.id}-comparison`}
                                    value={charge.comparison}
                                    onChange={(event) =>
                                      chargeChange(charge.id, {
                                        comparison: event.target
                                          .value as MessageCharge["comparison"],
                                      })
                                    }
                                  >
                                    <option value="unverified">Not compared</option>
                                    <option value="unchanged">Unchanged</option>
                                    <option value="changed">Changed</option>
                                    <option value="new">New</option>
                                  </select>
                                </Field>
                              </>
                            ) : null}
                            <Field
                              htmlFor={`${base}-${charge.id}-source`}
                              label="Charge source (optional)"
                            >
                              <input
                                id={`${base}-${charge.id}-source`}
                                value={charge.source ?? ""}
                                onChange={(event) =>
                                  chargeChange(charge.id, {
                                    source: event.target.value || null,
                                  })
                                }
                              />
                            </Field>
                          </div>
                        </details>
                      );
                    })}
                    <Field
                      htmlFor={MESSAGE_CONTROL_IDS.insurance(channel)}
                      label="Does the supplied insurance transition apply?"
                    >
                      <select
                        id={MESSAGE_CONTROL_IDS.insurance(channel)}
                        value={
                          inputs.insuranceTransition === null
                            ? ""
                            : String(inputs.insuranceTransition.applicable)
                        }
                        onChange={(event) =>
                          change({
                            ...inputs,
                            insuranceTransition:
                              event.target.value === ""
                                ? null
                                : {
                                    applicable: event.target.value === "true",
                                    source: inputs.insuranceTransition?.source ?? "",
                                  },
                          })
                        }
                      >
                        <option value="">Not entered</option>
                        <option value="true">Applies</option>
                        <option value="false">Does not apply</option>
                      </select>
                    </Field>
                    {inputs.insuranceTransition ? (
                      <Field
                        htmlFor={`${base}-insurance-source`}
                        label="Insurance policy source (optional)"
                      >
                        <input
                          id={`${base}-insurance-source`}
                          value={inputs.insuranceTransition.source}
                          onChange={(event) =>
                            change({
                              ...inputs,
                              insuranceTransition: {
                                ...inputs.insuranceTransition!,
                                source: event.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                    ) : null}
                    <Field
                      htmlFor={`${base}-unchanged`}
                      label="Are all remaining charges unchanged after comparison?"
                    >
                      <select
                        id={`${base}-unchanged`}
                        value={
                          inputs.otherChargesComparison === null
                            ? ""
                            : String(inputs.otherChargesComparison.unchanged)
                        }
                        onChange={(event) =>
                          change({
                            ...inputs,
                            otherChargesComparison:
                              event.target.value === ""
                                ? null
                                : {
                                    unchanged: event.target.value === "true",
                                    source: inputs.otherChargesComparison?.source ?? "",
                                  },
                          })
                        }
                      >
                        <option value="">
                          Do not include an unchanged-charges statement
                        </option>
                        <option value="true">Compared: unchanged</option>
                        <option value="false">Compared: changes apply</option>
                      </select>
                    </Field>
                    {inputs.otherChargesComparison ? (
                      <Field
                        htmlFor={`${base}-comparison-source`}
                        label="Remaining-charges comparison source (optional)"
                      >
                        <input
                          id={`${base}-comparison-source`}
                          value={inputs.otherChargesComparison.source}
                          onChange={(event) =>
                            change({
                              ...inputs,
                              otherChargesComparison: {
                                ...inputs.otherChargesComparison!,
                                source: event.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                    ) : null}
                  </div>
                </details>
              </>
            ) : null}
            <details>
              <summary>Managed sender signature · {current.senderEmail}</summary>
              <p className="muted" data-testid="renewal-message-signature-origin">
                {signatureEdited
                  ? "Edited here. It saves with this message and is kept for your managed sender."
                  : current.signatureOrigin?.kind === "retained_sender"
                    ? `Filled from your retained sender signature (saved ${formatBusinessTimestamp(current.signatureOrigin.recordedAt)}). Edit here to change it.`
                    : current.signatureOrigin?.kind === "saved"
                      ? current.signatureMatchesActor
                        ? "Saved with this message as your signature for this managed sender."
                        : "Saved with this message by another sender and shown as saved. Use your retained signature or edit it here if you prefer."
                      : "Signature shared across leases for this managed sender."}
              </p>
              {retainedDiffers ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    change({ ...inputs, signature: current.retainedSignature ?? null });
                    commit();
                  }}
                >
                  Use my retained signature
                </Button>
              ) : null}
              <div className="ui-stack">
                {(
                  [
                    ["name", "Sender name"],
                    ["role", "Approved role / organization"],
                    ["phone", "Verified phone (optional)"],
                    ["hours", "Verified hours (optional)"],
                    ["source", "Signature source (optional)"],
                  ] as const
                ).map(([field, label]) => {
                  const id =
                    field === "name"
                      ? MESSAGE_CONTROL_IDS.signature(channel)
                      : `${base}-${field}`;
                  return (
                    <Field key={field} htmlFor={id} label={label}>
                      <input
                        id={id}
                        value={signature?.[field] ?? ""}
                        onChange={(event) => signatureChange(field, event.target.value)}
                      />
                    </Field>
                  );
                })}
                <Field htmlFor={`${base}-website`} label="Verified website (optional)">
                  <input
                    id={`${base}-website`}
                    type="url"
                    value={signature?.website?.url ?? ""}
                    onChange={(event) =>
                      change({
                        ...inputs,
                        signature: {
                          ...(inputs.signature ?? {
                            name: "",
                            role: null,
                            phone: null,
                            hours: null,
                            source: "",
                            website: null,
                          }),
                          website: event.target.value
                            ? {
                                url: event.target.value,
                                source: inputs.signature?.source ?? "",
                              }
                            : null,
                        },
                      })
                    }
                  />
                </Field>
              </div>
            </details>
            {channel === "owner" ? (
              <div className="ui-stack">
                {current.availableCompScreenshot ? (
                  <>
                    <label>
                      <input
                        id={MESSAGE_CONTROL_IDS.attachment}
                        type="checkbox"
                        checked={
                          inputs.compScreenshotReceiptId ===
                          current.availableCompScreenshot.receiptId
                        }
                        onChange={(event) =>
                          change({
                            ...inputs,
                            compScreenshotReceiptId: event.target.checked
                              ? current.availableCompScreenshot!.receiptId
                              : null,
                          })
                        }
                      />
                      Include this screenshot with the message:{" "}
                      {current.availableCompScreenshot.filename}
                    </label>
                    <a
                      className="text-link"
                      href={`/api/lease-renewal/message-attachment?leaseId=${encodeURIComponent(leaseId)}&receiptId=${encodeURIComponent(current.availableCompScreenshot.receiptId)}`}
                    >
                      Download the screenshot
                    </a>
                    <p className="muted">
                      For a manually copied email, download and attach this file yourself.
                      Download and Gmail attachment both verify its current Drive receipt
                      and existing action access.
                    </p>
                  </>
                ) : (
                  <p className="muted" id={MESSAGE_CONTROL_IDS.attachment} tabIndex={-1}>
                    No current receipted screenshot is available. Attach any analysis file
                    yourself in Gmail.
                  </p>
                )}
                {inputs.compScreenshotReceiptId &&
                inputs.compScreenshotReceiptId !==
                  current.availableCompScreenshot?.receiptId ? (
                  <Button
                    onClick={() => {
                      change({ ...inputs, compScreenshotReceiptId: null });
                      commit();
                    }}
                  >
                    Remove unavailable attachment selection
                  </Button>
                ) : null}
              </div>
            ) : null}
          </fieldset>
          {canEdit ? (
            <AutosaveStatus state={autosave} subject="Message" onRetry={retryAutosave} />
          ) : null}
          {payload?.unfinished.length ? (
            <p className="muted" data-testid="renewal-message-unfinished">
              Not saved yet: {payload.unfinished.join(", ")}. Each entry saves by itself
              once it is complete; everything else is already saved.
            </p>
          ) : null}
          {readiness ? (
            readiness.complete ? (
              <p className="muted" id={readinessSummaryId}>
                {readiness.summary}
              </p>
            ) : (
              <details
                open
                ref={readinessRef}
                id={MESSAGE_CONTROL_IDS.readiness(channel)}
              >
                <summary id={readinessSummaryId}>{readiness.summary}</summary>
                <ul aria-label="Marked values" className="ui-rows">
                  {readiness.items.map((item) => (
                    <li key={`${item.field}:${item.message}`}>
                      {item.target.kind === "control" ? (
                        <a
                          className="text-link"
                          href={`#${item.target.id}`}
                          onClick={() => openMissingInput(item)}
                        >
                          {item.target.label}
                        </a>
                      ) : (
                        <a className="text-link" href={item.target.href}>
                          {item.target.label}
                        </a>
                      )}
                      : {item.message}
                    </li>
                  ))}
                </ul>
              </details>
            )
          ) : null}
          {preflight ? (
            <details
              className="renewal-message-preflight"
              data-renewal-preflight={
                preflight.proceedWithoutGmail ? "proceed" : "blocked"
              }
              data-renewal-preflight-draft={
                preflight.draftStepAvailable ? "available" : "pending"
              }
              id={`renewal-message-${channel}-preflight`}
            >
              <summary>{preflight.summary}</summary>
              <ul className="ui-rows" data-renewal-preflight-items>
                {preflight.items.map((item) => (
                  <li
                    key={item.id}
                    data-renewal-preflight-item={item.id}
                    data-renewal-preflight-state={item.state}
                  >
                    <strong>{PREFLIGHT_STATE_LABELS[item.state]}</strong>: {item.label}.{" "}
                    {item.detail}
                    {item.fallback ? ` Fallback: ${item.fallback}` : ""}
                    {item.target?.kind === "control" ? (
                      <>
                        {" "}
                        <a className="text-link" href={`#${item.target.id}`}>
                          Open the control
                        </a>
                      </>
                    ) : item.target?.kind === "route" ? (
                      <>
                        {" "}
                        <a className="text-link" href={item.target.href}>
                          Open the page
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {current.previousDraftAttempts?.length ? (
            <details>
              <summary>
                Earlier Gmail attempts for this lease (
                {current.previousDraftAttempts.length})
              </summary>
              {current.previousDraftAttempts.map((attempt) => (
                <div key={attempt.executionId}>
                  <p>
                    Earlier work record: {attempt.state}. This attempt remains separate
                    from the current message.
                  </p>
                  {attempt.recoveryAvailable ? (
                    <Button
                      disabled={pending}
                      onClick={() => draft("reconcile", attempt.executionId)}
                    >
                      Recover earlier Gmail attempt
                    </Button>
                  ) : (
                    <p>Its original managed sender must recover this attempt.</p>
                  )}
                </div>
              ))}
            </details>
          ) : null}
        </>
      )}
    </Card>
  );
}
