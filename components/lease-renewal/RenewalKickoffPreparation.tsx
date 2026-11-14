"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { renewalBatchMonthInWords } from "@/lib/lease-renewal/renewal-batch";
import { KICKOFF_WORDS } from "@/lib/lease-renewal/renewal-preparation";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";
import type { PreparationAllowanceCount } from "@/lib/lease-renewal/kickoff-facts";
import {
  PREPARATION_NOT_RUN,
  preparationScope,
  preparationScopeLine,
  preparationSettled,
  prepareButtonLabel,
  type PreparationTarget,
} from "@/lib/lease-renewal/preparation-scope";

export const KICKOFF_PREPARATION_ROUTE = "/api/lease-renewal/kickoff-preparation";
const OPERATIONS_KEY = "pmi-kc:renewal-kickoff:operations";

export type KickoffTarget = PreparationTarget;

export interface KickoffPreparationProps {
  readonly month: string;
  /**
   * S283 R-S283-2: the selected month's eligible leases the table shows under the active filters
   * and search, each with its server-resolved lease and cycle. A click prepares exactly these.
   */
  readonly targets: readonly KickoffTarget[];
  /** The month's eligible leases with nothing filtered; defaults to the targets shown. */
  readonly monthTotal?: number;
  /** The read-only monthly allowance count (counts only); null when it could not be read. */
  readonly allowance?: PreparationAllowanceCount | null;
  readonly canPrepare: boolean;
  readonly sourceCurrent?: boolean;
}

/** S283 R-S283-2: the run a click started, kept for the visit so Continue rechecks the same targets. */
interface StoredRun {
  readonly targets: readonly KickoffTarget[];
  readonly settled: readonly string[];
}

function runKey(month: string): string {
  return `${OPERATIONS_KEY}:${month}:run`;
}

function readStoredRun(month: string): StoredRun | null {
  try {
    const raw = window.sessionStorage.getItem(runKey(month));
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredRun> | null) : null;
    if (
      !parsed ||
      !Array.isArray(parsed.targets) ||
      !Array.isArray(parsed.settled) ||
      !parsed.targets.every(
        (target) =>
          target &&
          typeof target.leaseId === "string" &&
          typeof target.address === "string" &&
          (target.cycleDateIso === null || typeof target.cycleDateIso === "string"),
      )
    )
      return null;
    return {
      targets: parsed.targets.map((target) => ({
        leaseId: target.leaseId,
        address: target.address,
        cycleDateIso: target.cycleDateIso,
      })),
      settled: parsed.settled.filter((id): id is string => typeof id === "string"),
    };
  } catch {
    return null;
  }
}

function writeStoredRun(month: string, run: StoredRun) {
  try {
    window.sessionStorage.setItem(runKey(month), JSON.stringify(run));
  } catch {
    // Storage can be unavailable; the server's per-cycle claim still prevents a second lookup.
  }
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

/**
 * A foreground click takes a snapshot of its month and target list. S283 R-S283-2: the list is
 * the month's eligible leases the table shows; the button and one line state the count, the
 * comparisons needed and the allowance before the click; changing the filter or the month after
 * the click never retargets the run; Continue rechecks the remaining targets of that same run; and
 * once the server answers that the allowance is reached the run posts nothing more and lists the
 * rest as not run.
 */
export function RenewalKickoffPreparation({
  month,
  targets,
  monthTotal,
  allowance,
  canPrepare,
  sourceCurrent = true,
}: KickoffPreparationProps) {
  const router = useRouter();
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const [outcomes, setOutcomes] = useState<LeaseOutcome[]>([]);
  const [continued, setContinued] = useState(false);
  const [stopped, setStopped] = useState(false);
  const monthName = renewalBatchMonthInWords(month);
  const progressKey = `${OPERATIONS_KEY}:${month}`;
  const scope = preparationScope({ shownTargets: targets, monthTotal, allowance });
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    let controller = new AbortController();
    lifetime.current = controller;
    const readContinuation = () => {
      try {
        setContinued(window.sessionStorage.getItem(progressKey) === "started");
      } catch {
        // The per-cycle claim still handles a repeat if storage is unavailable.
      }
    };
    queueMicrotask(() => {
      if (!controller.signal.aborted) readContinuation();
    });
    // A hard navigation can reject fetch before React unmount cleanup. Stop this foreground
    // loop at the page-exit event so that rejection cannot dispatch the next lease. This stops
    // local waiting only; an admitted server operation still owns its original claim.
    const restoreIdle = () => {
      controller = new AbortController();
      lifetime.current = controller;
      setRun({ phase: "idle" });
      readContinuation();
    };
    const leavePage = () => {
      controller.abort();
      // The old loop retains its aborted signal. A canceled navigation can still offer an
      // explicit Continue with the saved operation, rather than leaving the current page busy.
      restoreIdle();
    };
    const returnToPage = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      controller.abort();
      restoreIdle();
      // A BFCache return is passive. Only a new Continue click may recover the saved operation.
    };
    window.addEventListener("beforeunload", leavePage);
    window.addEventListener("pagehide", leavePage);
    window.addEventListener("pageshow", returnToPage);
    return () => {
      window.removeEventListener("beforeunload", leavePage);
      window.removeEventListener("pagehide", leavePage);
      window.removeEventListener("pageshow", returnToPage);
      controller.abort();
    };
  }, [progressKey]);

  async function prepare() {
    const signal = lifetime.current?.signal;
    if (
      !signal ||
      signal.aborted ||
      activeLoop ||
      !canPrepare ||
      !sourceCurrent ||
      (targets.length === 0 && !continued)
    )
      return;
    // The run's targets are fixed at the click: a new click takes the leases shown now; Continue
    // takes the remaining targets of the same run (the server revalidates each one again).
    const stored = continued ? readStoredRun(month) : null;
    const remaining = stored
      ? stored.targets.filter((target) => !stored.settled.includes(target.leaseId))
      : [];
    const snapshot: readonly KickoffTarget[] = stored
      ? remaining.length > 0
        ? remaining
        : stored.targets
      : [...targets];
    if (snapshot.length === 0) return;
    const runTargets = stored ? stored.targets : snapshot;
    const settled = new Set(stored ? stored.settled : []);
    activeLoop = true;
    setOutcomes([]);
    setStopped(false);
    try {
      try {
        window.sessionStorage.setItem(progressKey, "started");
      } catch {
        // The current request still has a durable claim on the server.
      }
      writeStoredRun(month, { targets: runTargets, settled: [...settled] });
      for (const [index, target] of snapshot.entries()) {
        if (signal.aborted) break;
        setRun({
          phase: "running",
          index: index + 1,
          total: snapshot.length,
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
        if (preparationSettled(status)) {
          settled.add(target.leaseId);
          writeStoredRun(month, { targets: runTargets, settled: [...settled] });
        }
        setOutcomes((previous) => [
          ...previous,
          { leaseId: target.leaseId, address: target.address, status, message },
        ]);
        // S283 R-S283-2 (BEH-S283-3): at the allowance, post nothing more; list the rest as not run.
        if (status === "allowance_reached") {
          const rest = snapshot.slice(index + 1);
          if (rest.length > 0)
            setOutcomes((previous) => [
              ...previous,
              ...rest.map((left) => ({
                leaseId: left.leaseId,
                address: left.address,
                status: PREPARATION_NOT_RUN.status,
                message: PREPARATION_NOT_RUN.message,
              })),
            ]);
          setStopped(true);
          break;
        }
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

  const notRun = outcomes.filter(
    (entry) => entry.status === PREPARATION_NOT_RUN.status,
  ).length;
  return (
    <section
      aria-label="Batch preparation"
      className="ui-stack-tight"
      data-kickoff-targets={targets.length}
      data-kickoff-month-targets={scope.total}
    >
      {canPrepare ? (
        <Button
          busy={run.phase === "running"}
          busyLabel={`Preparing ${monthName}…`}
          data-kickoff-prepare
          disabled={!sourceCurrent || (targets.length === 0 && !continued)}
          onClick={() => void prepare()}
          size="compact"
          variant="secondary"
        >
          {continued
            ? `Continue ${monthName} preparation`
            : prepareButtonLabel(monthName, scope)}
        </Button>
      ) : null}
      {canPrepare ? (
        <p className="muted" data-kickoff-scope>
          {preparationScopeLine(scope)}
        </p>
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
          {stopped
            ? ` The monthly allowance is reached, so ${notRun} ${notRun === 1 ? "lease was" : "leases were"} not run.`
            : ""}
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
