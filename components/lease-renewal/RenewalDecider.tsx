"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { RenewalDeciderCard } from "@/components/lease-renewal/RenewalDeciderCard";
import type { DecisionReasonCode } from "@/lib/lease-renewal/reason-codes";
import type { RenewalFlagView, RenewalRunView } from "@/lib/lease-renewal/run-view";

interface ProgressView {
  source_trigger_key: string;
  status: "Deferred" | "Seen";
}

function sessionProgressKey(runId: string): string {
  return `renewal-decider:${runId}:deferred`;
}

function readSessionDeferredKeys(runId: string): ReadonlySet<string> {
  try {
    const value = window.sessionStorage.getItem(sessionProgressKey(runId));
    const parsed = value ? (JSON.parse(value) as unknown) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeSessionDeferredKeys(runId: string, keys: ReadonlySet<string>): void {
  try {
    window.sessionStorage.setItem(sessionProgressKey(runId), JSON.stringify([...keys]));
  } catch {
    // Firestore remains the audit record; unavailable browser storage only removes session hiding.
  }
}

function stillNeedsDecision(flag: RenewalFlagView): boolean {
  if (!flag.resolution || flag.resolution.status === "Open") return true;
  return Boolean(flag.writebackApproval && flag.writebackApproval.state !== "Approved");
}

interface RenewalDeciderProps {
  view: RenewalRunView;
  canResolve: boolean;
  canDefer: boolean;
  isAdmin: boolean;
}

/** One-card-at-a-time pager over the existing severity-ordered run view. */
export function RenewalDecider(props: Readonly<RenewalDeciderProps>) {
  return <RenewalDeciderRun key={props.view.runId} {...props} />;
}

function RenewalDeciderRun({
  view,
  canResolve,
  canDefer,
  isAdmin,
}: Readonly<RenewalDeciderProps>) {
  const router = useRouter();
  const [position, setPosition] = useState(0);
  const [deferredKeys, setDeferredKeys] = useState<ReadonlySet<string>>(new Set());
  const [completedKeys, setCompletedKeys] = useState<ReadonlySet<string>>(new Set());
  const [pendingFollowOns, setPendingFollowOns] = useState<
    ReadonlyMap<string, DecisionReasonCode>
  >(new Map());
  const [progressError, setProgressError] = useState<string | null>(null);
  const [progressRunId, setProgressRunId] = useState<string | null>(null);
  const [skippingKey, setSkippingKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadProgress() {
      try {
        const response = await fetch(
          `/api/lease-renewal/decider-progress?run_id=${encodeURIComponent(view.runId)}`,
        );
        if (!response.ok) throw new Error("progress unavailable");
        const body = (await response.json()) as { progress?: ProgressView[] };
        if (!active) return;
        const persisted = new Set(
          (body.progress ?? [])
            .filter((entry) => entry.status === "Deferred")
            .map((entry) => entry.source_trigger_key),
        );
        const thisSession = readSessionDeferredKeys(view.runId);
        setDeferredKeys(new Set([...persisted].filter((key) => thisSession.has(key))));
        setProgressError(null);
      } catch {
        if (active) {
          setDeferredKeys(new Set());
          setProgressError(
            "Saved skip progress could not be loaded. You can still decide items.",
          );
        }
      } finally {
        if (active) setProgressRunId(view.runId);
      }
    }
    void loadProgress();
    return () => {
      active = false;
    };
  }, [view.runId]);

  const flags = useMemo(
    () =>
      view.groups
        .flatMap((group) => group.flags)
        .filter(
          (flag) =>
            stillNeedsDecision(flag) &&
            !deferredKeys.has(flag.sourceTriggerKey) &&
            !completedKeys.has(flag.sourceTriggerKey),
        ),
    [completedKeys, deferredKeys, view.groups],
  );
  const currentIndex = flags.length === 0 ? 0 : Math.min(position, flags.length - 1);
  const currentFlag = flags[currentIndex] ?? null;

  async function skip(flag: RenewalFlagView) {
    if (!canDefer) return;
    setSkippingKey(flag.sourceTriggerKey);
    setProgressError(null);
    try {
      const response = await fetch("/api/lease-renewal/decider-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: view.runId,
          source_trigger_key: flag.sourceTriggerKey,
          status: "Deferred",
        }),
      });
      if (!response.ok) throw new Error("progress write failed");
      setDeferredKeys((previous) => {
        const next = new Set(previous).add(flag.sourceTriggerKey);
        writeSessionDeferredKeys(view.runId, next);
        return next;
      });
    } catch {
      setProgressError("Skip could not be saved. This item is still in your list.");
    } finally {
      setSkippingKey(null);
    }
  }

  function complete(flag: RenewalFlagView) {
    setCompletedKeys((previous) => new Set(previous).add(flag.sourceTriggerKey));
    setPendingFollowOns((previous) => {
      const next = new Map(previous);
      next.delete(flag.sourceTriggerKey);
      return next;
    });
    router.refresh();
  }

  function queueFollowOn(flag: RenewalFlagView, reasonCode: DecisionReasonCode) {
    setPendingFollowOns((previous) =>
      new Map(previous).set(flag.sourceTriggerKey, reasonCode),
    );
    router.refresh();
  }

  if (progressRunId !== view.runId) {
    return (
      <section aria-label="Renewal decider" className="panel lr-decider">
        <p className="muted">Loading your renewal review progress...</p>
      </section>
    );
  }

  if (!currentFlag) {
    return (
      <section aria-label="Renewal decider" className="panel lr-decider">
        <h2 className="section-subtitle">You are caught up</h2>
        <p className="muted">No open renewal flags remain in this review.</p>
        {progressError ? <p className="lr-error">{progressError}</p> : null}
      </section>
    );
  }

  return (
    <section aria-label="Renewal decider" className="panel lr-decider">
      <div className="lr-decider-progress">
        <strong aria-live="polite">
          {currentIndex + 1} of {flags.length}
        </strong>
        <span className="muted">One decision at a time</span>
      </div>

      <RenewalDeciderCard
        canDefer={canDefer}
        canResolve={canResolve}
        flag={currentFlag}
        isAdmin={isAdmin}
        key={currentFlag.sourceTriggerKey}
        manifest={view.manifest}
        onComplete={() => complete(currentFlag)}
        onFollowOnQueued={(reasonCode) => queueFollowOn(currentFlag, reasonCode)}
        onSkip={() => void skip(currentFlag)}
        optimisticFollowOnReasonCode={pendingFollowOns.get(currentFlag.sourceTriggerKey)}
        runId={view.runId}
        skipping={skippingKey === currentFlag.sourceTriggerKey}
      />

      <div className="lr-decider-pager">
        <button
          className="secondary-button"
          disabled={currentIndex === 0}
          onClick={() => setPosition((value) => Math.max(0, value - 1))}
          type="button"
        >
          Back
        </button>
        <button
          className="secondary-button"
          disabled={currentIndex >= flags.length - 1}
          onClick={() => setPosition((value) => Math.min(flags.length - 1, value + 1))}
          type="button"
        >
          Next
        </button>
      </div>
      {progressError ? <p className="lr-error">{progressError}</p> : null}
    </section>
  );
}
