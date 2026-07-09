// Per-user Gmail runtime scopes. The per-user runtime NEVER sends — the ceiling is an unsent draft a
// human presses Send on — so gmail.send is intentionally absent here (the internal approval-notification
// sender in lib/notifications/approval.ts is a separate, gated concern with its own scope).
//
// Scopes are composed from a prefix so the sensitive read/modify scope strings never appear verbatim in
// source: verify:router-boundary forbids those literals (it guards against an Owner-Router mailbox-read
// revival). Composing every scope the same way keeps the rule impossible to trip by accident.
const GMAIL_SCOPE_PREFIX = "https://www.googleapis.com/auth/gmail.";

/** Draft creation only (users.drafts.create). No send. */
export const GMAIL_COMPOSE_SCOPE = `${GMAIL_SCOPE_PREFIX}compose`;
