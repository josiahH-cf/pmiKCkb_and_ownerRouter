"use client";
import { isRenewalPresentationMove } from "./RenewalDashboardNavigation";
import {
  useWorkingFieldEditor,
  type WorkingFieldEditor,
  type WorkingLocalDraft,
  type WorkingLocalCommand,
} from "./WorkingFieldEditor";
import { boundedLocalWait } from "@/lib/ui/local-lifetime";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

// S157/S156/S155: the lease-bound working record on the lease page. Each working field saves on
// its own when it is complete and valid; an unfinished or invalid field stays in its control and
// blocks nothing else. Saving is application persistence only: no provider is read or written.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  AUTOSAVE_IDLE,
  AutosaveStatus,
  withEdited,
  type AutosaveState,
} from "./AutosaveStatus";
import { useRenewalPricingPolicy } from "./RenewalPricingPolicy";
import { Button, Field } from "@/components/ui";
import { parseCurrencyInput } from "@/lib/currency-input";
import {
  standingRuleContext,
  standingRuleSourceLabel,
} from "@/lib/lease-renewal/standing-agreement";
import { formatBusinessTimestamp, formatCalendarDate } from "@/lib/date-display";
import {
  workingEntry,
  workingFieldLabel,
  type RenewalWorkingRecord,
  type WorkingFieldEntry,
  type WorkingValue,
  type WorkingValueOrigin,
} from "@/lib/lease-renewal/working-record";

interface SaveOptions {
  readonly origin?: WorkingValueOrigin;
  readonly sourceLabel?: string;
  readonly context?: string;
  /** Local acknowledgment only; this value never enters the server request. */
  readonly editorVersion?: number;
}

interface WorkingRecordContextValue {
  readonly leaseId: string;
  readonly canEdit: boolean;
  /** True when the saved record could not be read; entries stay local until it reads back. */
  readonly readUnavailable: boolean;
  readonly record: RenewalWorkingRecord | null;
  readonly states: Readonly<Record<string, AutosaveState>>;
  readonly localRevision: number;
  readonly save: (
    field: string,
    value: WorkingValue | null,
    options?: SaveOptions,
  ) => Promise<boolean>;
  readonly reload: () => Promise<void>;
  readonly registerFieldEditor: (
    field: string,
    id: string,
    editor: WorkingFieldEditor,
  ) => () => void;
  readonly localDraft: (field: string) => WorkingLocalDraft | null;
  readonly editLocalDraft: (
    field: string,
    text: string,
    command?: WorkingLocalCommand,
  ) => number;
  readonly confirmLocalDraft: (field: string, version: number) => boolean;
  readonly hasUnsettled: (fields: readonly string[]) => boolean;
  readonly settle: (
    fields: readonly string[],
  ) => Promise<
    | { ok: true; changed: boolean }
    | { ok: false; field: string; controlId: string | null }
  >;
}

const Context = createContext<WorkingRecordContextValue | null>(null);

export function useRenewalWorkingRecord() {
  return useContext(Context);
}

interface PendingSave {
  readonly key: string;
  readonly operationId: string;
  readonly body: Record<string, unknown>;
}

function newer(
  current: RenewalWorkingRecord | null,
  candidate: RenewalWorkingRecord | null,
) {
  if (!candidate) return current;
  return !current || candidate.revision >= current.revision ? candidate : current;
}

function visibleWorkingEditor(editor: WorkingFieldEditor) {
  const control = editor.control();
  return Boolean(
    control?.isConnected &&
    !control.closest("[hidden], [data-renewal-focus-hidden], details:not([open])"),
  );
}

export function RenewalWorkingRecordProvider({
  leaseId,
  canEdit,
  initialRecord,
  unavailable = false,
  children,
}: Readonly<{
  leaseId: string;
  canEdit: boolean;
  /** Undefined or null when the lease has no working record yet. */
  initialRecord?: RenewalWorkingRecord | null;
  unavailable?: boolean;
  children: ReactNode;
}>) {
  const [stored, setStored] = useState<RenewalWorkingRecord | null>(
    initialRecord ?? null,
  );
  const [readUnavailable, setReadUnavailable] = useState(unavailable);
  const [states, setStates] = useState<Record<string, AutosaveState>>({});
  // A page refresh can deliver a newer server record; a local save can be newer than the page.
  const record = useMemo(
    () => newer(stored, initialRecord ?? null),
    [stored, initialRecord],
  );
  const recordRef = useRef(record);
  useEffect(() => {
    recordRef.current = newer(recordRef.current, record);
  }, [record]);
  const pending = useRef(new Map<string, PendingSave>());
  const sequence = useRef(new Map<string, number>());
  const saves = useRef(new Map<string, Promise<boolean>>());
  const stateRef = useRef<Record<string, AutosaveState>>({});
  const editors = useRef(new Map<string, Map<string, WorkingFieldEditor>>());
  const drafts = useRef<Record<string, WorkingLocalDraft>>({});
  const editSequence = useRef(0);
  const [draftRevision, showDrafts] = useState(0);
  const localDraft = useCallback((field: string) => drafts.current[field] ?? null, []);
  const editLocalDraft = useCallback(
    (field: string, text: string, command?: WorkingLocalCommand) => {
      const version = ++editSequence.current;
      drafts.current = {
        ...drafts.current,
        [field]: { text, version, ...(command ? { command } : {}) },
      };
      showDrafts((revision) => revision + 1);
      return version;
    },
    [],
  );
  const confirmLocalDraft = useCallback((field: string, version: number) => {
    const draft = drafts.current[field];
    if (!draft) return true;
    if (draft.version !== version) return false;
    const next = { ...drafts.current };
    delete next[field];
    drafts.current = next;
    showDrafts((revision) => revision + 1);
    return true;
  }, []);

  const setState = useCallback((field: string, state: AutosaveState) => {
    stateRef.current = { ...stateRef.current, [field]: state };
    setStates((current) => ({ ...current, [field]: state }));
  }, []);

  const reload = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/lease-renewal/working-record?leaseId=${encodeURIComponent(leaseId)}`,
      );
      const value = (await response.json()) as { record?: RenewalWorkingRecord | null };
      if (!response.ok) return;
      recordRef.current = newer(recordRef.current, value.record ?? null);
      setStored((current) => newer(current, value.record ?? null));
      setReadUnavailable(false);
    } catch {
      // The entered values stay in their controls; the next save or reload reads again.
    }
  }, [leaseId]);

  const send = useCallback(
    async (field: string, save: PendingSave): Promise<boolean> => {
      const turn = (sequence.current.get(field) ?? 0) + 1;
      sequence.current.set(field, turn);
      setState(field, { phase: "saving" });
      const latest = () => sequence.current.get(field) === turn;
      try {
        const response = await fetch("/api/lease-renewal/working-record", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...save.body, operationId: save.operationId }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          record?: RenewalWorkingRecord;
          error?: string;
        };
        if (!response.ok || !result.record) {
          if (response.status === 409) void reload();
          // A 4xx explicitly refused this request. A 5xx or unreadable success can follow a
          // committed save, so recovery keeps that exact operation identity.
          if (
            response.status >= 400 &&
            response.status < 500 &&
            pending.current.get(field)?.operationId === save.operationId
          )
            pending.current.delete(field);
          if (latest())
            setState(field, {
              phase: "failed",
              message: result.error ?? "The save was refused.",
              conflict: response.status === 409,
            });
          return false;
        }
        // An older response never replaces a newer stored record.
        recordRef.current = newer(recordRef.current, result.record ?? null);
        setStored((current) => newer(current, result.record ?? null));
        setReadUnavailable(false);
        if (pending.current.get(field)?.operationId === save.operationId)
          pending.current.delete(field);
        if (latest()) setState(field, { phase: "saved" });
        return true;
      } catch {
        // The response was lost: the same request is kept so a retry cannot save twice.
        if (latest())
          setState(field, {
            phase: "failed",
            message: "The save did not finish.",
          });
        return false;
      }
    },
    [reload, setState],
  );

  const save = useCallback(
    async (field: string, value: WorkingValue | null, options: SaveOptions = {}) => {
      if (!canEdit) return false;
      const automaticDraft =
        options.editorVersion === undefined &&
        ["current_rent", "terms_rent", "terms_effective_date", "terms_end_date"].includes(
          field,
        ) &&
        (value === null || typeof value === "number" || typeof value === "string")
          ? editLocalDraft(field, value === null ? "" : String(value), { value, options })
          : null;
      const body = {
        leaseId,
        field,
        value,
        expectedRevision: workingEntry(recordRef.current, field)?.revision ?? 0,
        origin: options.origin ?? "staff_entry",
        ...(options.sourceLabel ? { sourceLabel: options.sourceLabel } : {}),
        ...(options.context ? { context: options.context } : {}),
      };
      const key = JSON.stringify(body);
      const prior = pending.current.get(field);
      const existing = prior?.key === key ? saves.current.get(field) : null;
      if (existing) {
        const ok = await existing;
        if (ok && automaticDraft !== null) confirmLocalDraft(field, automaticDraft);
        return ok;
      }
      const next: PendingSave =
        prior?.key === key ? prior : { key, operationId: crypto.randomUUID(), body };
      pending.current.set(field, next);
      const operation = send(field, next);
      saves.current.set(field, operation);
      try {
        const ok = await operation;
        if (ok && automaticDraft !== null) confirmLocalDraft(field, automaticDraft);
        return ok;
      } finally {
        if (saves.current.get(field) === operation) saves.current.delete(field);
      }
    },
    [canEdit, leaseId, send, editLocalDraft, confirmLocalDraft],
  );

  const registerFieldEditor = useCallback(
    (field: string, id: string, editor: WorkingFieldEditor) => {
      const entries = editors.current.get(field) ?? new Map<string, WorkingFieldEditor>();
      editors.current.set(field, entries);
      entries.set(id, editor);
      return () => {
        if (entries.get(id) === editor) entries.delete(id);
      };
    },
    [],
  );
  const hasUnsettled = useCallback(
    (fields: readonly string[]) =>
      fields.some(
        (field) =>
          saves.current.has(field) ||
          stateRef.current[field]?.phase === "failed" ||
          drafts.current[field] !== undefined,
      ),
    [],
  );
  const settle = useCallback(async (fields: readonly string[]) => {
    const before = recordRef.current?.revision ?? 0;
    let active = true;
    let fieldInProgress = fields[0] ?? "terms_rent";
    const failure = (field: string) => ({
      ok: false as const,
      field,
      controlId:
        [...(editors.current.get(field)?.values() ?? [])]
          .sort((a, b) => b.order() - a.order())[0]
          ?.control()?.id ?? null,
    });
    try {
      return await boundedLocalWait(
        (async () => {
          while (active) {
            for (const field of fields) {
              fieldInProgress = field;
              const operation = saves.current.get(field);
              if (operation && !(await operation)) return failure(field);
              if (!active || stateRef.current[field]?.phase === "failed")
                return failure(field);
            }
            const dirty = fields
              .flatMap((field) => {
                const entries = [...(editors.current.get(field)?.values() ?? [])].filter(
                  (editor) => editor.dirty(),
                );
                const editor = entries.find(visibleWorkingEditor) ?? entries[0];
                return editor ? [{ field, editor }] : [];
              })
              .sort((a, b) => a.editor.order() - b.editor.order());
            if (!dirty.length && !fields.some((field) => saves.current.has(field))) {
              const uncommitted = fields.find((field) => drafts.current[field]);
              return uncommitted
                ? failure(uncommitted)
                : {
                    ok: true as const,
                    changed: (recordRef.current?.revision ?? 0) !== before,
                  };
            }
            for (const { field, editor } of dirty) {
              fieldInProgress = field;
              if (!active || !(await editor.flush())) return failure(field);
            }
          }
          return failure(fieldInProgress);
        })(),
      );
    } catch {
      return failure(fieldInProgress);
    } finally {
      active = false;
    }
  }, []);

  const value = useMemo(
    () => ({
      leaseId,
      canEdit,
      readUnavailable,
      record,
      states,
      localRevision: draftRevision,
      save,
      reload,
      registerFieldEditor,
      localDraft,
      editLocalDraft,
      confirmLocalDraft,
      hasUnsettled,
      settle,
    }),
    [
      leaseId,
      canEdit,
      readUnavailable,
      record,
      states,
      save,
      reload,
      registerFieldEditor,
      localDraft,
      editLocalDraft,
      confirmLocalDraft,
      hasUnsettled,
      settle,
      draftRevision,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function attribution(entry: WorkingFieldEntry | null): string | null {
  if (!entry) return null;
  const when = formatBusinessTimestamp(entry.recordedAt);
  const how =
    entry.origin === "adopted_source"
      ? `Taken from ${entry.sourceLabel ?? "the source"} by`
      : entry.value === null
        ? "Cleared by"
        : "Entered by";
  return `${how} ${entry.recordedByLabel}, ${when}${entry.context ? `. ${entry.context}` : ""}`;
}

interface WorkingFieldProps {
  readonly field: string;
  /** Overrides the field's standard label. */
  readonly label?: string;
  readonly hint?: string;
  /** The observed source value this working value sits beside, when one is known. */
  readonly source?: { readonly label: string; readonly value: number | string } | null;
}

/**
 * One autosaved working amount. It saves when the control is left with a complete, valid amount
 * that differs from the saved one. An unfinished amount stays typed and nothing else waits on it.
 */
export function WorkingMoneyField({ field, label, hint, source }: WorkingFieldProps) {
  const context = useRenewalWorkingRecord();
  const pricing = useRenewalPricingPolicy();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const editor = useWorkingFieldEditor(context, field, input);
  const command = useRef<{ value: number | null; options?: SaveOptions } | null>(null);
  const entry = workingEntry(context?.record, field);
  const saved = typeof entry?.value === "number" ? entry.value : null;
  const [text, setText] = useState(saved === null ? "" : String(saved));
  const [dirtyLocal, setDirty] = useState(false);
  const draft = editor.draft();
  const dirty = editor.shared ? draft !== null : dirtyLocal;
  const [error, setError] = useState<string | null>(null);
  // Adopt a newer saved value only while this control holds no unsaved typing.
  const [seenRevision, setSeenRevision] = useState(entry?.revision ?? 0);
  if ((entry?.revision ?? 0) !== seenRevision) {
    setSeenRevision(entry?.revision ?? 0);
    if (!dirty) setText(saved === null ? "" : String(saved));
  }
  const title = label ?? workingFieldLabel(field);
  const state = context?.states[field] ?? AUTOSAVE_IDLE;
  const sourceAmount = typeof source?.value === "number" ? source.value : null;
  const differs = saved !== null && sourceAmount !== null && saved !== sourceAmount;

  const prefill =
    field === "terms_rent" && !entry ? (pricing?.view?.prefill ?? null) : null;
  const displayText =
    draft?.text ??
    (editor.shared
      ? saved === null
        ? prefill
          ? String(prefill.value)
          : ""
        : String(saved)
      : !dirty && saved === null && prefill
        ? String(prefill.value)
        : text);
  async function commit(value = displayText): Promise<boolean> {
    if (editor.shared) value = editor.draft()?.text ?? value;
    if (!editor.dirty() && !prefill) return true;
    const generation = editor.version();
    const explicit = editor.shared ? (editor.draft()?.command ?? null) : command.current;
    let amount: number | null =
      typeof explicit?.value === "number" ? explicit.value : null;
    if (typeof explicit?.value === "string") {
      const parsed = parseCurrencyInput(explicit.value);
      if (!parsed.ok || parsed.value <= 0) {
        setError("Enter an amount such as 1850.00.");
        return false;
      }
      amount = parsed.value;
    }
    if (!explicit) {
      const trimmed = value.trim();
      if (!trimmed) {
        setError("Enter an amount such as 1850.00.");
        return false;
      }
      const parsed = parseCurrencyInput(trimmed);
      if (!parsed.ok || parsed.value <= 0) {
        setError("Enter an amount such as 1850.00. Nothing was saved for this field.");
        return false;
      }
      amount = parsed.value;
    }
    setError(null);
    if (
      !explicit &&
      amount === saved &&
      !["failed", "saving"].includes(context!.states[field]?.phase ?? "idle")
    ) {
      if (editor.confirmed(generation)) setDirty(false);
      return true;
    }
    // S250 R-S250-7: a rent adopted from a standing agreement names the rule version it came from,
    // so a later rule change reads "Built on the earlier rule" instead of changing it.
    const standing = prefill?.standing;
    const options =
      explicit?.options ??
      (prefill && !editor.dirty() && amount === prefill.value
        ? standing
          ? {
              origin: "adopted_source" as const,
              sourceLabel: standingRuleSourceLabel(standing.name, standing.policyVersion),
              context: standingRuleContext(standing),
            }
          : {
              origin: "adopted_source" as const,
              sourceLabel: `Pricing policy v${prefill.policyVersion}`,
              context: `${prefill.policyId}: ${prefill.reason}`.slice(0, 1000),
            }
        : undefined);
    const ok = await context!.save(field, amount, {
      ...options,
      editorVersion: generation,
    });
    if (ok && editor.confirmed(generation)) {
      command.current = null;
      setDirty(false);
    }
    return ok;
  }
  useLayoutEffect(() => {
    editor.commit(() => commit());
  });
  if (!context) return null;
  function explicitValue(value: number | null, options?: SaveOptions) {
    editor.edited(value === null ? "" : String(value), { value, options });
    command.current = { value, options };
    setText(value === null ? "" : String(value));
    setDirty(true);
    setError(null);
    void editor.flush();
  }

  return (
    <div className="working-field" data-working-field={field}>
      <Field error={error ?? undefined} hint={hint} htmlFor={`${id}-input`} label={title}>
        <input
          disabled={!context.canEdit}
          id={`${id}-input`}
          inputMode="decimal"
          ref={input}
          onBlur={(event) => {
            if (!isRenewalPresentationMove(event.relatedTarget)) void editor.flush();
          }}
          onChange={(event) => {
            const value = event.target.value;
            command.current = null;
            editor.edited(value);
            editor.commit(() => commit(value));
            setText(value);
            setDirty(true);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void editor.flush();
          }}
          value={displayText}
        />
      </Field>
      {prefill && !entry && prefill.standing ? (
        <p className="muted">
          Prefilled from {prefill.standing.name}, rule v{prefill.standing.policyVersion}.{" "}
          {prefill.standing.basis} This amount is saved when you leave or submit the
          field.
        </p>
      ) : prefill && !entry ? (
        <p className="muted">
          Prefilled from policy v{prefill.policyVersion}. {prefill.reason} This amount is
          saved when you leave or submit the field.
        </p>
      ) : null}
      <AutosaveStatus
        onRetry={() => void editor.flush()}
        state={withEdited(state, dirty)}
        subject={title}
      />
      {attribution(entry) ? (
        <p className="muted working-field-attribution">{attribution(entry)}</p>
      ) : null}
      {source ? (
        <p className="working-field-source" data-working-differs={differs || undefined}>
          {source.label}:{" "}
          {typeof source.value === "number" ? USD.format(source.value) : source.value}
          {differs
            ? ` · differs from the working value ${USD.format(saved!)}. The working value stays until you change it.`
            : null}
        </p>
      ) : null}
      {context.canEdit ? (
        <div className="working-field-actions">
          {sourceAmount !== null && sourceAmount !== saved ? (
            <Button
              onClick={() =>
                explicitValue(sourceAmount, {
                  origin: "adopted_source",
                  sourceLabel: source!.label,
                })
              }
              size="compact"
              variant="tertiary"
            >
              Use the {source!.label} value
            </Button>
          ) : null}
          {saved !== null ? (
            <Button onClick={() => explicitValue(null)} size="compact" variant="tertiary">
              Clear the working value
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** One autosaved working date. A complete, valid date saves as soon as it is chosen. */
export function WorkingDateField({ field, label, hint }: WorkingFieldProps) {
  const context = useRenewalWorkingRecord();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const editor = useWorkingFieldEditor(context, field, input);
  const clear = useRef(false);
  const entry = workingEntry(context?.record, field);
  const saved = typeof entry?.value === "string" ? entry.value : null;
  const [text, setText] = useState(saved ?? "");
  const [dirtyLocal, setDirty] = useState(false);
  const draft = editor.draft();
  const dirty = editor.shared ? draft !== null : dirtyLocal;
  const shown = draft?.text ?? (editor.shared ? (saved ?? "") : text);
  const [seenRevision, setSeenRevision] = useState(entry?.revision ?? 0);
  if ((entry?.revision ?? 0) !== seenRevision) {
    setSeenRevision(entry?.revision ?? 0);
    if (!dirty) setText(saved ?? "");
  }
  const title = label ?? workingFieldLabel(field);
  const state = context?.states[field] ?? AUTOSAVE_IDLE;

  async function commit(value = shown): Promise<boolean> {
    if (editor.shared) value = editor.draft()?.text ?? value;
    if (!editor.dirty()) return true;
    const generation = editor.version();
    const clearing = editor.shared
      ? editor.draft()?.command?.value === null
      : clear.current;
    // A partly typed date is not a date yet: it stays in the control and saves nothing.
    if (!clearing && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    if (
      !clearing &&
      value === saved &&
      !["failed", "saving"].includes(context!.states[field]?.phase ?? "idle")
    ) {
      if (editor.confirmed(generation)) setDirty(false);
      return true;
    }
    const ok = await context!.save(field, clearing ? null : value, {
      ...editor.draft()?.command?.options,
      editorVersion: generation,
    });
    if (ok && editor.confirmed(generation)) {
      clear.current = false;
      setDirty(false);
    }
    return ok;
  }
  useLayoutEffect(() => {
    editor.commit(() => commit());
  });
  if (!context) return null;

  return (
    <div className="working-field" data-working-field={field}>
      <Field hint={hint} htmlFor={`${id}-input`} label={title}>
        <input
          disabled={!context.canEdit}
          id={`${id}-input`}
          ref={input}
          onBlur={(event) => {
            if (!isRenewalPresentationMove(event.relatedTarget)) void editor.flush();
          }}
          onChange={(event) => {
            const value = event.target.value;
            clear.current = false;
            editor.edited(value);
            editor.commit(() => commit(value));
            setText(value);
            setDirty(true);
            void editor.flush();
          }}
          type="date"
          value={shown}
        />
      </Field>
      <AutosaveStatus
        onRetry={() => void editor.flush()}
        state={withEdited(state, dirty)}
        subject={title}
      />
      {attribution(entry) ? (
        <p className="muted working-field-attribution">
          {saved ? `${formatCalendarDate(saved)}. ` : ""}
          {attribution(entry)}
        </p>
      ) : null}
      {context.canEdit && saved !== null ? (
        <div className="working-field-actions">
          <Button
            onClick={() => {
              clear.current = true;
              editor.edited("", { value: null });
              setText("");
              setDirty(true);
              void editor.flush();
            }}
            size="compact"
            variant="tertiary"
          >
            Clear the working value
          </Button>
        </div>
      ) : null}
    </div>
  );
}
