"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { renewalBatchMonthInWords } from "@/lib/lease-renewal/renewal-batch";
import { KICKOFF_WORDS } from "@/lib/lease-renewal/renewal-preparation";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";

export const KICKOFF_PREPARATION_ROUTE = "/api/lease-renewal/kickoff-preparation";
const OPERATIONS_KEY = "pmi-kc:renewal-kickoff:operations";

export interface KickoffTarget {
  readonly leaseId: string;
  readonly address: string;
  readonly cycleDateIso: string | null;
}

export interface KickoffPreparationProps {
  readonly month: string;
  readonly targets: readonly KickoffTarget[];
  readonly canPrepare: boolean;
  readonly sourceCurrent?: boolean;
}

function rememberedOperations(): Record<string, string> {
  try {
    const raw = window.sessionStorage.getItem(OPERATIONS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** One operation id per lease and cycle, kept for the visit, so a retried request is the same one. */
function operationFor(target: KickoffTarget): string {
  const key = `${target.leaseId}:${target.cycleDateIso ?? "none"}`;
  const known = rememberedOperations();
  if (known[key]) return known[key]!;
  const id = crypto.randomUUID();
  try {
    window.sessionStorage.setItem(
      OPERATIONS_KEY,
      JSON.stringify({ ...known, [key]: id }),
    );
  } catch {
    // Storage can be unavailable; the server's claim still prevents a second lookup.
  }
  return id;
}

interface LeaseOutcome {
  readonly leaseId: string;
  readonly address: string;
  readonly status: string;
  readonly message: string;
}

type RunState =
  | { readonly phase: "idle" | "done" }
  | {
      readonly phase: "running";
      readonly index: number;
      readonly total: number;
      readonly address: string;
    };

let activeLoop = false;

/** A foreground click takes a snapshot of its month and target list. */
export function RenewalKickoffPreparation({
  month,
  targets,
  canPrepare,
  sourceCurrent = true,
}: KickoffPreparationProps) {
  const router = useRouter();
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const [outcomes, setOutcomes] = useState<LeaseOutcome[]>([]);
  const [continued, setContinued] = useState(false);
  const monthName = renewalBatchMonthInWords(month);
  const progressKey = `${OPERATIONS_KEY}:${month}`;
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      try {
        setContinued(window.sessionStorage.getItem(progressKey) === "started");
      } catch {
        // The per-cycle claim still handles a repeat if storage is unavailable.
      }
    });
    return () => controller.abort();
  }, [progressKey]);

  async function prepare() {
    const signal = lifetime.current?.signal;
    if (
      !signal ||
      signal.aborted ||
      activeLoop ||
      !canPrepare ||
      !sourceCurrent ||
      targets.length === 0
    )
      return;
    activeLoop = true;
    setOutcomes([]);
    try {
      try {
        window.sessionStorage.setItem(progressKey, "started");
      } catch {
        // The current request still has a durable claim on the server.
      }
      for (const [index, target] of targets.entries()) {
        if (signal.aborted) break;
        setRun({
          phase: "running",
          index: index + 1,
          total: targets.length,
          address: target.address,
        });
        let status: string;
        let message: string;
        try {
          const response = await fetchWithDeadline(KICKOFF_PREPARATION_ROUTE, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              leaseId: target.leaseId,
              cycleDateIso: target.cycleDateIso,
              month,
              trigger: "staff",
              operationId: operationFor(target),
            }),
            signal,
          });
          const body = (await response.json().catch(() => null)) as {
            status?: string;
            message?: string;
            error?: string;
          } | null;
          status = body?.status ?? "failed";
          message =
            body?.message ??
            body?.error ??
            "Preparation did not answer. Continue to check the saved result.";
        } catch {
          if (signal.aborted) break;
          status = "failed";
          message = "The response did not arrive. Continue to check the saved result.";
        }
        if (signal.aborted) break;
        setOutcomes((previous) => [
          ...previous,
          { leaseId: target.leaseId, address: target.address, status, message },
        ]);
      }
    } finally {
      activeLoop = false;
      if (!signal.aborted) {
        setRun({ phase: "done" });
        setContinued(true);
        router.refresh();
      }
    }
  }

  return (
    <section
      aria-label="Batch preparation"
      className="ui-stack-tight"
      data-kickoff-targets={targets.length}
    >
      {canPrepare ? (
        <Button
          busy={run.phase === "running"}
          busyLabel={`Preparing ${monthName}…`}
          data-kickoff-prepare
          disabled={!sourceCurrent || targets.length === 0}
          onClick={() => void prepare()}
          size="compact"
          variant="secondary"
        >
          {continued
            ? `Continue ${monthName} preparation`
            : `Prepare ${monthName} leases`}
        </Button>
      ) : null}
      {!sourceCurrent && canPrepare ? (
        <p role="status">Refresh data before preparing {monthName} leases.</p>
      ) : null}
      {run.phase === "running" ? (
        <p data-kickoff-progress role="status">
          Preparing {monthName}, {run.index} of {run.total}: {run.address}
        </p>
      ) : null}
      {run.phase === "done" ? (
        <p data-kickoff-progress role="status">
          Preparation finished for {monthName}.
        </p>
      ) : null}
      {outcomes.length > 0 ? (
        <ul
          aria-label="Preparation results"
          className="renewal-batch-preparation-results"
        >
          {outcomes.map((entry) => (
            <li data-kickoff-outcome={entry.status} key={entry.leaseId}>
              {entry.address}: {entry.message}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * R-S249-3: a single unprepared lease offers the same one action on its Now card. A staff click
 * only; the server applies the same claim, allowance and verification fences.
 */
export function PrepareThisLeaseButton({
  leaseId,
  canPrepare,
}: Readonly<{ leaseId: string; canPrepare: boolean }>) {
  const router = useRouter();
  const working = useRenewalWorkingRecord();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  if (!canPrepare) return null;
  async function run() {
    if (inFlight.current) return;
    if (working?.hasUnsettled?.(["terms_rent"])) {
      setMessage(
        "Wait for the current recommended rent to save, then prepare the lease.",
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetchWithDeadline(KICKOFF_PREPARATION_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leaseId,
          trigger: "staff",
          operationId: operationFor({ leaseId, address: "", cycleDateIso: null }),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      setMessage(body?.message ?? body?.error ?? "The preparation did not answer.");
      router.refresh();
    } catch {
      setMessage(
        "The response did not arrive. Choosing it again is safe: the lease is never looked up twice.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        busy={busy}
        busyLabel="Preparing…"
        disabled={busy}
        onClick={() => void run()}
        size="compact"
        variant="secondary"
      >
        {KICKOFF_WORDS.prepareLease}
      </Button>
      {message ? <span role="status">{message}</span> : null}
    </>
  );
}
