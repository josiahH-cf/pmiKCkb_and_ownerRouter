"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

// S157/S156/S155: the lease-bound working record on the lease page. Each working field saves on
// its own when it is complete and valid; an unfinished or invalid field stays in its control and
// blocks nothing else. Saving is application persistence only: no provider is read or written.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
}

interface WorkingRecordContextValue {
  readonly leaseId: string;
  readonly canEdit: boolean;
  /** True when the saved record could not be read; entries stay local until it reads back. */
  readonly readUnavailable: boolean;
  readonly record: RenewalWorkingRecord | null;
  readonly states: Readonly<Record<string, AutosaveState>>;
  readonly save: (
    field: string,
    value: WorkingValue | null,
    options?: SaveOptions,
  ) => Promise<boolean>;
  readonly reload: () => Promise<void>;
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
    recordRef.current = record;
  }, [record]);
  const pending = useRef(new Map<string, PendingSave>());
  const sequence = useRef(new Map<string, number>());

  const setState = useCallback((field: string, state: AutosaveState) => {
    setStates((current) => ({ ...current, [field]: state }));
  }, []);

  const reload = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/lease-renewal/working-record?leaseId=${encodeURIComponent(leaseId)}`,
      );
      const value = (await response.json()) as { record?: RenewalWorkingRecord | null };
      if (!response.ok) return;
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
          // A refused request was never stored, so the same entry can be saved under a new request.
          if (pending.current.get(field)?.operationId === save.operationId)
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
      const next: PendingSave =
        prior?.key === key ? prior : { key, operationId: crypto.randomUUID(), body };
      pending.current.set(field, next);
      return send(field, next);
    },
    [canEdit, leaseId, send],
  );

  const value = useMemo(
    () => ({ leaseId, canEdit, readUnavailable, record, states, save, reload }),
    [leaseId, canEdit, readUnavailable, record, states, save, reload],
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
  const entry = workingEntry(context?.record, field);
  const saved = typeof entry?.value === "number" ? entry.value : null;
  const [text, setText] = useState(saved === null ? "" : String(saved));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Adopt a newer saved value only while this control holds no unsaved typing.
  const [seenRevision, setSeenRevision] = useState(entry?.revision ?? 0);
  if ((entry?.revision ?? 0) !== seenRevision) {
    setSeenRevision(entry?.revision ?? 0);
    if (!dirty) setText(saved === null ? "" : String(saved));
  }
  if (!context) return null;
  const title = label ?? workingFieldLabel(field);
  const state = context.states[field] ?? AUTOSAVE_IDLE;
  const sourceAmount = typeof source?.value === "number" ? source.value : null;
  const differs = saved !== null && sourceAmount !== null && saved !== sourceAmount;

  const prefill =
    field === "terms_rent" && !entry ? (pricing?.view?.prefill ?? null) : null;
  const displayText = !dirty && saved === null && prefill ? String(prefill.value) : text;
  async function commit() {
    const trimmed = displayText.trim();
    if (!trimmed) {
      setError(null);
      setDirty(false);
      setText(saved === null ? "" : String(saved));
      return;
    }
    const parsed = parseCurrencyInput(trimmed);
    if (!parsed.ok || parsed.value <= 0) {
      setError("Enter an amount such as 1850.00. Nothing was saved for this field.");
      return;
    }
    setError(null);
    if (parsed.value === saved) {
      setDirty(false);
      return;
    }
    const options =
      prefill && !dirty && parsed.value === prefill.value
        ? {
            origin: "adopted_source" as const,
            sourceLabel: `Pricing policy v${prefill.policyVersion}`,
            context: `${prefill.policyId}: ${prefill.reason}`.slice(0, 1000),
          }
        : undefined;
    if (await context!.save(field, parsed.value, options)) setDirty(false);
  }

  return (
    <div className="working-field" data-working-field={field}>
      <Field error={error ?? undefined} hint={hint} htmlFor={`${id}-input`} label={title}>
        <input
          disabled={!context.canEdit}
          id={`${id}-input`}
          inputMode="decimal"
          onBlur={() => void commit()}
          onChange={(event) => {
            setText(event.target.value);
            setDirty(true);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void commit();
          }}
          value={displayText}
        />
      </Field>
      {prefill && !entry ? (
        <p className="muted">
          Prefilled from policy v{prefill.policyVersion}. {prefill.reason} This amount is
          saved when you leave or submit the field.
        </p>
      ) : null}
      <AutosaveStatus
        onRetry={() => void commit()}
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
                void context
                  .save(field, sourceAmount, {
                    origin: "adopted_source",
                    sourceLabel: source!.label,
                  })
                  .then((ok) => {
                    if (ok) {
                      setDirty(false);
                      setText(String(sourceAmount));
                    }
                  })
              }
              size="compact"
              variant="tertiary"
            >
              Use the {source!.label} value
            </Button>
          ) : null}
          {saved !== null ? (
            <Button
              onClick={() =>
                void context.save(field, null).then((ok) => {
                  if (ok) {
                    setDirty(false);
                    setText("");
                  }
                })
              }
              size="compact"
              variant="tertiary"
            >
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
  const entry = workingEntry(context?.record, field);
  const saved = typeof entry?.value === "string" ? entry.value : null;
  const [text, setText] = useState(saved ?? "");
  const [dirty, setDirty] = useState(false);
  const [seenRevision, setSeenRevision] = useState(entry?.revision ?? 0);
  if ((entry?.revision ?? 0) !== seenRevision) {
    setSeenRevision(entry?.revision ?? 0);
    if (!dirty) setText(saved ?? "");
  }
  if (!context) return null;
  const title = label ?? workingFieldLabel(field);
  const state = context.states[field] ?? AUTOSAVE_IDLE;

  async function commit(value: string) {
    // A partly typed date is not a date yet: it stays in the control and saves nothing.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value === saved) return;
    if (await context!.save(field, value)) setDirty(false);
  }

  return (
    <div className="working-field" data-working-field={field}>
      <Field hint={hint} htmlFor={`${id}-input`} label={title}>
        <input
          disabled={!context.canEdit}
          id={`${id}-input`}
          onBlur={() => void commit(text)}
          onChange={(event) => {
            setText(event.target.value);
            setDirty(true);
            void commit(event.target.value);
          }}
          type="date"
          value={text}
        />
      </Field>
      <AutosaveStatus
        onRetry={() => void commit(text)}
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
            onClick={() =>
              void context.save(field, null).then((ok) => {
                if (ok) {
                  setDirty(false);
                  setText("");
                }
              })
            }
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
