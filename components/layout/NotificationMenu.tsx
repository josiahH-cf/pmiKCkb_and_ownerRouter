"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ActionLink, Button, Disclosure, Notice } from "@/components/ui";
import {
  activateTransientLayer,
  dismissTransientLayerDescendants,
  registerTransientLayer,
} from "@/lib/ui/transient-layer";
import type {
  NotificationFamilyKey,
  NotificationFamilyView,
  UnifiedNotification,
} from "@/lib/notifications/families";

type NotificationState = "idle" | "loading" | "ready" | "error";
type NotificationOperation = "refresh" | "mark-all" | `mute:${NotificationFamilyKey}`;
type RetryOperation =
  | { kind: "refresh" }
  | { kind: "mark-all" }
  | { kind: "mute"; familyKey: NotificationFamilyKey };
type NotificationLoadResult = { ok: true } | { ok: false; message: string };
type NotificationLoader = (
  mode?: "background" | "manual" | "reconcile",
) => Promise<NotificationLoadResult>;

// NOTIF-1: background poll cadence so the bell's unread count stays fresh without a manual click.
const NOTIFICATION_REFRESH_MS = 60_000;

export function NotificationMenu({
  navigate = (url) => window.location.assign(url),
}: Readonly<{ navigate?: (url: string) => void }>) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);
  const [families, setFamilies] = useState<NotificationFamilyView[]>([]);
  const [state, setState] = useState<NotificationState>("idle");
  const [message, setMessage] = useState("Loading notifications.");
  const [pendingOperation, setPendingOperation] = useState<NotificationOperation | null>(
    null,
  );
  const [failure, setFailure] = useState<{
    message: string;
    retry: RetryOperation;
  } | null>(null);
  const layerId = `notifications:${useId()}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const hasLoaded = useRef(false);
  const loadNotificationsRef = useRef<NotificationLoader | null>(null);
  const pendingOperationRef = useRef<NotificationOperation | null>(null);
  // LR-01: the badge/title count comes from the server's uncapped unread TOTAL, not the capped preview
  // list, so it stays accurate (and can exceed the preview length) instead of maxing out at the fetch
  // limit. The preview list below still shows only the first few rows.
  const [unreadCount, setUnreadCount] = useState(0);
  const buttonLabel = useMemo(
    () => (unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"),
    [unreadCount],
  );
  const canOpenApprovalQueue = families.some(
    (family) => family.key === "approval_queue" && family.available,
  );

  useEffect(() => {
    loadNotificationsRef.current = loadNotifications;
  });

  useEffect(
    () =>
      registerTransientLayer({
        id: layerId,
        family: "notifications",
        close: () => setIsOpen(false),
      }),
    [layerId],
  );

  useEffect(() => {
    void loadNotificationsRef.current?.("background");
  }, []);

  // NOTIF-1 (§P): auto-refresh the bell — poll on an interval and refresh when the tab regains
  // focus/visibility, so the unread count updates without a manual click. The event-log GET is
  // lightweight and makes no external calls.
  useEffect(() => {
    const interval = setInterval(() => {
      void loadNotificationsRef.current?.();
    }, NOTIFICATION_REFRESH_MS);
    function refreshOnVisible() {
      if (document.visibilityState === "visible") {
        void loadNotificationsRef.current?.();
      }
    }
    document.addEventListener("visibilitychange", refreshOnVisible);
    window.addEventListener("focus", refreshOnVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOnVisible);
      window.removeEventListener("focus", refreshOnVisible);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    queueMicrotask(() => {
      popoverRef.current
        ?.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    });

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !popoverRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        dismissTransientLayerDescendants(layerId);
        setIsOpen(false);
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !popoverRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        dismissTransientLayerDescendants(layerId);
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismissTransientLayerDescendants(layerId);
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, layerId]);

  // NOTIF-4 (§P): reflect unread notifications in the browser tab title, so the badge is visible
  // even when the app is a background tab. Strips any existing "(N) " prefix so it never stacks;
  // clears when nothing is unread. (The PMI favicon-dot overlay waits on owner-supplied artwork.)
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s+/, "");
    document.title = unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
  }, [unreadCount]);

  async function loadNotifications(
    mode: "background" | "manual" | "reconcile" = "background",
  ): Promise<NotificationLoadResult> {
    if (mode === "manual") {
      if (!beginOperation("refresh")) {
        return { ok: false, message: "Another update is pending." };
      }
      setFailure(null);
      setMessage("Refreshing notifications.");
    }
    if (!hasLoaded.current) setState("loading");

    try {
      const response = await fetch("/api/notifications?unread_only=true&limit=8");
      const payload = await readJsonResponse<{
        notifications: UnifiedNotification[];
        families: NotificationFamilyView[];
        unreadTotal?: number;
      }>(response);

      setNotifications(payload.notifications);
      setFamilies(payload.families);
      // Prefer the server's uncapped total; fall back to the preview list only if an older payload omits
      // it, so the badge never silently reads NaN.
      setUnreadCount(
        typeof payload.unreadTotal === "number"
          ? payload.unreadTotal
          : payload.notifications.filter((notification) => !notification.read_at).length,
      );
      setState("ready");
      if (mode !== "reconcile") {
        setMessage(
          mode === "manual"
            ? "Notifications refreshed."
            : payload.notifications.length > 0
              ? "Notifications loaded."
              : "No unread event notifications.",
        );
      }
      hasLoaded.current = true;
      return { ok: true };
    } catch (error) {
      const errorMessage = readErrorMessage(error);
      setState("error");
      if (mode !== "reconcile") {
        setMessage(errorMessage);
        setFailure({ message: errorMessage, retry: { kind: "refresh" } });
      }
      return { ok: false, message: errorMessage };
    } finally {
      if (mode === "manual") endOperation();
    }
  }

  async function openNotification(notification: UnifiedNotification) {
    try {
      await fetch("/api/notifications/mark-read", {
        body: JSON.stringify({ source: notification.source, id: notification.id }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
    } catch {
      // Opening the linked item is more important than blocking on read-state cleanup.
    }

    navigate(notification.href);
  }

  async function markAllRead() {
    if (!beginOperation("mark-all")) return;
    setFailure(null);
    setMessage("Marking all notifications read.");
    try {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });
      await readJsonResponse(response);
      const reconciled = await loadNotifications("reconcile");
      if (!reconciled.ok) {
        const message =
          "The request completed, but current notification state could not be reloaded. Refresh to reconcile.";
        setMessage(message);
        setFailure({ message, retry: { kind: "refresh" } });
        return;
      }
      setMessage("All notifications marked read.");
    } catch (error) {
      const errorMessage = readErrorMessage(error);
      setMessage(errorMessage);
      setFailure({ message: errorMessage, retry: { kind: "mark-all" } });
    } finally {
      endOperation();
    }
  }

  async function toggleMute(familyKey: NotificationFamilyKey) {
    if (!beginOperation(`mute:${familyKey}`)) return;
    const nextMuted = families
      .filter((family) => family.available)
      .filter((family) => (family.key === familyKey ? !family.muted : family.muted))
      .map((family) => family.key);

    const familyLabel =
      families.find((family) => family.key === familyKey)?.label ?? "notification type";
    setFailure(null);
    setMessage(`Updating ${familyLabel}.`);
    try {
      const response = await fetch("/api/notifications/preferences", {
        body: JSON.stringify({ muted_families: nextMuted }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await readJsonResponse(response);
      const reconciled = await loadNotifications("reconcile");
      if (!reconciled.ok) {
        const message =
          "The preference request completed, but current notification state could not be reloaded. Refresh to reconcile.";
        setMessage(message);
        setFailure({ message, retry: { kind: "refresh" } });
        return;
      }
      setMessage(`${familyLabel} preference updated.`);
    } catch (error) {
      const errorMessage = readErrorMessage(error);
      setMessage(errorMessage);
      setFailure({
        message: errorMessage,
        retry: { kind: "mute", familyKey },
      });
    } finally {
      endOperation();
    }
  }

  function retryFailure() {
    const retry = failure?.retry;
    if (!retry || pendingOperationRef.current) return;
    setFailure(null);
    if (retry.kind === "refresh") {
      void loadNotifications("manual");
    } else if (retry.kind === "mark-all") {
      void markAllRead();
    } else {
      void toggleMute(retry.familyKey);
    }
  }

  function beginOperation(operation: NotificationOperation) {
    if (pendingOperationRef.current) return false;
    pendingOperationRef.current = operation;
    setPendingOperation(operation);
    return true;
  }

  function endOperation() {
    pendingOperationRef.current = null;
    setPendingOperation(null);
  }

  return (
    <div className="notification-menu">
      <button
        aria-controls={`${layerId}-panel`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="notification-button"
        onClick={() => {
          const nextIsOpen = !isOpen;
          if (nextIsOpen) {
            activateTransientLayer({ id: layerId, family: "notifications" });
          } else {
            dismissTransientLayerDescendants(layerId);
          }
          setIsOpen(nextIsOpen);
        }}
        ref={triggerRef}
        type="button"
      >
        <span>{buttonLabel}</span>
        {unreadCount > 0 ? (
          <span className="notification-badge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>
      <section
        aria-label="Notifications"
        className="notification-popover"
        hidden={!isOpen}
        id={`${layerId}-panel`}
        ref={popoverRef}
      >
        <div className="notification-popover-header">
          <strong>Notifications</strong>
          <Button
            busy={pendingOperation === "refresh"}
            busyLabel="Refreshing notifications"
            className="notification-refresh"
            disabled={state === "loading" || pendingOperation !== null}
            onClick={() => void loadNotifications("manual")}
            size="compact"
            variant="tertiary"
          >
            Refresh
          </Button>
        </div>
        <p aria-atomic="true" aria-live="polite" className="muted" role="status">
          {failure ? "" : message}
        </p>
        {failure ? (
          <Notice actionLabel="Retry" onAction={retryFailure} tone="error" urgent>
            {failure.message}
          </Notice>
        ) : null}
        {notifications.length > 0 ? (
          <ol className="notification-list">
            {notifications.map((notification) => (
              <li key={`${notification.source}:${notification.id}`}>
                <button
                  className="notification-item"
                  onClick={() => void openNotification(notification)}
                  type="button"
                >
                  <strong>{notification.title}</strong>
                  <span>{notification.message}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}
        {families.length > 0 ? (
          <Disclosure summary="Notification types">
            <ul className="notification-family-list">
              {families.map((family) =>
                family.available ? (
                  <li key={family.key}>
                    <label className="notification-family">
                      <input
                        aria-busy={pendingOperation === `mute:${family.key}` || undefined}
                        checked={!family.muted}
                        disabled={pendingOperation !== null}
                        onChange={() => void toggleMute(family.key)}
                        type="checkbox"
                      />
                      <span>{family.label}</span>
                    </label>
                  </li>
                ) : (
                  <li key={family.key} className="notification-family-stub">
                    <span>
                      {family.label}: {family.unavailableReason}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </Disclosure>
        ) : null}
        <div className="notification-popover-actions">
          {unreadCount > 0 ? (
            <Button
              busy={pendingOperation === "mark-all"}
              busyLabel="Marking all read"
              className="notification-mark-all"
              disabled={pendingOperation !== null}
              onClick={() => void markAllRead()}
              size="compact"
              variant="secondary"
            >
              Mark all read
            </Button>
          ) : null}
          <ActionLink className="notification-all-link" href="/notifications">
            See all notifications
          </ActionLink>
          {canOpenApprovalQueue ? (
            <ActionLink className="notification-all-link" href="/approval-queue">
              Open Approval Queue
            </ActionLink>
          ) : null}
        </div>
      </section>
    </div>
  );
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Notifications are unavailable.");
  }

  return payload as T;
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Notifications are unavailable.";
}
