// Verification identities retain their existing displayed role. This is a server effect boundary,
// derived from verified session identity, and never grants or changes a Firebase claim.
const CANARY_EMAILS = new Set([
  "canary-admin@pmikcmetro.com",
  "canary-editor@pmikcmetro.com",
]);

export function isVerificationAccount(user: { email: string }) {
  return CANARY_EMAILS.has(user.email.trim().toLowerCase());
}

const READ_POSTS = new Set([
  "POST /api/assistant/query",
  "POST /api/ask/live-target",
  "POST /api/maintenance/match-unit",
]);
const SESSION_OPERATIONS = new Set([
  "POST /api/auth/session",
  "DELETE /api/auth/session",
  "POST /api/auth/demo",
]);

export function allowsVerificationRequest(input: {
  method: string;
  pathname: string;
  searchParams: Pick<URLSearchParams, "get">;
}) {
  const method = input.method.toUpperCase();
  const key = `${method} ${input.pathname}`;
  if (SESSION_OPERATIONS.has(key)) return true;
  // These GET operations persist connector or execution state despite their HTTP verb.
  if (input.pathname === "/api/connections/dotloop/callback") return false;
  if (
    input.pathname === "/api/lease-renewal/comp-screenshot" &&
    input.searchParams.get("operation") === "reconcile"
  )
    return false;
  return ["GET", "HEAD", "OPTIONS"].includes(method) || READ_POSTS.has(key);
}
