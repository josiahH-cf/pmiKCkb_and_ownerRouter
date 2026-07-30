/**
 * Canonical action keys for the Gmail Hub runtime.
 *
 * Keep this boundary independent from both the service and its state store so durable
 * post-provider transitions can name the exact gate that governed the attempted effect without
 * creating a service/store import cycle.
 */
export const GMAIL_HUB_ACTIONS = {
  read: "gmail.mailbox.read",
  draft: "gmail.draft.create",
  send: "gmail.message.send",
  reply: "gmail.thread.reply",
  label: "gmail.label.apply",
} as const;

/**
 * Gmail watch creation/renewal is currently governed by the D37 read-only mailbox grant.
 * This is deliberately an alias, not a new semantic action key or an activation change.
 */
export const GMAIL_WATCH_GOVERNING_ACTION_KEY = GMAIL_HUB_ACTIONS.read;
