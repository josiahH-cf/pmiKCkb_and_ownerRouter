"use client";

import { useEffect, useState } from "react";

export function BusyIndicator({
  label,
  delayMs = 400,
  decorative = false,
}: Readonly<{ label: string; delayMs?: number; decorative?: boolean }>) {
  if (delayMs <= 0) return <Indicator decorative={decorative} label={label} />;
  return (
    <DelayedIndicator
      decorative={decorative}
      delayMs={delayMs}
      key={delayMs}
      label={label}
    />
  );
}

function DelayedIndicator({
  label,
  delayMs,
  decorative,
}: Readonly<{ label: string; delayMs: number; decorative: boolean }>) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (!visible) return null;

  return <Indicator decorative={decorative} label={label} />;
}

function Indicator({
  label,
  decorative,
}: Readonly<{ label: string; decorative: boolean }>) {
  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      className="busy-indicator"
      data-testid="busy-indicator"
      role={decorative ? undefined : "status"}
    >
      <span aria-hidden="true" className="busy-indicator-mark" />
      {decorative ? null : <span>{label}</span>}
    </span>
  );
}

export function Progress({
  completed,
  total,
  label,
}: Readonly<{ completed: number; total: number; label: string }>) {
  if (
    !Number.isInteger(completed) ||
    !Number.isInteger(total) ||
    total <= 0 ||
    completed < 0 ||
    completed > total
  ) {
    throw new RangeError("Progress requires an exact integer completed/total pair.");
  }

  return (
    <div className="determinate-progress">
      <progress aria-label={label} max={total} value={completed} />
      <span>
        {completed} of {total}
      </span>
    </div>
  );
}
