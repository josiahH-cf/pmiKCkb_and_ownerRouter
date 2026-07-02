import { redirect } from "next/navigation";

// Reconciliation queue items persist direct_link = /lease-renewal/runs/{runId}/reconciliation/
// {fieldKey}, but the flag's evidence + resolve control live on the run page — so this route 404ed
// and every persisted deep link dead-ended (S13 C1). Redirect to the run page with ?flag= so the
// page scrolls to and highlights that flag. Kept as a route (not a rewrite) so PERSISTED links in
// Firestore keep resolving forever without a data migration.
export default async function ReconciliationDeepLinkPage({
  params,
}: {
  params: Promise<{ runId: string; fieldKey: string }>;
}) {
  const { runId, fieldKey } = await params;
  redirect(
    `/lease-renewal/runs/${encodeURIComponent(runId)}?flag=${encodeURIComponent(fieldKey)}`,
  );
}
