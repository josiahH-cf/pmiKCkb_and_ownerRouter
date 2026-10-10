"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { boundedLocalWait } from "@/lib/ui/local-lifetime";

// S114: exact whole-value and one-audience copy over the projected lease facts. A copy never
// logs, persists or sends anything; a refused clipboard keeps the selectable value on screen and
// reports that honestly. Copying staff-visible details is not recipient approval or delivery.

type CopyState =
  | { kind: "idle" }
  | { kind: "copying" }
  | { kind: "copied"; detail: string }
  | { kind: "denied" }
  | { kind: "unavailable"; detail: string };

const DENIED_COPY =
  "Copy was not confirmed. Select the displayed value and copy it yourself; nothing was recorded.";
const COPIED_RESET_MS = 4000;

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    await boundedLocalWait(navigator.clipboard.writeText(text));
    return true;
  } catch {
    return false;
  }
}

function useCopyState(scope: string) {
  const [result, setResult] = useState<{ scope: string; state: CopyState }>({
    scope,
    state: { kind: "idle" },
  });
  const state: CopyState = result.scope === scope ? result.state : { kind: "idle" };
  const timerRef = useRef<number | null>(null);
  const owner = useRef({ live: true, generation: 0, scope, pending: false });
  useLayoutEffect(() => {
    const current = owner.current;
    current.live = true;
    current.scope = scope;
    current.generation += 1;
    current.pending = false;
    return () => {
      current.live = false;
      current.generation += 1;
      current.pending = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [scope]);
  function report(next: CopyState, generation = owner.current.generation) {
    if (!owner.current.live || owner.current.generation !== generation) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setResult({ scope: owner.current.scope, state: next });
    if (next.kind === "copied") {
      timerRef.current = window.setTimeout(() => {
        if (owner.current.live && owner.current.generation === generation)
          setResult({ scope: owner.current.scope, state: { kind: "idle" } });
      }, COPIED_RESET_MS);
    }
  }
  async function copy(text: string, detail: string) {
    if (owner.current.pending) return;
    owner.current.pending = true;
    const generation = ++owner.current.generation;
    report({ kind: "copying" }, generation);
    const copied = await writeClipboard(text);
    if (
      !owner.current.live ||
      owner.current.generation !== generation ||
      owner.current.scope !== scope
    )
      return;
    owner.current.pending = false;
    report(copied ? { kind: "copied", detail } : { kind: "denied" }, generation);
  }
  return [state, copy, report] as const;
}

function CopyStatus({ id, state }: Readonly<{ id: string; state: CopyState }>) {
  const visible = state.kind === "denied" || state.kind === "unavailable";
  return (
    <span className={visible ? "renewal-copy-status" : "sr-only"} id={id} role="status">
      {state.kind === "copying"
        ? "Copying…"
        : state.kind === "copied"
          ? state.detail
          : state.kind === "denied"
            ? DENIED_COPY
            : state.kind === "unavailable"
              ? state.detail
              : ""}
    </span>
  );
}

/** One separately selectable value with an explicit copy control beside it. */
export function RenewalCopyValue({
  label,
  value,
}: Readonly<{
  /** Plain business label such as `tenant email`; combined with the value for the control name. */
  label: string;
  value: string;
}>) {
  const [state, copy] = useCopyState(`${label}:${value}`);
  const statusId = useId();
  return (
    <span className="renewal-copy-field">
      <span className="renewal-copy-value">{value}</span>
      <button
        aria-busy={state.kind === "copying" || undefined}
        disabled={state.kind === "copying"}
        aria-describedby={state.kind === "idle" ? undefined : statusId}
        aria-label={`Copy ${label}: ${value}`}
        className="renewal-copy-button"
        onClick={() => void copy(value, `${label} copied.`)}
        type="button"
      >
        <Icon name={state.kind === "copied" ? "check" : "copy"} size={16} />
        <span className="sr-only">{state.kind === "copied" ? "Copied" : "Copy"}</span>
      </button>
      <CopyStatus id={statusId} state={state} />
    </span>
  );
}

export interface RenewalCopyableParty {
  readonly label: string;
  readonly email?: string;
}

function count(noun: string, total: number): string {
  return `${total} ${noun}${total === 1 ? "" : "s"}`;
}

/**
 * Copy every address, or every name with its address, for exactly one audience. Parties without a
 * source-backed address are named in the result and the status; they are never invented or dropped.
 */
export function RenewalCopyAudience({
  audience,
  parties,
}: Readonly<{
  audience: "owner" | "tenant";
  parties: readonly RenewalCopyableParty[];
}>) {
  const [state, copy, report] = useCopyState(`${audience}:${JSON.stringify(parties)}`);
  const statusId = useId();
  const withEmail = parties.filter((party) => Boolean(party.email));
  const missing = parties.length - withEmail.length;
  const missingNote = missing
    ? ` ${count(audience, missing)} ${missing === 1 ? "has" : "have"} no email on file.`
    : "";

  async function copyEmails() {
    const text = withEmail.map((party) => party.email).join(", ");
    if (text === "") {
      report({
        kind: "unavailable",
        detail: `No ${audience} email is on file to copy.${missingNote}`,
      });
      return;
    }
    await copy(
      text,
      `Copied ${count(`${audience} email`, withEmail.length)}.${missingNote}`,
    );
  }

  async function copyNamesAndEmails() {
    const text = parties
      .map((party) =>
        party.email
          ? `${party.label} <${party.email}>`
          : `${party.label} (no email on file)`,
      )
      .join("\n");
    if (text === "") {
      report({ kind: "unavailable", detail: `No ${audience} is on file to copy.` });
      return;
    }
    await copy(
      text,
      `Copied ${count(`${audience} name`, parties.length)} with any email on file.${missingNote}`,
    );
  }

  return (
    <div className="renewal-copy-audience">
      <button
        aria-describedby={state.kind === "idle" ? undefined : statusId}
        aria-busy={state.kind === "copying" || undefined}
        disabled={state.kind === "copying"}
        className="secondary-button renewal-workspace-link"
        onClick={copyEmails}
        type="button"
      >
        Copy all {audience} emails
      </button>
      <button
        aria-describedby={state.kind === "idle" ? undefined : statusId}
        aria-busy={state.kind === "copying" || undefined}
        disabled={state.kind === "copying"}
        className="secondary-button renewal-workspace-link"
        onClick={copyNamesAndEmails}
        type="button"
      >
        Copy all {audience} names and emails
      </button>
      <CopyStatus id={statusId} state={state} />
    </div>
  );
}
