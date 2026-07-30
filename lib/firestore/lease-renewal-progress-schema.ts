export const LEASE_RENEWAL_PROGRESS_COLLECTIONS = {
  progress: "lease_renewal_progress",
  progressActivity: "lease_renewal_progress_activity",
} as const;

/** Deterministic, Firestore-safe doc id derived from the canonical RentVine lease id. */
export function progressDocId(leaseId: string): string {
  return leaseId.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}
