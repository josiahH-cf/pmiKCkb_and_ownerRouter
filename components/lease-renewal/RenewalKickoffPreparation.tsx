"use client";

// S249 R-S249-3 / R-S249-4: batch preparation on the Renewals desk. "Prepare this batch" runs, for
// each lease in the working batch with no stored comparison for its cycle, the existing comparison
// lookup one lease at a time in the signed-in staff member's own session, with visible progress.
// A reload part-way is safe: the server's claim lets no lease and cycle be looked up twice without
// a staff member asking again, so running again picks up the leases still waiting.
//
// The automatic start (D-OP-1) is the ONLY code path that can call the preparation without a
// click. It starts once per page load, only when every client fence holds: the reviewed setting is
// on, the page is driven by a person (never `navigator.webdriver`, which Playwright, the release
// canary and the read-only smokes all set) unless the server says this process is the isolated
// rehearsal, and the page has been visible and idle for a moment. The server applies its own
// fences again for every lease.
//
// One loop per tab (C): a preparation loop belongs to the component that started it. It stops
// when that component unmounts (the staff member leaves the batch), sends nothing further, and
// never refreshes a page it no longer owns. Only one loop runs in a tab at a time: a remount waits
// for a stopping loop to end and then starts again from the server's own state (the targets the
// page was given, behind the server's per lease and cycle claim), never beside it.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, ConfirmationDialog } from "@/components/ui";
import { KICKOFF_WORDS } from "@/lib/lease-renewal/renewal-preparation";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";

export const KICKOFF_PREPARATION_ROUTE = "/api/lease-renewal/kickoff-preparation";
const OPERATIONS_KEY = "pmi-kc:renewal-kickoff:operations";
/** How long the page must stay visible and idle before the automatic start sends anything. */
export const AUTOMATIC_START_IDLE_MS = 1500;

export interface KickoffTarget {
  readonly leaseId: string;
  readonly address: string;
  readonly cycleDateIso: string | null;
}

export interface KickoffPreparationProps {
  /** The working batch's leases with no stored comparison for their cycle. */
  readonly targets: readonly KickoffTarget[];
  /** The account may run a comparison lookup (Editor or higher; never a verification identity). */
  readonly canPrepare: boolean;
  /** The reviewed automatic-start setting, as the server read it. */
  readonly automaticStart: {
    readonly enabled: boolean;
    readonly version: number;
    readonly canChange: boolean;
  } | null;
  /** True only when the server resolved the isolated rehearsal's stand-in for this process. */
  readonly rehearsal: boolean;
  /**
   * The batch was drawn from a current, complete RentVine read. An aging or incomplete read can
   * place a lease in the batch (or out of it) that the next read does not, so the automatic start
   * waits for a current one. Absent reads as current (a caller that does not say).
   */
  readonly sourceCurrent?: boolean;
}

/**
 * ARCH-S249-4 client fence (1): the automatic start may begin only when the setting is on, the
 * account may prepare, there is something to prepare, the batch was drawn from a current read,
 * and the page is not driven by automation unless the server named the process the isolated
 * rehearsal.
 */
export function automaticStartAllowed(input: {
  readonly enabled: boolean;
  readonly canPrepare: boolean;
  readonly targets: number;
  readonly webdriver: boolean;
  readonly rehearsal: boolean;
  readonly sourceCurrent?: boolean;
}): boolean {
  if (!input.enabled || !input.canPrepare || input.targets === 0) return false;
  if (input.sourceCurrent === false) return false;
  if (input.webdriver && !input.rehearsal) return false;
  return true;
}

/** How long a batch drawn from an aging read waits before it reads the desk again, and how often. */
export const CURRENT_READ_WAIT_MS = 2500;
export const CURRENT_READ_REFRESHES = 2;

/** ARCH-S249-4 client fence (3): resolve once the page has been visible and idle for a moment. */
export function waitUntilVisibleAndIdle(
  signal: AbortSignal,
  idleMs: number = AUTOMATIC_START_IDLE_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", restart);
      for (const name of ["pointerdown", "keydown", "wheel", "touchstart"] as const)
        window.removeEventListener(name, restart);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Stopped", "AbortError"));
    };
    function restart() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (document.visibilityState !== "visible") return;
      timer = setTimeout(() => {
        cleanup();
        resolve();
      }, idleMs);
    }
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    document.addEventListener("visibilitychange", restart);
    for (const name of ["pointerdown", "keydown", "wheel", "touchstart"] as const)
      window.addEventListener(name, restart, { passive: true });
    restart();
  });
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

/** The one preparation loop this tab runs; null when none runs (C). */
let tabLoop: Promise<void> | null = null;

/** Test seam: whether a preparation loop is running in this tab. */
export function preparationLoopRunning(): boolean {
  return tabLoop !== null;
}

interface LeaseOutcome {
  readonly leaseId: string;
  readonly address: string;
  readonly status: string;
  readonly message: string;
}

type RunState =
  | { readonly phase: "idle" }
  | {
      readonly phase: "running";
      readonly trigger: "staff" | "automatic";
      readonly index: number;
      readonly total: number;
      readonly address: string;
    }
  | {
      readonly phase: "done";
      readonly trigger: "staff" | "automatic";
      readonly stoppedAtAllowance: boolean;
    };

export function RenewalKickoffPreparation({
  targets,
  canPrepare,
  automaticStart,
  rehearsal,
  sourceCurrent = true,
}: KickoffPreparationProps) {
  const router = useRouter();
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const [outcomes, setOutcomes] = useState<LeaseOutcome[]>([]);
  const running = useRef(false);
  const started = useRef(false);
  // C: stopped when this component leaves the page, so its loop sends nothing further.
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
      if (lifetime.current === controller) lifetime.current = null;
    };
  }, []);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [settingNotice, setSettingNotice] = useState("");
  const [settingBusy, setSettingBusy] = useState(false);
  const confirmTrigger = useRef<HTMLButtonElement | null>(null);

  const prepare = useCallback(
    async (trigger: "staff" | "automatic", list: readonly KickoffTarget[]) => {
      const signal = lifetime.current?.signal;
      // One loop per tab, and only while this component is on the page.
      if (!signal || signal.aborted || running.current || tabLoop || list.length === 0)
        return;
      running.current = true;
      let finished!: () => void;
      tabLoop = new Promise<void>((resolve) => {
        finished = resolve;
      });
      setOutcomes([]);
      let stoppedAtAllowance = false;
      try {
        for (const [index, target] of list.entries()) {
          if (signal.aborted) break;
          setRun({
            phase: "running",
            trigger,
            index: index + 1,
            total: list.length,
            address: target.address,
          });
          let outcome: LeaseOutcome;
          try {
            const response = await fetchWithDeadline(KICKOFF_PREPARATION_ROUTE, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                leaseId: target.leaseId,
                trigger,
                operationId: operationFor(target),
              }),
              // Leaving the batch stops the wait here; the server finishes the one lookup it
              // claimed, and its claim keeps it from running twice.
              signal,
            });
            const body = (await response.json().catch(() => null)) as {
              status?: string;
              message?: string;
              error?: string;
            } | null;
            outcome = {
              leaseId: target.leaseId,
              address: target.address,
              status: body?.status ?? (response.ok ? "failed" : "refused"),
              message:
                body?.message ??
                body?.error ??
                "The preparation did not answer. Nothing was started twice.",
            };
          } catch {
            if (signal.aborted) break;
            outcome = {
              leaseId: target.leaseId,
              address: target.address,
              status: "failed",
              message:
                "The response did not arrive. Running the preparation again is safe: a lease is never looked up twice.",
            };
          }
          if (signal.aborted) break;
          setOutcomes((previous) => [...previous, outcome]);
          if (outcome.status === "allowance_reached") {
            // Nothing further is requested; the remaining leases read the allowance words.
            stoppedAtAllowance = true;
            for (const rest of list.slice(index + 1))
              setOutcomes((previous) => [
                ...previous,
                {
                  leaseId: rest.leaseId,
                  address: rest.address,
                  status: "allowance_reached",
                  message: KICKOFF_WORDS.allowanceReached,
                },
              ]);
            break;
          }
          // The automatic start stops at the first refusal of its own authority.
          if (trigger === "automatic" && outcome.status === "refused") break;
        }
      } finally {
        running.current = false;
        tabLoop = null;
        finished();
        // A page this component no longer owns is never refreshed by it.
        if (!signal.aborted) {
          setRun({ phase: "done", trigger, stoppedAtAllowance });
          router.refresh();
        }
      }
    },
    [router],
  );

  // R-S249-4: the automatic start. Once per page load, only behind every client fence.
  const targetKey = targets.map((target) => target.leaseId).join(",");
  const latestTargets = useRef(targets);
  useEffect(() => {
    latestTargets.current = targets;
  });
  // A batch drawn from an aging read waits: the read behind it is being replaced, so the page
  // reads the desk again (a bounded few times, while visible) and the start then runs on the
  // current batch. Nothing is sent from the aging one.
  const rereads = useRef(0);
  useEffect(() => {
    if (sourceCurrent || started.current || rereads.current >= CURRENT_READ_REFRESHES)
      return;
    const wouldStart = automaticStartAllowed({
      enabled: automaticStart?.enabled === true,
      canPrepare,
      targets: Math.max(1, latestTargets.current.length),
      webdriver: typeof navigator !== "undefined" && navigator.webdriver === true,
      rehearsal,
    });
    if (!wouldStart) return;
    const timer = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      rereads.current += 1;
      router.refresh();
    }, CURRENT_READ_WAIT_MS);
    return () => clearTimeout(timer);
  }, [sourceCurrent, automaticStart?.enabled, canPrepare, rehearsal, router]);
  useEffect(() => {
    if (started.current) return;
    const allowed = automaticStartAllowed({
      enabled: automaticStart?.enabled === true,
      canPrepare,
      targets: latestTargets.current.length,
      webdriver: typeof navigator !== "undefined" && navigator.webdriver === true,
      rehearsal,
      sourceCurrent,
    });
    if (!allowed) return;
    started.current = true;
    const controller = new AbortController();
    let begun = false;
    void waitUntilVisibleAndIdle(controller.signal)
      .then(async () => {
        // A loop still stopping (an earlier mount of this view) ends first; this one then starts
        // from the server's state, never beside it.
        if (tabLoop) await tabLoop;
        if (controller.signal.aborted) return;
        begun = true;
        return prepare("automatic", latestTargets.current);
      })
      .catch(() => undefined);
    // A wait that is stopped before anything was sent (the effect re-running, as React's strict
    // development mode does on mount) leaves the one automatic start available to the next run.
    return () => {
      controller.abort();
      if (!begun) started.current = false;
    };
  }, [automaticStart?.enabled, canPrepare, rehearsal, sourceCurrent, targetKey, prepare]);

  async function changeSetting() {
    if (!automaticStart || settingBusy) return;
    setSettingBusy(true);
    setSettingNotice("");
    try {
      const response = await fetchWithDeadline("/api/lease-renewal/kickoff-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: !automaticStart.enabled,
          expectedVersion: automaticStart.version,
          reason: reason.trim(),
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setSettingNotice(body?.error ?? "The setting was not changed.");
        return;
      }
      setConfirming(false);
      setReason("");
      setSettingNotice(
        automaticStart.enabled
          ? "Automatic preparation is off. Prepare this batch still runs it when chosen."
          : "Automatic preparation is on.",
      );
      router.refresh();
    } catch {
      setSettingNotice(
        "The response did not arrive. Read the setting again before changing it.",
      );
    } finally {
      setSettingBusy(false);
    }
  }

  const busy = run.phase === "running";
  const allowanceStops = outcomes.filter((entry) => entry.status === "allowance_reached");
  return (
    <section
      aria-label="Batch preparation"
      className="ui-stack-tight renewal-batch-preparation"
      data-kickoff-automatic={automaticStart?.enabled ? "on" : "off"}
      data-kickoff-source-current={sourceCurrent ? "true" : "false"}
      data-kickoff-targets={targets.length}
    >
      <p className="muted renewal-batch-note">
        {targets.length === 0
          ? "Every lease in this batch has its comparison stored for this cycle."
          : `${targets.length} ${targets.length === 1 ? "lease has" : "leases have"} no stored comparison yet.`}{" "}
        {automaticStart?.enabled
          ? "Preparation starts by itself when a staff member opens this batch, at most once per lease each cycle and within the monthly allowance."
          : "Automatic preparation is off; choose Prepare this batch to run it."}
      </p>
      <div className="ui-row">
        {canPrepare ? (
          <Button
            busy={busy}
            busyLabel="Preparing…"
            data-kickoff-prepare
            disabled={busy || targets.length === 0}
            onClick={() => void prepare("staff", targets)}
            size="compact"
            variant="secondary"
          >
            {KICKOFF_WORDS.prepareBatch}
          </Button>
        ) : null}
        {automaticStart?.canChange ? (
          <Button
            onClick={(event) => {
              confirmTrigger.current = event.currentTarget;
              setConfirming(true);
            }}
            size="compact"
            variant="tertiary"
          >
            {automaticStart.enabled
              ? "Turn automatic preparation off"
              : "Turn automatic preparation on"}
          </Button>
        ) : null}
      </div>
      {run.phase === "running" ? (
        <p data-kickoff-progress role="status">
          Preparing {run.index} of {run.total}: {run.address}
        </p>
      ) : null}
      {run.phase === "done" ? (
        <p data-kickoff-progress role="status">
          {run.stoppedAtAllowance
            ? `Preparation stopped: ${KICKOFF_WORDS.allowanceReached}. ${allowanceStops.length} ${allowanceStops.length === 1 ? "lease reads" : "leases read"} it and can take your own figures.`
            : "Preparation finished for this batch."}
        </p>
      ) : null}
      {outcomes.length > 0 ? (
        <ul
          aria-label="Preparation results"
          className="renewal-batch-preparation-results"
        >
          {outcomes.map((entry) => (
            <li
              data-kickoff-outcome={entry.status}
              key={`${entry.leaseId}:${entry.status}`}
            >
              {entry.address}: {entry.message}
            </li>
          ))}
        </ul>
      ) : null}
      {settingNotice ? <p role="status">{settingNotice}</p> : null}
      <ConfirmationDialog
        busy={settingBusy}
        busyLabel="Saving…"
        confirmDisabled={!reason.trim()}
        error={confirming && settingNotice ? settingNotice : undefined}
        confirmLabel={
          automaticStart?.enabled
            ? "Turn automatic preparation off"
            : "Turn automatic preparation on"
        }
        description={
          automaticStart?.enabled
            ? "With it off, no comparison starts unless a staff member chooses Prepare this batch or runs a lease's own comparison."
            : "With it on, opening the working batch starts the existing comparison for each lease with none stored, once per lease each cycle and within the monthly allowance."
        }
        onCancel={() => setConfirming(false)}
        onConfirm={() => void changeSetting()}
        open={confirming}
        title="Change automatic preparation?"
        triggerRef={confirmTrigger}
      >
        <label htmlFor="renewal-kickoff-setting-reason">Why this changes</label>
        <input
          id="renewal-kickoff-setting-reason"
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </ConfirmationDialog>
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!canPrepare) return null;
  async function run() {
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
