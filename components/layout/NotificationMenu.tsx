"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ApprovalQueueNotificationRecord } from "@/lib/firestore/types";

type NotificationState = "idle" | "loading" | "ready" | "error";

export function NotificationMenu({
  navigate = (url) => window.location.assign(url),
}: Readonly<{ navigate?: (url: string) => void }>) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<ApprovalQueueNotificationRecord[]>(
    [],
  );
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

  useEffect(() => {
    void loadNotifications();
  }, []);

  async function loadNotifications() {
    setState(hasLoaded.current ? "ready" : "loading");

    try {
      const response = await fetch(
        "/api/approval-queue/notifications?mine_only=true&unread_only=true&limit=5",
      );
      const payload = await readJsonResponse<{
        notifications: ApprovalQueueNotificationRecord[];
      }>(response);

      setNotifications(payload.notifications);
      setState("ready");
      setMessage(
        payload.notifications.length > 0
          ? "Queue notifications loaded."
          : "No queue notifications need your attention.",
      );
      hasLoaded.current = true;
    } catch (error) {
      setState("error");
      setMessage(readErrorMessage(error));
    }
  }

  async function openNotification(notification: ApprovalQueueNotificationRecord) {
    const targetUrl = `/approval-queue?item_id=${encodeURIComponent(notification.item_id)}`;

    try {
      await fetch(
        `/api/approval-queue/notifications/${encodeURIComponent(notification.id)}`,
        {
          body: JSON.stringify({ action: "mark_read" }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
      );
    } catch {
      // Opening the queue item is more important than blocking on read-state cleanup.
    }

    navigate(targetUrl);
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
        <section className="notification-popover" aria-label="Queue notifications">
          <div className="notification-popover-header">
            <strong>Queue Notifications</strong>
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
            <p className="muted">No queue notifications need your attention.</p>
          ) : null}
          {notifications.length > 0 ? (
            <ol className="notification-list">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    className="notification-item"
                    onClick={() => void openNotification(notification)}
                    type="button"
                  >
                    <strong>{notification.title}</strong>
                    <span>{notification.message}</span>
                    <small>
                      {notification.process_run_ref.label} - {notification.risk}
                      {notification.due_date ? ` - Due ${notification.due_date}` : ""}
                    </small>
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
          <a className="notification-all-link" href="/approval-queue">
            Open Approval Queue
          </a>
        </section>
      ) : null}
    </div>
  );
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Queue notifications are unavailable.");
  }

  return payload as T;
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Queue notifications are unavailable.";
}
