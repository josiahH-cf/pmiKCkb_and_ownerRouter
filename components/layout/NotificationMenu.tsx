"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  NotificationFamilyKey,
  NotificationFamilyView,
  UnifiedNotification,
} from "@/lib/notifications/families";

type NotificationState = "idle" | "loading" | "ready" | "error";

export function NotificationMenu({
  navigate = (url) => window.location.assign(url),
}: Readonly<{ navigate?: (url: string) => void }>) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);
  const [families, setFamilies] = useState<NotificationFamilyView[]>([]);
  const [state, setState] = useState<NotificationState>("idle");
  const [message, setMessage] = useState("Loading notifications.");
  const hasLoaded = useRef(false);
  const unreadCount = notifications.filter(
    (notification) => !notification.read_at,
  ).length;
  const buttonLabel = useMemo(
    () => (unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"),
    [unreadCount],
  );
  const canOpenApprovalQueue = families.some(
    (family) => family.key === "approval_queue" && family.available,
  );

  useEffect(() => {
    void loadNotifications();
  }, []);

  async function loadNotifications() {
    setState(hasLoaded.current ? "ready" : "loading");

    try {
      const response = await fetch("/api/notifications?unread_only=true&limit=8");
      const payload = await readJsonResponse<{
        notifications: UnifiedNotification[];
        families: NotificationFamilyView[];
      }>(response);

      setNotifications(payload.notifications);
      setFamilies(payload.families);
      setState("ready");
      setMessage(
        payload.notifications.length > 0
          ? "Notifications loaded."
          : "No notifications need your attention.",
      );
      hasLoaded.current = true;
    } catch (error) {
      setState("error");
      setMessage(readErrorMessage(error));
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
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST" });
      await loadNotifications();
    } catch {
      // Mark-all-read is best-effort; a failure leaves the current view unchanged.
    }
  }

  async function toggleMute(familyKey: NotificationFamilyKey) {
    const nextMuted = families
      .filter((family) => family.available)
      .filter((family) => (family.key === familyKey ? !family.muted : family.muted))
      .map((family) => family.key);

    try {
      await fetch("/api/notifications/preferences", {
        body: JSON.stringify({ muted_families: nextMuted }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadNotifications();
    } catch {
      // Muting is best-effort; a failure leaves the current view unchanged.
    }
  }

  return (
    <div className="notification-menu">
      <button
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="notification-button"
        onClick={() => {
          const nextIsOpen = !isOpen;
          setIsOpen(nextIsOpen);
          if (nextIsOpen && state === "error") {
            void loadNotifications();
          }
        }}
        type="button"
      >
        <span>{buttonLabel}</span>
        {unreadCount > 0 ? (
          <span className="notification-badge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>
      {isOpen ? (
        <section className="notification-popover" aria-label="Notifications">
          <div className="notification-popover-header">
            <strong>Notifications</strong>
            <button
              className="notification-refresh"
              disabled={state === "loading"}
              onClick={() => void loadNotifications()}
              type="button"
            >
              Refresh
            </button>
          </div>
          {state === "loading" ? <p className="muted">Loading notifications.</p> : null}
          {state === "error" ? <p className="muted">{message}</p> : null}
          {state === "ready" && notifications.length === 0 ? (
            <p className="muted">No notifications need your attention.</p>
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
            <div className="notification-families">
              <strong>Notification types</strong>
              <ul className="notification-family-list">
                {families.map((family) =>
                  family.available ? (
                    <li key={family.key}>
                      <label className="notification-family">
                        <input
                          checked={!family.muted}
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
            </div>
          ) : null}
          <div className="notification-popover-actions">
            {unreadCount > 0 ? (
              <button
                className="notification-mark-all"
                onClick={() => void markAllRead()}
                type="button"
              >
                Mark all read
              </button>
            ) : null}
            <a className="notification-all-link" href="/notifications">
              See all notifications
            </a>
            {canOpenApprovalQueue ? (
              <a className="notification-all-link" href="/approval-queue">
                Open Approval Queue
              </a>
            ) : null}
          </div>
        </section>
      ) : null}
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
