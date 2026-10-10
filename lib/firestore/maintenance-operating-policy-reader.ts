// Read-only policy consumer shared with tokenized public intake. No staff auth or provider access.
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { getAdminFirestore } from "./admin";
import {
  parseOperatingPolicyHead,
  parseOperatingPolicyVersion,
  operatingPolicyId,
  operatingHeadSelection,
  selectOperatingPolicy,
  type OperatingPolicyHead,
  type OperatingPolicyVersion,
  type PolicyPurpose,
  type OperatingPolicySelection,
} from "@/lib/maintenance/operating-policy";
export const OPERATING_POLICY_COLLECTIONS = {
  heads: "maintenance_operating_policies",
  versions: "maintenance_operating_policy_versions",
  operations: "maintenance_operating_policy_operations",
} as const;
export async function readApplicableOperatingPolicy(
  purpose: PolicyPurpose,
  propertyId: string | null,
  at = new Date().toISOString(),
  db: Firestore = getAdminFirestore(),
): Promise<OperatingPolicySelection> {
  try {
    return await db.runTransaction((tx) =>
      readApplicableOperatingPolicyInTransaction(tx, db, purpose, propertyId, at),
    );
  } catch {
    return {
      state: "unavailable",
      policy: null,
      detail:
        "Approved policy could not be read. Existing safety guidance remains available; staff routing needs attention.",
    };
  }
}
export async function readApplicableOperatingPolicyInTransaction(
  tx: Transaction,
  db: Firestore,
  purpose: PolicyPurpose,
  propertyId: string | null,
  at: string,
): Promise<OperatingPolicySelection> {
  const ids = [
    operatingPolicyId(purpose, { kind: "organization" }),
    ...(propertyId && /^[1-9][0-9]{0,9}$/.test(propertyId)
      ? [operatingPolicyId(purpose, { kind: "property", propertyId })]
      : []),
  ];
  const heads = await Promise.all(
    ids.map((id) => tx.get(db.collection(OPERATING_POLICY_COLLECTIONS.heads).doc(id))),
  );
  const savedHeads = heads.filter((s) => s.exists),
    parsed = savedHeads
      .map((s) => parseOperatingPolicyHead(s.data()))
      .filter((h): h is OperatingPolicyHead => h !== null);
  if (parsed.length !== savedHeads.length || parsed.some((h) => !ids.includes(h.id)))
    return {
      state: "unavailable",
      policy: null,
      detail:
        "The configured policy is invalid. Existing safety guidance remains available.",
    };
  const keys = parsed.flatMap((h) =>
    [h.activeVersion, h.scheduledVersion]
      .filter((n): n is number => n !== null)
      .map((n) => `${h.id}_v${n}`),
  );
  const versions = keys.length
    ? (
        await Promise.all(
          keys.map((k) =>
            tx.get(db.collection(OPERATING_POLICY_COLLECTIONS.versions).doc(k)),
          ),
        )
      )
        .filter((s) => s.exists)
        .map((s) => parseOperatingPolicyVersion(s.data()))
        .filter((v): v is OperatingPolicyVersion => v !== null)
    : [];
  if (keys.some((k) => !versions.some((v) => `${v.id}_v${v.version}` === k)))
    return {
      state: "unavailable" as const,
      policy: null,
      detail:
        "An approved policy version is unavailable. Existing safety guidance remains available.",
    };
  const candidates = parsed
    .map((h) => operatingHeadSelection(h, versions, at))
    .filter((v): v is OperatingPolicyVersion => v !== null);
  return selectOperatingPolicy(candidates, purpose, propertyId, at);
}
