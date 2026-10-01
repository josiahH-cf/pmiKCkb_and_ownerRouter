"use client";

import { useState } from "react";
import {
  ANTICIPATION_CAPTION,
  ConsoleAnticipatedWork,
} from "@/components/console/ConsoleAnticipatedWork";
import type { AnticipatedWorkGroup } from "@/lib/anticipation/projection";

interface AnticipatedWorkResponse {
  readonly status: "ok" | "unavailable";
  readonly groups: readonly AnticipatedWorkGroup[];
  readonly canStart: boolean;
  readonly startableDefinitionIds: readonly string[];
}

type SectionState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly data: AnticipatedWorkResponse };

/**
 * S147: Internal Processes' Anticipated work lane, beside each process's Start run (owner decision
 * 2026-10-01). It is computed only when someone asks, from the read-only renewal desk and the
 * default notice rules, so opening Internal Processes never waits on the live renewal read.
 */
export function AnticipatedWorkSection() {
  const [state, setState] = useState<SectionState>({ kind: "idle" });

  async function compute() {
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/anticipated-work", { cache: "no-store" });
      if (!response.ok) throw new Error("anticipated_work_failed");
      const data = (await response.json()) as AnticipatedWorkResponse;
      setState(data.status === "ok" ? { kind: "ready", data } : { kind: "failed" });
    } catch {
      setState({ kind: "failed" });
    }
  }

  if (state.kind === "ready") {
    return (
      <ConsoleAnticipatedWork
        canStart={state.data.canStart}
        groups={state.data.groups}
        startableDefinitionIds={new Set(state.data.startableDefinitionIds)}
      />
    );
  }

  return (
    <section aria-label="Anticipated work" className="console-anticipated">
      <h2 className="console-strip-title">Anticipated work</h2>
      <p className="muted">
        See the renewal work coming up across the owner-named processes, with Start run
        beside each one.
      </p>
      {state.kind === "failed" ? (
        <p className="muted" role="status">
          Anticipated work could not be computed just now. The renewal source did not
          answer.
        </p>
      ) : null}
      <button
        aria-busy={state.kind === "loading" ? "true" : undefined}
        className="secondary-button"
        disabled={state.kind === "loading"}
        onClick={() => void compute()}
        type="button"
      >
        {state.kind === "loading"
          ? "Computing…"
          : state.kind === "failed"
            ? "Try again"
            : "Show anticipated work"}
      </button>
      <p className="muted console-anticipated-caption">{ANTICIPATION_CAPTION}</p>
    </section>
  );
}
