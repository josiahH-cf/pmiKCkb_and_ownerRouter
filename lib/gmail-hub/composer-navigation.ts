export function workflowComposerHref(
  input:
    | { leaseId: string; purpose: "renewal_owner" | "renewal_tenant" }
    | { ticketId: string; purpose: "maintenance_owner" },
) {
  const q = new URLSearchParams({ compose: input.purpose });
  if ("leaseId" in input) q.set("lease", input.leaseId);
  else q.set("ticket", input.ticketId);
  return `/gmail-hub?${q}`;
}
