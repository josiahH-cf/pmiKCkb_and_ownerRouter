// S19 per-user Gmail scopes. Google documents gmail.compose as draft-and-send capable; the no-autonomous-
// send boundary is therefore code/action/confirmation/audit policy, not a scope claim. Read and compose
// remain split so read methods never receive compose authority and send methods never require modify.
const GMAIL_SCOPE_PREFIX = "https://www.googleapis.com/auth/gmail.";

/** Bounded mailbox/profile/thread/history/watch reads. No label mutation or send authority. */
export const GMAIL_READONLY_SCOPE = `${GMAIL_SCOPE_PREFIX}readonly`;

/** Draft creation plus explicit human-confirmed send; Google defines this scope as send-capable. */
export const GMAIL_COMPOSE_SCOPE = `${GMAIL_SCOPE_PREFIX}compose`;

/** Create and inspect user labels. */
export const GMAIL_LABELS_SCOPE = `${GMAIL_SCOPE_PREFIX}labels`;

/** Apply or remove labels and perform other bounded mailbox mutations. */
export const GMAIL_MODIFY_SCOPE = `${GMAIL_SCOPE_PREFIX}modify`;

/** Exact four-scope set shared by the internal DWD and separately consented Vendor OAuth lanes. */
export const GMAIL_APPROVED_WORKFLOW_SCOPES = Object.freeze([
  GMAIL_READONLY_SCOPE,
  GMAIL_COMPOSE_SCOPE,
  GMAIL_LABELS_SCOPE,
  GMAIL_MODIFY_SCOPE,
] as const);
