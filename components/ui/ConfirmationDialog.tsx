"use client";

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { dismissNonModalTransientLayers } from "@/lib/ui/transient-layer";
import { Button } from "./Button";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function ConfirmationDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  busyLabel,
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  busy = false,
  confirmDisabled = false,
  error,
  onCancel,
  onConfirm,
  triggerRef,
}: Readonly<{
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "destructive";
  busy?: boolean;
  confirmDisabled?: boolean;
  error?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
}>) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      triggerRef?.current ?? (document.activeElement as HTMLElement);
    dismissNonModalTransientLayers();
    cancelRef.current?.focus();
    return () => {
      queueMicrotask(() => previousFocusRef.current?.focus());
    };
  }, [open, triggerRef]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      if (!busy) {
        event.preventDefault();
        onCancel();
      }
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    );
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="ui-dialog-backdrop"
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        aria-busy={busy || undefined}
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="panel ui-confirmation-dialog"
        onKeyDown={onKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {description ? <div id={descriptionId}>{description}</div> : null}
        {children}
        {error ? (
          <div className="ui-dialog-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="ui-dialog-actions">
          <Button disabled={busy} onClick={onCancel} ref={cancelRef} variant="secondary">
            {cancelLabel}
          </Button>
          <Button
            busy={busy}
            busyLabel={
              busyLabel ??
              (confirmLabel.match(/^Confirm\s+/i)
                ? confirmLabel.replace(/^Confirm\s+/i, "Confirming ")
                : `Working: ${confirmLabel}`)
            }
            disabled={confirmDisabled}
            onClick={onConfirm}
            variant={confirmVariant}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
