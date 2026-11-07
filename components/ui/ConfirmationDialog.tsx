"use client";

import {
  useEffect,
  useCallback,
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
  startWithReview = false,
  error,
  onCancel,
  onConfirm,
  triggerRef,
  fallbackFocusRef,
  onAfterClose,
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
  /** Keep the top of a long exact review in view when it opens. */
  startWithReview?: boolean;
  error?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
  /** A usable continuation when the original trigger is disabled or removed by the outcome. */
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  /** Runs after ordinary focus restoration, for a failed operation's actual input recovery. */
  onAfterClose?: () => void;
}>) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // The continuation can appear only after the operation, so read it when closing.
  const currentFallback = useCallback(
    () => fallbackFocusRef?.current,
    [fallbackFocusRef],
  );
  const focusDialog = useCallback(
    (opening: boolean) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (startWithReview && dialog.scrollHeight > dialog.clientHeight) {
        if (opening) dialog.scrollTop = 0;
        dialog.focus({ preventScroll: true });
      } else if (cancelRef.current && !cancelRef.current.disabled) {
        cancelRef.current.focus();
      } else {
        dialog.focus();
      }
    },
    [startWithReview],
  );

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      triggerRef?.current ?? (document.activeElement as HTMLElement);
    dismissNonModalTransientLayers();
    focusDialog(true);
    return () => {
      queueMicrotask(() => {
        const usable = (element: HTMLElement | null | undefined) =>
          element?.isConnected &&
          element !== document.body &&
          !element.matches(':disabled, [aria-disabled="true"]') &&
          !element.closest(
            '[hidden], [inert], [data-renewal-focus-hidden], [aria-hidden="true"]',
          );
        const previous = previousFocusRef.current;
        const target = usable(previous) ? previous : currentFallback();
        if (usable(target)) target?.focus();
        onAfterClose?.();
      });
    };
  }, [open, triggerRef, currentFallback, focusDialog, onAfterClose]);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const active = document.activeElement;
    if (
      active === dialogRef.current ||
      !dialogRef.current.contains(active) ||
      active?.matches(":disabled")
    ) {
      focusDialog(false);
    }
  }, [open, busy, focusDialog]);

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
    if (!focusable.includes(document.activeElement as HTMLElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
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
