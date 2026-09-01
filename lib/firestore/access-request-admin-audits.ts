import type { NormalizedAccess } from "@/lib/access/contracts";
import { getAdminFirestore } from "@/lib/firestore/admin";

export interface AccessRequestAdminAuditV1 {
  readonly schema_version: "access-request-admin-audit-v1";
  readonly audit_ref: string;
  readonly request_id: string;
  readonly request_version: number;
  readonly execution_id: string;
  readonly reviewer_uid: string;
  readonly requester_uid: string;
  readonly previous_access: NormalizedAccess;
  readonly target_access: NormalizedAccess;
  readonly current_claim_fingerprint: string;
  readonly unrelated_claim_fingerprint: string;
  readonly created_at: string;
}

export async function recordAccessRequestAdminAudit(record: AccessRequestAdminAuditV1) {
  await getAdminFirestore()
    .collection("access_request_admin_audits")
    .doc(record.audit_ref)
    .create(record);
}
