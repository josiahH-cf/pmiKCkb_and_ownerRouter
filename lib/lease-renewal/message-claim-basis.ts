import { hashExecutionPreview } from "@/lib/execution/preview-hash";
export function workspaceMessageBasisFingerprint(head: Record<string, unknown>) {
  return hashExecutionPreview({
    cycleId: head.cycleId,
    termsRevision: head.termsRevision,
    ownerResponse: head.ownerResponse,
    preparation: head.preparation,
  });
}
export function messageResourceFingerprint(settings: Record<string, unknown> | null) {
  const entries = settings?.entries as Record<string, unknown> | undefined;
  return hashExecutionPreview({
    resources:
      settings === null
        ? null
        : {
            insurance_flyer: entries?.insurance_flyer ?? null,
            renewal_information_form: entries?.renewal_information_form ?? null,
            rbp_flyer: entries?.rbp_flyer ?? null,
          },
  });
}
export interface RenewalMessageClaimBasis {
  workspaceFingerprint: string;
  sourceFingerprint: string;
  resourceFingerprint: string;
  preparationRevision: number;
}
