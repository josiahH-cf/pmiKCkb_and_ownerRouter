"use client";

import { useEffect, useId, useRef, useState } from "react";

// S114: exact whole-value and one-audience copy over the projected lease facts. A copy never
// logs, persists or sends anything; a refused clipboard keeps the selectable value on screen and
// reports that honestly. Copying staff-visible details is not recipient approval or delivery.

type CopyState =
  | { kind: "idle" }
  | { kind: "copied"; detail: string }
  | { kind: "denied" }
  | { kind: "unavailable"; detail: string };

const DENIED_COPY =
  "Clipboard access was denied. Select the highlighted value and copy it yourself; nothing was recorded.";
const COPIED_RESET_MS = 4000;

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function useCopyState() {
  const [state, setState] = useState<CopyState>({ kind: "idle" });
  const timerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );
  function report(next: CopyState) {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setState(next);
    if (next.kind === "copied") {
      timerRef.current = window.setTimeout(
        () => setState({ kind: "idle" }),
        COPIED_RESET_MS,
      );
    }
  }
  return [state, report] as const;
}

function CopyStatus({ id, state }: Readonly<{ id: string; state: CopyState }>) {
  const visible = state.kind === "denied" || state.kind === "unavailable";
  return (
    <span className={visible ? "renewal-copy-status" : "sr-only"} id={id} role="status">
      {state.kind === "copied"
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
  const [state, report] = useCopyState();
  const statusId = useId();
  return (
    <span className="renewal-copy-field">
      <span className="renewal-copy-value">{value}</span>
      <button
        aria-describedby={state.kind === "idle" ? undefined : statusId}
        aria-label={`Copy ${label}: ${value}`}
        className="renewal-copy-button"
        onClick={async () => {
          report(
            (await writeClipboard(value))
              ? { kind: "copied", detail: `${label} copied.` }
              : { kind: "denied" },
          );
        }}
        type="button"
      >
        {state.kind === "copied" ? "Copied" : "Copy"}
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
  const [state, report] = useCopyState();
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
    report(
      (await writeClipboard(text))
        ? {
            kind: "copied",
            detail: `Copied ${count(`${audience} email`, withEmail.length)}.${missingNote}`,
          }
        : { kind: "denied" },
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
    report(
      (await writeClipboard(text))
        ? {
            kind: "copied",
            detail: `Copied ${count(`${audience} name`, parties.length)} with any email on file.${missingNote}`,
          }
        : { kind: "denied" },
    );
  }

  return (
    <div className="renewal-copy-audience">
      <button
        aria-describedby={state.kind === "idle" ? undefined : statusId}
        className="secondary-button renewal-workspace-link"
        onClick={copyEmails}
        type="button"
      >
        Copy all {audience} emails
      </button>
      <button
        aria-describedby={state.kind === "idle" ? undefined : statusId}
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
